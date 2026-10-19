import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import JSZip from 'jszip';
import {schema} from '../src/db/schema';
import {importAsset,type ImportDirectoryLike,type ImportFileLike,type ImportIo} from '../src/services/books/importAsset';

const uri=(value:string)=>'file:///'+value.replace(/\\/g,'/').replace(/^\/+/,'');
const fromUri=(value:string)=>value.replace(/^file:\/\/\//,'').replace(/\//g,path.sep);
const filePath=(file:ImportFileLike)=>(file as FakeFile).path;
const directoryPath=(dir:ImportDirectoryLike)=>(dir as FakeDirectory).path;

class FakeFile implements ImportFileLike{
 readonly path:string;
 constructor(value:string){this.path=value;}
 get uri(){return uri(this.path);}
 get name(){return path.basename(this.path);}
 get exists(){return fs.existsSync(this.path)&&fs.statSync(this.path).isFile();}
 get size(){return this.exists?fs.statSync(this.path).size:0;}
 copy(destination:ImportFileLike,options?:{overwrite?:boolean}){
  if(destination.exists&&!options?.overwrite)throw new Error('Destination already exists');
  fs.mkdirSync(path.dirname(filePath(destination)),{recursive:true});fs.copyFileSync(this.path,filePath(destination));
 }
 write(contents:string){fs.mkdirSync(path.dirname(this.path),{recursive:true});fs.writeFileSync(this.path,contents);}
 delete(){fs.rmSync(this.path,{force:true});}
 async arrayBuffer(){const data=fs.readFileSync(this.path);return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}
 async text(){return fs.readFileSync(this.path,'utf8');}
}
class FakeDirectory implements ImportDirectoryLike{
 readonly path:string;
 constructor(value:string){this.path=value;}
 get uri(){return uri(this.path);}
 get exists(){return fs.existsSync(this.path)&&fs.statSync(this.path).isDirectory();}
 create(){fs.mkdirSync(this.path,{recursive:true});}
 delete(){fs.rmSync(this.path,{recursive:true,force:true});}
}

function makeIo(root:string,ids=()=> 'book-1'):ImportIo{
 return{
  booksDirectory:()=>new FakeDirectory(path.join(root,'documents','books')),
  file:value=>new FakeFile(fromUri(value)),
  childFile:(parent,name)=>new FakeFile(path.join(directoryPath(parent),name)),
  childDirectory:(parent,name)=>new FakeDirectory(path.join(directoryPath(parent),name)),
  cacheUri:uri(path.join(root,'cache'))+'/',
  uuid:ids,
 };
}

function makeDb(fail=false){
 const raw=new DatabaseSync(':memory:');
 raw.exec(schema);
 let failNext=fail;
 const connection={
  getAllAsync:async(sql:string,...params:any[])=>raw.prepare(sql).all(...params),
  getFirstAsync:async(sql:string,...params:any[])=>raw.prepare(sql).get(...params)??null,
  runAsync:async(sql:string,...params:any[])=>raw.prepare(sql).run(...params),
  execAsync:async(sql:string)=>raw.exec(sql),
  prepareAsync:async(sql:string)=>{
   const statement=raw.prepare(sql);
   return{executeAsync:async(params:any[])=>statement.run(...params),finalizeAsync:async()=>{}};
  },
 };
 const db:any={
  ...connection,
  withExclusiveTransactionAsync:async(task:(tx:typeof connection)=>Promise<void>)=>{
   if(failNext)throw new Error('DATABASE_TEST_FAILURE');
   raw.exec('BEGIN');
   try{await task(connection);raw.exec('COMMIT');}catch(error){raw.exec('ROLLBACK');throw error;}
  },
  failNext(value:boolean){failNext=value;},
 };
 return{raw,db};
}

function makeEpub(){
 const zip=new JSZip();
 zip.file('mimetype','application/epub+zip');
 zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>');
 zip.file('OEBPS/book.opf','<package><manifest><item href="Text/ch1.xhtml" id="ch1" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>');
 zip.file('OEBPS/Text/ch1.xhtml','<p>Hello hello world.</p>');
 return zip;
}

test('TXT import writes the row, pages, word frequency and removes the picker cache copy',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qr-import-'));
 try{
  const io=makeIo(root);const {raw,db}=makeDb();
  const source=new FakeFile(path.join(root,'cache','Book.txt'));source.write('Chapter 1\n\nHello world. Hello again.');
  const result=await importAsset({db,asset:{uri:source.uri,name:'Book.txt',size:source.size},io});
  assert.deepEqual(result,{id:'book-1',format:'txt'});
  const book=raw.prepare('SELECT id,title,format,file_name FROM books').get() as any;
  assert.equal(book.title,'Book');assert.equal(book.file_name,'book-1.txt');assert.ok(fs.existsSync(path.join(root,'documents','books','book-1.txt')));
  assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM book_pages').get() as any).n,1);
  assert.equal((raw.prepare("SELECT occurrence_count FROM book_word_frequency WHERE lemma='hello'").get() as any).occurrence_count,2);
  assert.equal(source.exists,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('EPUB import writes chapter cache and the original archive',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qr-import-'));
 try{
  const io=makeIo(root);const {raw,db}=makeDb();
  const source=new FakeFile(path.join(root,'cache','Novel.epub'));source.write(await makeEpub().generateAsync({type:'nodebuffer'}) as any);
  const result=await importAsset({db,asset:{uri:source.uri,name:'Novel.epub',size:source.size},io});
  assert.equal(result.format,'epub');
  assert.ok(fs.existsSync(path.join(root,'documents','books','book-1.epub')));
  assert.ok(fs.existsSync(path.join(root,'documents','books','book-1.chapters','0.xhtml')));
  assert.ok(fs.existsSync(path.join(root,'documents','books','book-1.epub-index.json')));
  assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM book_word_frequency').get() as any).n,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('EPUB index failure still imports the original archive',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qr-import-'));
 try{
  const io=makeIo(root);const {raw,db}=makeDb();
  const source=new FakeFile(path.join(root,'cache','Broken.epub'));source.write('not a zip');
  const result=await importAsset({db,asset:{uri:source.uri,name:'Broken.epub',size:source.size},io});
  assert.equal(result.format,'epub');
  assert.ok(fs.existsSync(path.join(root,'documents','books','book-1.epub')));
  assert.equal(fs.existsSync(path.join(root,'documents','books','book-1.chapters')),false);
  assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM book_word_frequency').get() as any).n,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('failed re-import restores the previous book file instead of deleting it',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qr-import-'));
 try{
  const io=makeIo(root);const {raw,db}=makeDb();
  const first=new FakeFile(path.join(root,'cache','Book.txt'));first.write('OLD CONTENT');
  await importAsset({db,asset:{uri:first.uri,name:'Book.txt',size:first.size},io});
  const stored=path.join(root,'documents','books','book-1.txt');assert.equal(fs.readFileSync(stored,'utf8'),'OLD CONTENT');

  const second=new FakeFile(path.join(root,'cache','Book.txt'));second.write('NEW CONTENT');
  db.failNext(true);
  await assert.rejects(()=>importAsset({db,asset:{uri:second.uri,name:'Book.txt',size:second.size},io}),/DATABASE_TEST_FAILURE/);
  assert.equal(fs.readFileSync(stored,'utf8'),'OLD CONTENT');
  assert.equal(fs.existsSync(path.join(root,'documents','books','book-1.txt.backup')),false);
  assert.equal((raw.prepare('SELECT file_name FROM books WHERE id=?').get('book-1') as any).file_name,'book-1.txt');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('successful re-import replaces the file under the same book id',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qr-import-'));
 try{
  const io=makeIo(root);const {raw,db}=makeDb();
  const first=new FakeFile(path.join(root,'cache','Book.txt'));first.write('OLD CONTENT');
  await importAsset({db,asset:{uri:first.uri,name:'Book.txt',size:first.size},io});
  const second=new FakeFile(path.join(root,'cache','Book.txt'));second.write('NEW CONTENT');
  const result=await importAsset({db,asset:{uri:second.uri,name:'Book.txt',size:second.size},io});
  assert.deepEqual(result,{id:'book-1',format:'txt'});
  assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM books').get() as any).n,1);
  assert.equal(fs.readFileSync(path.join(root,'documents','books','book-1.txt'),'utf8'),'NEW CONTENT');
  assert.equal(fs.existsSync(path.join(root,'documents','books','book-1.txt.backup')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
