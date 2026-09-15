import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { schema, learningSchema } from '../src/db/schema';

test('sentence mark migration preserves library data and separates repeated occurrences',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(schema);
  db.prepare('INSERT INTO books(id,title,format,file_name,created_at) VALUES(?,?,?,?,?)').run('a','Book','epub','a.epub',1);
  db.exec('DROP TABLE sentence_marks; PRAGMA user_version=4;');db.exec(learningSchema);
  const insert=db.prepare('INSERT INTO sentence_marks VALUES(?,?,?,?,?,?,?,?)');
  insert.run('a','epub:0',0,12,'A sentence.','highlight','#ffe082',1);
  insert.run('a','epub:1',0,12,'A sentence.','underline','#90caf9',2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM books').get()?.n,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM sentence_marks').get()?.n,2);
  db.prepare('DELETE FROM books WHERE id=?').run('a');
  assert.equal(db.prepare('SELECT count(*) AS n FROM sentence_marks').get()?.n,0);db.close();
});
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getBook, removeBooks, saveEpubProgress, saveProgress } from '../src/services/books/repository';
import { listVocabulary, removeVocabulary, setVocabularyFamiliarity } from '../src/services/vocabulary/repository';

test('schema isolates book positions, rejects invalid progress and cascades deletes', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(schema);
  db.exec(schema);
  db.prepare('INSERT INTO books(id,title,format,file_name,created_at) VALUES(?,?,?,?,?)').run('a', "Anna's book", 'txt', 'a.txt', 1);
  db.prepare('INSERT INTO books(id,title,format,file_name,created_at) VALUES(?,?,?,?,?)').run('b', 'Other', 'txt', 'b.txt', 2);
  db.prepare('INSERT INTO book_pages VALUES(?,?,?,?)').run('a', 0, 'Original sentence.', null);
  db.prepare('INSERT INTO reading_progress(book_id,page_index,scroll_fraction,progress,updated_at) VALUES(?,?,?,?,?)').run('a', 0, 0.5, 0.5, 3);
  assert.equal(db.prepare('SELECT scroll_fraction FROM reading_progress WHERE book_id=?').get('a')?.scroll_fraction, 0.5);
  assert.equal(db.prepare('SELECT * FROM reading_progress WHERE book_id=?').get('b'), undefined);
  assert.throws(() => db.prepare('INSERT INTO reading_progress(book_id,page_index,scroll_fraction,progress,updated_at) VALUES(?,?,?,?,?)').run('b', 0, 2, 2, 3));
  db.prepare('DELETE FROM books WHERE id=?').run('a');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM book_pages').get()?.n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reading_progress').get()?.n, 0);
  db.close();
});

test('production progress queries survive closing and reopening a file database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'quiet-reader-test-'));
  const path = join(directory, 'app.db');
  let native = new DatabaseSync(path);
  const adapter = {
    async getFirstAsync(sql: string, ...args: (string | number)[]) { return native.prepare(sql).get(...args) ?? null; },
    async runAsync(sql: string, ...args: (string | number)[]) { return native.prepare(sql).run(...args); },
    async withExclusiveTransactionAsync(callback: (tx: unknown) => Promise<void>) {
      native.exec('BEGIN IMMEDIATE');
      try { await callback(adapter); native.exec('COMMIT'); }
      catch (error) { native.exec('ROLLBACK'); throw error; }
    },
  } as unknown as SQLiteDatabase;
  try {
    native.exec(schema);
    native.prepare('INSERT INTO books(id,title,format,file_name,created_at,page_count) VALUES(?,?,?,?,?,?)').run('a', 'The Letter', 'txt', 'a.txt', 1, 4);
    await saveProgress(adapter, 'a', 2, 0.5, 4);
    native.prepare('INSERT INTO books(id,title,format,file_name,created_at) VALUES(?,?,?,?,?)').run('epub', 'Novel', 'epub', 'novel.epub', 1);
    const cfi = 'epubcfi(/6/18!/4/30/1:24)';
    await saveEpubProgress(adapter, 'epub', cfi, 0.54);
    native.close();
    native = new DatabaseSync(path);
    const book = await getBook(adapter, 'a');
    assert.equal((await getBook(adapter, 'epub'))?.epub_location, cfi);
    assert.equal((await getBook(adapter, 'epub'))?.progress, 0.54);
    assert.equal(book?.page_index, 2);
    assert.equal(book?.scroll_fraction, 0.5);
    assert.equal(book?.progress, 0.625);
    assert.ok(book?.last_read_at);
    await saveProgress(adapter, 'a', 3, 1, 4);
    assert.equal((await getBook(adapter, 'a'))?.progress, 1);
  } finally { native.close(); rmSync(directory, { recursive: true }); }
});

test('batch book removal keeps learned words and queues only imported copies, even without foreign keys', async () => {
  const native = new DatabaseSync(':memory:');
  native.exec('PRAGMA foreign_keys=OFF');
  native.exec(schema);
  for (const id of ['a', 'b', 'keep']) {
    native.prepare('INSERT INTO books(id,title,format,file_name,created_at) VALUES(?,?,?,?,?)').run(id, id, 'txt', id + '.txt', 1);
    native.prepare('INSERT INTO book_pages VALUES(?,?,?,?)').run(id, 0, 'Original sentence.', null);
    native.prepare('INSERT INTO reading_progress(book_id,updated_at) VALUES(?,?)').run(id, 1);
    native.prepare('INSERT INTO sentence_marks VALUES(?,?,?,?,?,?,?,?)').run(id, 'txt:0', 0, 18, 'Original sentence.', 'highlight', '#ffe082', 1);
    native.prepare('INSERT INTO text_marks(book_id,lemma,style,color,created_at) VALUES(?,?,?,?,?)').run(id, 'original', 'underline', '#ffe082', 1);
  }
  native.prepare('INSERT INTO vocabulary(word,lemma,source_book_id,source_text,created_at) VALUES(?,?,?,?,?)').run('original', 'original', 'a', 'Original sentence.', 1);
  const adapter = {
    async runAsync(sql: string, ...args: (string | number)[]) { return native.prepare(sql).run(...args); },
    async withExclusiveTransactionAsync(callback: (tx: unknown) => Promise<void>) {
      native.exec('BEGIN');
      try { await callback(adapter); native.exec('COMMIT'); }
      catch (error) { native.exec('ROLLBACK'); throw error; }
    },
  } as unknown as SQLiteDatabase;
  try {
    native.prepare('INSERT INTO saved_sentences(book_id,text,created_at) VALUES(?,?,?)').run('a','A saved sentence.',1);
    await removeBooks(adapter, ['a', 'b', 'a']);
    assert.equal(native.prepare('SELECT book_id FROM saved_sentences').get()?.book_id,null);
    assert.equal(native.prepare('SELECT text FROM saved_sentences').get()?.text,'A saved sentence.');
    assert.deepEqual(native.prepare('SELECT id FROM books').all().map(r=>r.id), ['keep']);
    for (const table of ['book_pages', 'reading_progress', 'text_marks', 'sentence_marks']) {
      assert.deepEqual(native.prepare(`SELECT book_id FROM ${table}`).all().map(r=>r.book_id), ['keep']);
    }
    const word = native.prepare('SELECT * FROM vocabulary').get();
    assert.equal(word?.source_book_id, null);
    assert.equal(word?.source_text, 'Original sentence.');
    assert.deepEqual(native.prepare('SELECT file_name FROM book_file_cleanup ORDER BY file_name').all().map(r=>r.file_name), ['a.txt','b.txt']);
    await removeBooks(adapter, ['a']); // Retry is safe.
    assert.equal(native.prepare('SELECT count(*) AS n FROM book_file_cleanup').get()?.n, 2);
  } finally { native.close(); }
});

test('vocabulary can be listed, marked familiar and removed', async () => {
  const native = new DatabaseSync(':memory:');
  native.exec('PRAGMA foreign_keys=ON');
  native.exec(schema);
  native.prepare('INSERT INTO books(id,title,format,file_name,created_at) VALUES(?,?,?,?,?)').run('book', 'A Story', 'txt', 'book.txt', 1);
  native.prepare(`INSERT INTO vocabulary
    (word,lemma,translation,source_book_id,source_text,created_at,lookup_count,familiarity)
    VALUES(?,?,?,?,?,?,?,?)`).run('reluctant', 'reluctant', '不情愿的', 'book', 'She was reluctant to leave.', 2, 3, 0);
  const adapter = {
    async getAllAsync(sql: string, ...args: (string | number)[]) { return native.prepare(sql).all(...args); },
    async runAsync(sql: string, ...args: (string | number)[]) { return native.prepare(sql).run(...args); },
  } as unknown as SQLiteDatabase;
  const items = await listVocabulary(adapter);
  assert.equal(items[0]?.source_book_title, 'A Story');
  assert.equal(items[0]?.lookup_count, 3);
  await setVocabularyFamiliarity(adapter, 'reluctant', 3);
  assert.equal(native.prepare('SELECT familiarity FROM vocabulary WHERE word=?').get('reluctant')?.familiarity, 3);
  await removeVocabulary(adapter, 'RELUCTANT');
  assert.equal(native.prepare('SELECT COUNT(*) AS n FROM vocabulary').get()?.n, 0);
  native.close();
});
