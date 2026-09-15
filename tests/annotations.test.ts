import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {schema} from '../src/db/schema';
test('notes and bookmarks retain exact locations, isolate books, and cascade on deletion',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(schema);
 for(const id of ['a','b'])db.prepare("INSERT INTO books(id,title,format,file_name,created_at) VALUES(?,?,'txt',?,1)").run(id,id,id);
 const note=db.prepare('INSERT OR REPLACE INTO sentence_notes VALUES(?,?,?,?,?,?,?)');
 note.run('a','txt:0',0,10,'A sentence','my note',1);note.run('b','txt:0',0,10,'A sentence','other note',1);note.run('a','txt:0',0,10,'A sentence','edited note',2);
 assert.equal(db.prepare('SELECT count(*) AS n FROM sentence_notes').get()?.n,2);
 assert.equal(db.prepare("SELECT note FROM sentence_notes WHERE book_id='a'").get()?.note,'edited note');
 const location=JSON.stringify({page:20,fraction:0.7345});db.prepare('INSERT INTO bookmarks(book_id,location,label,created_at) VALUES(?,?,?,?)').run('a',location,'chapter',1);
 assert.deepEqual(JSON.parse(String(db.prepare('SELECT location FROM bookmarks').get()?.location)),{page:20,fraction:.7345});
 assert.throws(()=>db.prepare('INSERT INTO bookmarks(book_id,location,label,created_at) VALUES(?,?,?,?)').run('a',location,'duplicate',2));
 db.prepare("DELETE FROM books WHERE id='a'").run();assert.equal(db.prepare('SELECT count(*) AS n FROM bookmarks').get()?.n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM sentence_notes').get()?.n,1);db.close();
});
