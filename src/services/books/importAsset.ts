import type {SQLiteDatabase} from 'expo-sqlite';
import {fileFormat,MAX_IMPORT_BYTES,normalizeText,paginateText} from './text';
import {buildEpubIndex,type EpubIndex} from './epubIndex';
import {countWordOccurrences} from './wordFrequency';
import {classifyImportError} from '../ai/diagnosticsModel';

export type ImportFileLike={
 uri:string;name:string;
 readonly exists:boolean;
 readonly size:number;
 copy(destination:ImportFileLike,options?:{overwrite?:boolean}):void|Promise<void>;
 write(contents:string):void;
 delete():void;
 arrayBuffer():Promise<ArrayBuffer>;
 text():Promise<string>;
};
export type ImportDirectoryLike={
 uri:string;
 readonly exists:boolean;
 create(options?:{intermediates?:boolean;idempotent?:boolean}):void;
 delete():void;
};
export type ImportIo={
 booksDirectory():ImportDirectoryLike;
 file(uri:string):ImportFileLike;
 childFile(parent:ImportDirectoryLike,name:string):ImportFileLike;
 childDirectory(parent:ImportDirectoryLike,name:string):ImportDirectoryLike;
 cacheUri:string;
 uuid():string;
};
export type ImportTraceDetail={
 duration?:number;
 code?:string;
 result?:'success'|'failure'|'cancelled';
 sizeBucket?:'lt1mb'|'1to10mb'|'10to50mb'|'50to128mb'|'over128mb';
 format?:'epub'|'txt';
};
export type ImportTrace=(event:'import-stage'|'import-index-failure'|'import-failure'|'import-complete',stage:string,detail?:ImportTraceDetail)=>void;

function sizeBucket(bytes:number):NonNullable<ImportTraceDetail['sizeBucket']>{
 return bytes<1_000_000?'lt1mb':bytes<10_000_000?'1to10mb':bytes<50_000_000?'10to50mb':bytes<=MAX_IMPORT_BYTES?'50to128mb':'over128mb';
}

/** Import core with injectable file boundaries. The app passes Expo File/Directory;
 * tests pass a real temporary filesystem and Node SQLite. */
export async function importAsset({db,asset,io,trace}:{db:SQLiteDatabase;asset:{uri:string;name:string;size?:number};io:ImportIo;trace?:ImportTrace}){
 let format:'epub'|'txt'|undefined;
 let stage='validate-file';
 const started=Date.now();
 const mark=(event:Parameters<ImportTrace>[0],next:string,detail:ImportTraceDetail={})=>trace?.(event,next,{...detail,format});
 let source:ImportFileLike|undefined;
 let destination:ImportFileLike|undefined;
 let backup:ImportFileLike|undefined;
 try {
  source=io.file(asset.uri);
  let bytes=asset.size??source.size;
  format=fileFormat(asset.name);
  mark('import-stage',stage,{sizeBucket:sizeBucket(bytes)});
  if(bytes>MAX_IMPORT_BYTES)throw new Error('当前支持 128 MB 以内的书籍。');
  stage='read-text';
  const pages=format==='txt'?paginateText(normalizeText(await source.text())):[];
  const txtFrequency=format==='txt'?countWordOccurrences(pages.map(page=>page.text).join('\n')):undefined;
  mark('import-stage',stage,{duration:Date.now()-started});
  const title=asset.name.replace(/\.(txt|epub)$/i,'');
  const bookFormat=format;
  stage='lookup-existing';
  const existing=await db.getFirstAsync<{id:string;file_name:string;created_at:number}>(
   'SELECT id,file_name,created_at FROM books WHERE title=? AND format=? ORDER BY created_at LIMIT 1',title,format);
  const id=existing?.id??io.uuid();
  let epubIndex:EpubIndex|undefined;
  const directory=io.booksDirectory();
  stage='create-storage-directory';
  directory.create({intermediates:true,idempotent:true});
  if(format==='epub'){
   stage='epub-index';mark('import-stage',stage);
   const chapterDir=io.childDirectory(directory,`${id}.chapters`);chapterDir.create({intermediates:true,idempotent:true});
   try{
    epubIndex=await buildEpubIndex(source,{file:name=>io.childFile(chapterDir,name)});
    mark('import-stage','epub-index',{duration:Date.now()-started,result:'success'});
   }catch(error){
    try{if(chapterDir.exists)chapterDir.delete();}catch{}
    try{const oldIndex=io.childFile(directory,`${id}.epub-index.json`);if(oldIndex.exists)oldIndex.delete();}catch{}
    mark('import-index-failure','epub-index',{duration:Date.now()-started,result:'failure',code:classifyImportError(error)});
   }
  }
  stage='copy-source';
  destination=io.childFile(directory,`${id}.${format}`);
  // Keep the old bytes until the database commit succeeds. A failed re-import
  // must never delete the user's only copy of an existing book.
  if(destination.exists){
   backup=io.childFile(directory,`${destination.name}.backup`);
   if(backup.exists)backup.delete();
   await destination.copy(backup,{overwrite:true});
  }
  await source.copy(destination,{overwrite:true});
  if(epubIndex)io.childFile(directory,`${id}.epub-index.json`).write(JSON.stringify(epubIndex));
  mark('import-stage',stage,{duration:Date.now()-started,result:'success'});
  stage='database-transaction';mark('import-stage',stage);
  await db.withExclusiveTransactionAsync(async tx=>{
   await tx.runAsync(`INSERT INTO books(id,title,format,file_name,created_at,page_count) VALUES(?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET file_name=excluded.file_name,page_count=excluded.page_count`,
    id,title,bookFormat,destination!.name,existing?.created_at??Date.now(),pages.length);
   if(existing&&format==='txt')await tx.runAsync('DELETE FROM book_pages WHERE book_id=?',id);
   await tx.runAsync('DELETE FROM book_word_frequency WHERE book_id=?',id);
   const statement=await tx.prepareAsync('INSERT INTO book_pages(book_id,page_index,text,heading) VALUES(?,?,?,?)');
   try{for(let i=0;i<pages.length;i++)await statement.executeAsync([id,i,pages[i].text,pages[i].heading]);}finally{await statement.finalizeAsync();}
   const frequencies=Object.entries(txtFrequency??epubIndex?.wordFrequency??{});
   for(let start=0;start<frequencies.length;start+=200){
    const chunk=frequencies.slice(start,start+200);
    const values=chunk.map(()=>'(?,?,?)').join(',');
    await tx.runAsync(`INSERT INTO book_word_frequency(book_id,lemma,occurrence_count) VALUES ${values}`,...chunk.flatMap(([lemma,count])=>[id,lemma,count]));
   }
  });
  mark('import-stage',stage,{duration:Date.now()-started,result:'success'});
  try{if(backup?.exists)backup.delete();}catch{}
  if(existing?.file_name&&existing.file_name!==destination.name){
   try{const old=io.childFile(directory,existing.file_name);if(old.exists)old.delete();}catch{}
  }
  mark('import-complete','complete',{duration:Date.now()-started,result:'success'});
  return{id,format};
 } catch(error) {
  mark('import-failure',stage,{duration:Date.now()-started,result:'failure',code:classifyImportError(error)});
  try{
   if(destination?.exists){
    if(backup?.exists)await backup.copy(destination,{overwrite:true});
    else destination.delete();
   }
   if(backup?.exists)backup.delete();
  }catch{}
  throw error;
 } finally {
  if(source?.uri.startsWith(io.cacheUri)&&source.exists){
   try{source.delete();}catch{}
  }
 }
}
