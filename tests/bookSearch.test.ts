import {test} from 'node:test';
import assert from 'node:assert/strict';
import {epubSearchText,searchMatches} from '../src/services/books/searchText';
import {DatabaseSync} from 'node:sqlite';
test('search preserves XML text offsets across inline tags, entities and Unicode',()=>{
 const text=epubSearchText('<html><head><title>Not indexed</title></head><body><p>She <em>knew</em> &amp; smiled. 🐈</p><script>no</script><p>吸血鬼</p></body></html>');
 assert.equal(text,'She knew & smiled. 🐈吸血鬼');
 for(const hit of searchMatches(text,'吸血鬼',false))assert.equal(text.slice(hit.offset,hit.offset+hit.text.length),'吸血鬼');
});
test('literal search supports quotes, punctuation, case and true whole word boundaries',()=>{
 assert.equal(searchMatches('the he HE he’s','he',true).length,2);
 assert.equal(searchMatches('a+b A+B aab','a+b',false).length,2);
 assert.equal(searchMatches('word '.repeat(10000),'word',false,30).length,30);
 assert.equal(searchMatches('a','',false).length,0);
});
test('FTS search isolates books, quotes input literally and supports substring fallback',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE VIRTUAL TABLE passages USING fts5(book UNINDEXED,section UNINDEXED,title UNINDEXED,body,tokenize='unicode61')");
 db.prepare('INSERT INTO passages VALUES(?,?,?,?)').run('a',0,'Chapter','He was reluctant. 100% 吸血鬼');
 db.prepare('INSERT INTO passages VALUES(?,?,?,?)').run('b',0,'Chapter','reluctant');
 assert.equal(db.prepare('SELECT * FROM passages WHERE book=? AND passages MATCH ?').all('a','"reluctant"').length,1);
 assert.equal(db.prepare("SELECT * FROM passages WHERE book=? AND body LIKE ? ESCAPE '\\'").all('a','%100\\%%').length,1);
 db.close();
});
