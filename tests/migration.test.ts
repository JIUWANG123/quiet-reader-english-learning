import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { schema } from '../src/db/schema';
import { migrateDatabase } from '../src/db/migrate';
for (const version of [1,2,3,4,5,6,7,8]) test('repairs incomplete schema version '+version+' without losing words', async()=>{
 const native=new DatabaseSync(':memory:');
 const db={execAsync:async(sql:string)=>{native.exec(sql)},getFirstAsync:async(sql:string)=>native.prepare(sql).get(),getAllAsync:async(sql:string)=>native.prepare(sql).all()} as unknown as SQLiteDatabase;
 try {
  native.exec(schema);native.exec('ALTER TABLE vocabulary DROP COLUMN due_at; ALTER TABLE vocabulary DROP COLUMN interval_days; DROP TABLE saved_sentences; PRAGMA user_version='+version);
  native.prepare('INSERT INTO vocabulary(word,lemma,source_text,created_at) VALUES(?,?,?,?)').run('teeth','tooth','Her teeth were white.',1);
  await migrateDatabase(db);await migrateDatabase(db);
  assert.equal(native.prepare('SELECT source_text FROM vocabulary').get()?.source_text,'Her teeth were white.');
  assert.equal(native.prepare('SELECT due_at FROM vocabulary').get()?.due_at,0);
  assert.equal(native.prepare('SELECT count(*) n FROM saved_sentences').get()?.n,0);
 } finally {native.close()}
});
test('v11 sentence collections and notes survive translation-column migration',async()=>{
 const native=new DatabaseSync(':memory:');
 const db={execAsync:async(sql:string)=>{native.exec(sql)},getFirstAsync:async(sql:string)=>native.prepare(sql).get(),getAllAsync:async(sql:string)=>native.prepare(sql).all()} as unknown as SQLiteDatabase;
 try{
  native.exec(schema);native.exec('PRAGMA user_version=11');
  native.prepare("INSERT INTO books(id,title,format,file_name,created_at) VALUES('book','Fixture','txt','fixture.txt',1)").run();
  native.prepare('INSERT INTO saved_sentences(book_id,text,context,created_at) VALUES(?,?,?,?)').run('book','She knew.','Then she knew.',1);
  await migrateDatabase(db);await migrateDatabase(db);
  const row=native.prepare('SELECT text,context,translation FROM saved_sentences').get();
  assert.equal(row?.text,'She knew.');assert.equal(row?.context,'Then she knew.');assert.equal(row?.translation,null);
 }finally{native.close();}
});
