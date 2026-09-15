import {test} from 'node:test';
import assert from 'node:assert/strict';
import {latestPosition,parsePosition} from '../src/features/reader/positionModel';
import {DatabaseSync} from 'node:sqlite';
import type {SQLiteDatabase} from 'expo-sqlite';
import {schema} from '../src/db/schema';
import {saveEpubProgress} from '../src/services/books/repository';
test('recovery survives truncated slot and chooses newest even when reading backward',()=>{
 const old={page:8,count:20,fraction:.4,progress:.42,updated:100};const next={...old,page:3,progress:.17,updated:200};
 assert.deepEqual(latestPosition([JSON.stringify(old),'{broken']),old);
 assert.deepEqual(latestPosition([JSON.stringify(old),JSON.stringify(next)]),next);
 assert.equal(parsePosition('null'),null);assert.equal(parsePosition(JSON.stringify({...old,fraction:2})),null);
});
test('delayed older database save cannot replace newer position',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(schema);db.prepare("INSERT INTO books(id,title,format,file_name,created_at) VALUES('b','book','epub','book.epub',1)").run();
 const adapter={withExclusiveTransactionAsync:async(fn:(tx:any)=>Promise<void>)=>fn({runAsync:async(sql:string,...args:any[])=>db.prepare(sql).run(...args)})} as SQLiteDatabase;
 await saveEpubProgress(adapter,'b','epubcfi(/6/8)',.2,200);await saveEpubProgress(adapter,'b','epubcfi(/6/2)',.1,100);
 assert.equal(db.prepare("SELECT epub_location FROM reading_progress WHERE book_id='b'").get()?.epub_location,'epubcfi(/6/8)');
 await saveEpubProgress(adapter,'b','epubcfi(/6/2)',.1,300);
 assert.equal(db.prepare("SELECT epub_location FROM reading_progress WHERE book_id='b'").get()?.epub_location,'epubcfi(/6/2)');db.close();
});
