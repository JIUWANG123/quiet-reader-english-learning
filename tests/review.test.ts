import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import type {SQLiteDatabase} from 'expo-sqlite';
import {schema} from '../src/db/schema';
import {filterWords,defaultFilters,normalizePlan,nextReview,recordReview,todayStats,studyQueue,savePlan,readPlan} from '../src/services/vocabulary/review';
import {listVocabulary,ensureVocabulary,type VocabularyItem} from '../src/services/vocabulary/repository';
import {listStudyWords} from '../src/services/vocabulary/lexicon';
import {ankiTSV} from '../src/services/vocabulary/anki';
import type {DictionaryResult} from '../src/features/dictionary/types';
function fixture(){
 const native=new DatabaseSync(':memory:');native.exec(schema);
 const adapter={
  async execAsync(sql:string){native.exec(sql)},
  async getFirstAsync(sql:string,...args:(string|number|null)[]){return native.prepare(sql).get(...args)??null},
  async getAllAsync(sql:string,...args:(string|number|null)[]){return native.prepare(sql).all(...args)},
  async runAsync(sql:string,...args:(string|number|null)[]){return native.prepare(sql).run(...args)},
  async withExclusiveTransactionAsync(fn:(tx:unknown)=>Promise<void>){native.exec('BEGIN');try{await fn(adapter);native.exec('COMMIT')}catch(e){native.exec('ROLLBACK');throw e}}
 } as unknown as SQLiteDatabase;
 const word=(w:string,due=0)=>native.prepare('INSERT INTO vocabulary(word,lemma,created_at,due_at) VALUES(?,?,?,?)').run(w,w,1,due);
 return {native,db:adapter,word};
}
test('review commits once, keeps daily results across reads, retries wrong words after ten minutes',async()=>{
 const {native,db,word}=fixture();try{
  word('take');const now=new Date(2026,8,8,12).getTime();
  await recordReview(db,'one','take','spelling',0,now);await recordReview(db,'one','take','spelling',0,now);
  assert.equal((await todayStats(db,now)).attempts,1);
  assert.equal((await listVocabulary(db))[0].due_at,now+600000);
  assert.equal((await studyQueue(db,await listVocabulary(db),{newLimit:10,reviewLimit:30,order:'default'},now)).length,0);
  assert.equal((await studyQueue(db,await listVocabulary(db),{newLimit:10,reviewLimit:30,order:'default'},now+600000)).length,1);
  await recordReview(db,'two','take','spelling',2,now+600000);
  const s=await todayStats(db,now);assert.equal(s.attempts,2);assert.equal(s.correct,1);assert.equal(s.newWords,1);assert.equal(s.reviewWords,0);
  assert.equal((await todayStats(db,now+86400000)).attempts,0);
  await assert.rejects(recordReview(db,'bad','missing','spelling',2,now));
  assert.equal((await todayStats(db,now)).attempts,2);
 }finally{native.close()}
});
test('failed log insert rolls back due date and familiarity',async()=>{
 const {native,db,word}=fixture();try{word('take');native.exec("CREATE TRIGGER reject_review BEFORE INSERT ON review_log BEGIN SELECT RAISE(ABORT,'disk error'); END;");
 await assert.rejects(recordReview(db,'one','take','choice',3));const item=(await listVocabulary(db))[0];assert.equal(item.due_at,0);assert.equal(item.familiarity,0);
 }finally{native.close()}
});
test('daily plan limits fresh and due cards independently and settings survive reload',async()=>{
 const {native,db,word}=fixture();try{word('one');word('two');word('old',1);word('future',Date.now()+86400000);
 await savePlan(db,{newLimit:1,reviewLimit:1,order:'default'});assert.deepEqual(await readPlan(db),{newLimit:1,reviewLimit:1,order:'default'});
 const queue=await studyQueue(db,await listVocabulary(db),await readPlan(db));assert.equal(queue.length,2);assert.equal(queue[0].word,'old');
 await recordReview(db,'id',queue[1].word,'cloze',2);
 assert.deepEqual((await studyQueue(db,await listVocabulary(db),await readPlan(db))).map(w=>w.word),['old']);
 assert.deepEqual(normalizePlan({newLimit:-1,reviewLimit:Infinity}),{newLimit:0,reviewLimit:30,order:'default'});
 }finally{native.close()}
});
test('book, familiarity and due filters combine',()=>{
 const row={word:'one',source_book_id:'book',familiarity:2,due_at:100} as VocabularyItem;
 assert.equal(filterWords([row],{book:'book',familiarity:2,due:'due',frequency:'all'},101).length,1);
 assert.equal(filterWords([row],{...defaultFilters,book:'other'}).length,0);
 assert.equal(filterWords([row],{...defaultFilters,due:'new'}).length,0);
 assert.equal(filterWords([{...row,source_book_id:null}],{...defaultFilters,book:'deleted'}).length,1);
 assert.equal(nextReview(7,3,0).days,18);assert.throws(()=>nextReview(0,4,0));
});
test('frequency filters use lookup_count bands',()=>{
 const rows=[1,2,4,5,9].map((occurrence_count,i)=>({word:String(i),source_book_id:null,familiarity:0,due_at:0,lookup_count:1,occurrence_count} as VocabularyItem));
 assert.deepEqual(filterWords(rows,{...defaultFilters,frequency:'low'}).map(w=>w.occurrence_count),[1]);
 assert.deepEqual(filterWords(rows,{...defaultFilters,frequency:'medium'}).map(w=>w.occurrence_count),[2,4]);
 assert.deepEqual(filterWords(rows,{...defaultFilters,frequency:'high'}).map(w=>w.occurrence_count),[5,9]);
});
test('legacy study plans default to chronological order and persist frequency order',async()=>{
 assert.deepEqual(normalizePlan({newLimit:3,reviewLimit:4}),{newLimit:3,reviewLimit:4,order:'default'});
 const {native,db}=fixture();try{await savePlan(db,{newLimit:2,reviewLimit:3,order:'frequency'});assert.equal((await readPlan(db)).order,'frequency');}finally{native.close()}
});
test('frequency priority sorts within due and fresh groups without changing group precedence',async()=>{
 const {native,db,word}=fixture();try{word('new-low');word('new-high');word('due-low',1);word('due-high',1);native.prepare('UPDATE vocabulary SET lookup_count=? WHERE word=?').run(1,'new-low');native.prepare('UPDATE vocabulary SET lookup_count=? WHERE word=?').run(8,'new-high');native.prepare('UPDATE vocabulary SET lookup_count=? WHERE word=?').run(2,'due-low');native.prepare('UPDATE vocabulary SET lookup_count=? WHERE word=?').run(9,'due-high');
 const words=await listVocabulary(db);const queue=await studyQueue(db,words,{newLimit:2,reviewLimit:2,order:'frequency'},Date.now());assert.deepEqual(queue.map(w=>w.word),['due-high','due-low','new-high','new-low']);
}finally{native.close()}
});
test('frequency bands are applied in SQL before pagination',async()=>{
 const {native,db}=fixture();try{native.prepare("INSERT INTO books(id,title,format,file_name,created_at) VALUES('book','Book','txt','book.txt',1)").run();for(const [word,count] of [['one',1],['two',2],['four',4],['five',5]] as const){native.prepare("INSERT INTO vocabulary(word,lemma,source_book_id,created_at,lookup_count) VALUES(?,?, 'book',1,?)").run(word,word,count);native.prepare('INSERT INTO book_word_frequency(book_id,lemma,occurrence_count) VALUES(?,?,?)').run('book',word,count);}const low=await listStudyWords(db,true,{frequency:'low',limit:10});const medium=await listStudyWords(db,true,{frequency:'medium',limit:1});const high=await listStudyWords(db,true,{frequency:'high',limit:10});assert.deepEqual(low.map(w=>w.occurrence_count),[1]);assert.deepEqual(medium.map(w=>w.occurrence_count),[4]);assert.deepEqual(high.map(w=>w.occurrence_count),[5]);}finally{native.close()}
});
test('repeated marking preserves first sentence and review state',async()=>{
 const {native,db}=fixture();try{
 for(const id of ['book','another'])native.prepare('INSERT INTO books(id,title,format,file_name,created_at) VALUES(?,?,?,?,?)').run(id,id,'txt',id+'.txt',1);
 const result={query:'taken',lemma:'take',entry:{word:'take',phonetic:null,translation:'拿',definition:'get',pos:null,bnc:null,frq:null,exchange:null}} satisfies DictionaryResult;
 await ensureVocabulary(db,result,'book','She had taken it.');await recordReview(db,'id','take','choice',3);
 await ensureVocabulary(db,result,'another','They take it.');const row=(await listVocabulary(db))[0];
 assert.equal(row.source_text,'She had taken it.');assert.equal(row.source_book_id,'book');assert.equal(row.familiarity,3);assert.equal(row.lookup_count,1);
 assert.equal(native.prepare('SELECT count(*) n FROM study_sources').get()!.n,2);
 }finally{native.close()}
});
test('Anki export has two fields and escapes HTML, tabs and multiline context',()=>{
 const file=ankiTSV([{word:'take',translation:'拿\t取',definition:'<get>',source_text:'A & B.\nNext.',phonetic:null} as VocabularyItem]);
 const lines=file.split('\n');assert.equal(lines.length,4);assert.equal(lines[3].split('\t').length,2);assert.match(file,/&lt;get&gt;/);assert.match(file,/A &amp; B.<br>Next./);assert.ok(file.startsWith('#separator:Tab\n#html:true'));
});
