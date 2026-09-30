import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {SQLiteDatabase} from 'expo-sqlite';
import {schema} from '../src/db/schema';
import {createStudySession,loadStudySession,submitStudyAnswer,undoStudyAnswer,saveStudyDraft,nextStudyGroup,markStudyIntroduced,studyAdmissions,studyCandidates,reconcileStudySession} from '../src/services/vocabulary/sessionStore';
test('file database reopens with correction state; duplicate submit and undo are atomic',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'qr-study-'));let native=new DatabaseSync(join(dir,'app.db'));
 const db={execAsync:async(sql:string)=>native.exec(sql),
 getAllAsync:async(sql:string,...args:any[])=>native.prepare(sql).all(...args),
 getFirstAsync:async(sql:string,...args:any[])=>native.prepare(sql).get(...args)??null,
 runAsync:async(sql:string,...args:any[])=>native.prepare(sql).run(...args),
 withExclusiveTransactionAsync:async(fn:(tx:any)=>Promise<void>)=>{native.exec('BEGIN');try{await fn(db);native.exec('COMMIT')}catch(e){native.exec('ROLLBACK');throw e}}
 } as unknown as SQLiteDatabase;
 try{
 native.exec(schema);
 for(const w of ['a','b','c','d','e'])native.prepare('INSERT INTO vocabulary(word,lemma,created_at) VALUES(?,?,1)').run(w,w);
 await createStudySession(db,'s',['a','b','c','d','e']);
 assert.equal((await studyAdmissions(db)).newWords,5);
 assert.equal((await studyCandidates(db,[{word:'fresh',due_at:0,created_at:1}],{newLimit:5,reviewLimit:30})).length,0);
 const ranked=await studyCandidates(db,[{word:'low',due_at:0,created_at:1,lookup_count:1},{word:'high',due_at:0,created_at:2,lookup_count:8},{word:'review-low',due_at:1,created_at:1,lookup_count:2},{word:'review-high',due_at:1,created_at:2,lookup_count:9}],{newLimit:2,reviewLimit:2,order:'frequency'});
 assert.deepEqual(ranked.map(word=>word.word),['review-high','review-low']);
 await markStudyIntroduced(db,'s','a');
 native.close();native=new DatabaseSync(join(dir,'app.db'));
 assert.equal((await loadStudySession(db,'s'))?.state.words.a.introduced,true);
 assert.equal((await loadStudySession(db,'s'))?.state.answered,0);
 await saveStudyDraft(db,'s',0,{mode:'cloze',input:'a',revealed:true,correct:false,answer:'a',prompt:'____',choices:['a','b']});
 native.close();native=new DatabaseSync(join(dir,'app.db'));
 assert.equal((await loadStudySession(db,'s'))?.state.draft?.revealed,true);
 await submitStudyAnswer(db,'s','1','wrong');
 assert.equal((await loadStudySession(db,'s'))?.state.draft,undefined);
 await assert.rejects(saveStudyDraft(db,'s',0,{mode:'cloze',input:'old',revealed:true,correct:false,answer:'a',prompt:'____',choices:['a','b']}));
 await submitStudyAnswer(db,'s','2','correct');await submitStudyAnswer(db,'s','3','correct');
 await submitStudyAnswer(db,'s','4','correct');
 native.close();native=new DatabaseSync(join(dir,'app.db'));
 const restored=await loadStudySession(db,'s');assert.equal(restored?.state.words.a.streak,1);
 assert.equal(native.prepare("SELECT due_at FROM study_lexemes WHERE lemma='a'").get()!.due_at,0);
 await submitStudyAnswer(db,'s','5','correct');
 await submitStudyAnswer(db,'s','5','correct');
 assert.equal((await loadStudySession(db,'s'))?.state.answered,5);
 assert.ok(Number(native.prepare("SELECT due_at FROM study_lexemes WHERE lemma='d'").get()!.due_at)>0);
 await undoStudyAnswer(db,'s');
 assert.equal((await loadStudySession(db,'s'))?.state.answered,4);
 assert.equal(native.prepare("SELECT due_at FROM study_lexemes WHERE lemma='d'").get()!.due_at,0);
 await createStudySession(db,'draft-guard',['a','b']);
 await reconcileStudySession(db,'draft-guard',['b']);
 await assert.rejects(saveStudyDraft(db,'draft-guard',0,{mode:'choice',input:'',revealed:false,correct:null,answer:'a',prompt:'a',choices:['a','b']},'a'));
 assert.equal((await loadStudySession(db,'draft-guard'))?.state.draft,undefined);
 await createStudySession(db,'current',['a','b','c','d','e']);
 await submitStudyAnswer(db,'current','c1','wrong');
 await submitStudyAnswer(db,'current','c2','correct');
 await submitStudyAnswer(db,'current','c3','correct');
 await submitStudyAnswer(db,'current','c4','correct');
 await submitStudyAnswer(db,'current','c5','correct');
 await submitStudyAnswer(db,'current','c6','correct');
 await submitStudyAnswer(db,'current','c7','defer');
 const next=await nextStudyGroup(db,'archive',['b','c','d','e']);
 assert.equal(next.state.words.a.streak,1);
 assert.equal((await studyAdmissions(db)).newWords,5);
 assert.equal(next.state.words.a.missed,true);
 assert.equal(next.state.queue.includes('a'),true);
 assert.ok(await loadStudySession(db,'archive'));
 assert.equal(native.prepare("SELECT count(*) n FROM study_events WHERE session_id='archive'").get()!.n,7);
 native.exec("CREATE TRIGGER reject_event BEFORE INSERT ON study_events BEGIN SELECT RAISE(ABORT,'disk full'); END;");
 await assert.rejects(submitStudyAnswer(db,'s','6','correct'));
 assert.equal((await loadStudySession(db,'s'))?.state.answered,4);
 }finally{native.close();rmSync(dir,{recursive:true,force:true});}
});
