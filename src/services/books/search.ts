import {Directory,File,Paths} from 'expo-file-system';
import {openDatabaseAsync} from 'expo-sqlite';
import type {SQLiteDatabase} from 'expo-sqlite';
import type {Book} from '../../types';
import {buildEpubIndex,type EpubIndex} from './epubIndex';
import {epubSearchText,searchMatches} from './searchText';

export type SearchHit={section:number;href?:string;offset:number;text:string;before:string;after:string;title:string};
let connection:ReturnType<typeof openDatabaseAsync>|undefined;
async function database(){
 const db=await(connection??=openDatabaseAsync('search-v2.db'));
 await db.execAsync(`CREATE VIRTUAL TABLE IF NOT EXISTS passages USING fts5(book UNINDEXED,section UNINDEXED,href UNINDEXED,title UNINDEXED,body,tokenize='unicode61');CREATE TABLE IF NOT EXISTS indexed_books(book TEXT PRIMARY KEY,fingerprint TEXT);CREATE TABLE IF NOT EXISTS indexed_sections(book TEXT,section INTEGER,fingerprint TEXT,PRIMARY KEY(book,section));`);
 return db;
}
export async function indexBook(app:SQLiteDatabase,book:Book,signal:AbortSignal,progress:(done:number,total:number)=>void){
 const db=await database(),file=book.file_name?new File(Paths.document,'books',book.file_name):null;
 const fingerprint=JSON.stringify([book.file_name,book.created_at,file?.exists?file.size:0,file?.exists?file.modificationTime:0,1]);
 // Completed indexes bypass EPUB extraction and chapter enumeration.
 const complete=await db.getFirstAsync<{fingerprint:string}>('SELECT fingerprint FROM indexed_books WHERE book=?',book.id);
 if(complete?.fingerprint===fingerprint)return;
 let chapters:{section:number;title:string;href?:string;uri?:string}[];
 if(book.format==='txt')chapters=(await app.getAllAsync<{page_index:number;heading:string}>('SELECT page_index,heading FROM book_pages WHERE book_id=? ORDER BY page_index',book.id)).map(row=>({section:row.page_index,title:row.heading||`第 ${row.page_index+1} 段`}));
 else {
  if(!file)throw Error('原始 EPUB 不存在');
  const chapterDir=new Directory(Paths.document,'books',`${book.id}.chapters`),indexFile=new File(Paths.document,'books',`${book.id}.epub-index.json`);
  let index:EpubIndex|undefined;
  if(indexFile.exists){
   try{const saved=JSON.parse(await indexFile.text()) as EpubIndex;if(Array.isArray(saved.chapters)&&saved.chapters.length&&saved.chapters.every(chapter=>new File(chapterDir,`${chapter.index}.xhtml`).exists))index=saved;}catch{}
  }
  if(!index){
   chapterDir.create({intermediates:true,idempotent:true});
   index=await buildEpubIndex(file,{file:name=>new File(chapterDir,name)});
   try{indexFile.write(JSON.stringify(index));}catch{}
  }
  chapters=index.chapters.map(chapter=>({section:chapter.index,title:chapter.title,href:chapter.href,uri:new File(chapterDir,`${chapter.index}.xhtml`).uri}));
 }
 // The index is durable in search.db. When the source fingerprint and section
 // count still match, avoid deleting/rechecking every row on each reader open.
 const indexed=await db.getFirstAsync<{count:number;different:number}>(
  'SELECT COUNT(*) AS count, COALESCE(SUM(CASE WHEN fingerprint<>? THEN 1 ELSE 0 END),0) AS different FROM indexed_sections WHERE book=?',
  fingerprint,book.id);
 if (indexed?.count===chapters.length && indexed.different===0) {
 await db.runAsync('INSERT OR REPLACE INTO indexed_books VALUES(?,?)',book.id,fingerprint);return;
 }
 await db.runAsync('DELETE FROM passages WHERE book=? AND CAST(section AS INTEGER)>=?',book.id,chapters.length);
 await db.runAsync('DELETE FROM indexed_sections WHERE book=? AND section>=?',book.id,chapters.length);
 const rows=await db.getAllAsync<{section:number;fingerprint:string}>('SELECT section,fingerprint FROM indexed_sections WHERE book=?',book.id);
 const completed=new Map(rows.map(row=>[row.section,row.fingerprint]));
 let done=chapters.filter(chapter=>completed.get(chapter.section)===fingerprint).length;
 progress(done,chapters.length);
 for(let i=0;i<chapters.length;i++){
  if(signal.aborted)return;
  const chapter=chapters[i],old={fingerprint:completed.get(chapter.section)};
  if(old?.fingerprint!==fingerprint){
   const text=chapter.uri?epubSearchText(await new File(chapter.uri).text()):(await app.getFirstAsync<{text:string}>('SELECT text FROM book_pages WHERE book_id=? AND page_index=?',book.id,chapter.section))?.text.split(/\n\s*\n/).join('')??'';
   if(signal.aborted)return;
   await db.withTransactionAsync(async()=>{
    await db.runAsync('DELETE FROM passages WHERE book=? AND section=?',book.id,chapter.section);
    await db.runAsync('INSERT INTO passages(book,section,href,title,body) VALUES(?,?,?,?,?)',book.id,chapter.section,chapter.href??null,chapter.title,text);
    await db.runAsync('INSERT OR REPLACE INTO indexed_sections VALUES(?,?,?)',book.id,chapter.section,fingerprint);
   });
   done++;progress(done,chapters.length);await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 if(!signal.aborted)await db.runAsync('INSERT OR REPLACE INTO indexed_books VALUES(?,?)',book.id,fingerprint);
}
// Jobs outlive search windows; serialize connection-wide SQLite transactions.
const jobs=new Map<string,{promise:Promise<void>;listeners:Set<(done:number,total:number)=>void>;last?:[number,number]}>();
let queue:Promise<void>=Promise.resolve();
export function ensureBookIndex(app:SQLiteDatabase,book:Book,signal:AbortSignal,progress:(done:number,total:number)=>void){
 let job=jobs.get(book.id);
 if(!job){
  const created={promise:Promise.resolve(),listeners:new Set<(done:number,total:number)=>void>(),last:undefined as [number,number]|undefined};
  created.promise=queue.then(()=>indexBook(app,book,new AbortController().signal,(done,total)=>{
   created.last=[done,total];created.listeners.forEach(listener=>listener(done,total));
  })).finally(()=>{jobs.delete(book.id);});
  queue=created.promise.catch(()=>{});
  jobs.set(book.id,created);job=created;
 }
 const current=job;
 const detach=()=>{current.listeners.delete(progress);};
 if(!signal.aborted){current.listeners.add(progress);if(current.last)progress(...current.last);}
 signal.addEventListener('abort',detach,{once:true});
 return current.promise.finally(()=>{detach();signal.removeEventListener('abort',detach);});
}
export async function searchBook(bookId:string,query:string,whole:boolean,limit:number,signal:AbortSignal):Promise<SearchHit[]>{
 query=query.trim();if(!query||query.length>160)return [];
 const db=await database(),hits:SearchHit[]=[];
 // FTS accelerates whole English terms; substring/Chinese searches scan chapters
 // on SQLite's worker and return one chapter at a time, never the whole book.
 const fts=whole&&/^[a-zA-Z0-9 ]+$/.test(query);
 const rows=db.getEachAsync<{section:number;href:string|null;title:string;body:string}>(fts?'SELECT section,href,title,body FROM passages WHERE book=? AND passages MATCH ? ORDER BY CAST(section AS INTEGER)':'SELECT section,href,title,body FROM passages WHERE book=? AND body LIKE ? ESCAPE \'\\\' ORDER BY CAST(section AS INTEGER)',bookId,fts?'"'+query.replace(/"/g,'""')+'"':'%'+query.replace(/[\\%_]/g,'\\$&')+'%');
 for await(const row of rows){
  if(signal.aborted)return [];
  for(const match of searchMatches(row.body,query,whole,limit-hits.length)){
   hits.push({section:Number(row.section),href:row.href??undefined,offset:match.offset,text:match.text,before:row.body.slice(Math.max(0,match.offset-55),match.offset),after:row.body.slice(match.offset+match.text.length,match.offset+match.text.length+85),title:row.title});
   if(hits.length>=limit)return hits;
  }
 }
 return hits;
}
