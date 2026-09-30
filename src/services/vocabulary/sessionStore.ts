import {migrateStudyLexicon} from './lexicon';
import type {SQLiteDatabase} from 'expo-sqlite';
import {startSession,resumeSession,answerSession,reconcileSession,introduceWord,type StudySession,type StudyAnswer,type StudyDraft} from '../../features/vocabulary/sessionModel';
import {nextReview,localDay} from './review';
export type StoredStudy={id:string;state:StudySession};
async function ensure(db:SQLiteDatabase){
 await db.execAsync(`CREATE TABLE IF NOT EXISTS study_sessions(id TEXT PRIMARY KEY,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS study_admissions(day TEXT NOT NULL,word TEXT NOT NULL,was_new INTEGER NOT NULL,PRIMARY KEY(day,word));
 CREATE TABLE IF NOT EXISTS study_events(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,sequence INTEGER NOT NULL,before_state TEXT NOT NULL,word TEXT NOT NULL,before_schedule TEXT NOT NULL,settled INTEGER NOT NULL,UNIQUE(session_id,sequence));`);
}
export async function createStudySession(db:SQLiteDatabase,id:string,words:string[]){
 await ensure(db);await migrateStudyLexicon(db);
 const state=startSession(words);
 await db.withExclusiveTransactionAsync(async tx=>{
  await tx.runAsync('INSERT INTO study_sessions VALUES(?,?)',id,JSON.stringify(state));
  await admitWords(tx,state.queue);
 });
 return (await loadStudySession(db,id))!;
}
export async function nextStudyGroup(db:SQLiteDatabase,archiveId:string,candidates:string[]){
 await ensure(db);
 await db.withExclusiveTransactionAsync(async tx=>{
  const row=await tx.getFirstAsync<{state:string}>("SELECT state FROM study_sessions WHERE id='current'");
  const previous:StudySession|undefined=row?JSON.parse(row.state):undefined;
  if(previous?.queue.length)throw Error('当前小组尚未结束');
  const pending=previous?Object.keys(previous.words).filter(word=>previous.words[word].status==='deferred'):[];
  const next=resumeSession(previous,candidates);
  if(row){
   await tx.runAsync("UPDATE study_sessions SET id=? WHERE id='current'",archiveId);
   await tx.runAsync("UPDATE study_events SET session_id=? WHERE session_id='current'",archiveId);
  }
  await tx.runAsync('INSERT INTO study_sessions VALUES(?,?)','current',JSON.stringify(next));
  await admitWords(tx,next.queue.filter(word=>!pending.includes(word)));
 });
 return (await loadStudySession(db,'current'))!;
}
export async function loadStudySession(db:SQLiteDatabase,id:string):Promise<StoredStudy|null>{
 await ensure(db);
 const row=await db.getFirstAsync<{state:string}>('SELECT state FROM study_sessions WHERE id=?',id);
 return row?{id,state:JSON.parse(row.state)}:null;
}
export async function reconcileStudySession(db:SQLiteDatabase,id:string,available:string[]){
 await ensure(db);
 await db.withExclusiveTransactionAsync(async tx=>{
  const row=await tx.getFirstAsync<{state:string}>('SELECT state FROM study_sessions WHERE id=?',id);
  if(!row)return;
  const state=reconcileSession(JSON.parse(row.state),available);
  await tx.runAsync('UPDATE study_sessions SET state=? WHERE id=?',JSON.stringify(state),id);
 });
 return loadStudySession(db,id);
}
export async function saveStudyDraft(db:SQLiteDatabase,id:string,sequence:number,draft:StudyDraft,expectedWord?:string){
 await ensure(db);
 await db.withExclusiveTransactionAsync(async tx=>{
  const row=await tx.getFirstAsync<{state:string}>('SELECT state FROM study_sessions WHERE id=?',id);
  if(!row)throw Error('学习小组不存在');
  const state:StudySession=JSON.parse(row.state);
  if(state.answered!==sequence||!state.queue.length||(expectedWord!==undefined&&state.queue[0]!==expectedWord))throw Error('题目已变化');
  state.draft=draft;
  await tx.runAsync('UPDATE study_sessions SET state=? WHERE id=?',JSON.stringify(state),id);
 });
}
export async function markStudyIntroduced(db:SQLiteDatabase,id:string,word:string){
 await ensure(db);
 await db.withExclusiveTransactionAsync(async tx=>{
  const row=await tx.getFirstAsync<{state:string}>('SELECT state FROM study_sessions WHERE id=?',id);
  if(!row)throw Error('学习小组不存在');
  const state:StudySession=JSON.parse(row.state);
  if(state.queue[0]!==word)throw Error('题目已变化');
  await tx.runAsync('UPDATE study_sessions SET state=? WHERE id=?',JSON.stringify(introduceWord(state,word)),id);
 });
 return loadStudySession(db,id);
}
export async function submitStudyAnswer(db:SQLiteDatabase,id:string,eventId:string,answer:StudyAnswer,now=Date.now()){
 await ensure(db);
 await db.withExclusiveTransactionAsync(async tx=>{
  if(await tx.getFirstAsync('SELECT id FROM study_events WHERE id=?',eventId))return;
  const row=await tx.getFirstAsync<{state:string}>('SELECT state FROM study_sessions WHERE id=?',id);
  if(!row)throw Error('学习小组不存在');
  const before:StudySession=JSON.parse(row.state),word=before.queue[0];if(!word)return;
  const schedule=await tx.getFirstAsync<{due_at:number;interval_days:number;familiarity:number}>('SELECT due_at,interval_days,familiarity FROM study_lexemes WHERE lemma=?',word);
  if(!schedule)throw Error('该词已移除');
  const after=answerSession(before,answer),settled=after.words[word].status==='complete';
  // Settle only at completion; intermediate corrective answers never change dates.
  if(settled){
   const rating=after.words[word].missed?1:2;
   const next=nextReview(schedule.interval_days,rating,now);
   await tx.runAsync('UPDATE study_lexemes SET due_at=?,interval_days=?,familiarity=? WHERE lemma=?',next.due,next.days,rating,word);
   await tx.runAsync('INSERT INTO review_log VALUES(?,?,?,?,?,?,?)',eventId,word,'study',rating,now,localDay(now),schedule.due_at===0?1:0);
  }
  await tx.runAsync('INSERT INTO study_events VALUES(?,?,?,?,?,?,?)',eventId,id,after.answered,row.state,word,JSON.stringify(schedule),settled?1:0);
  await tx.runAsync('UPDATE study_sessions SET state=? WHERE id=?',JSON.stringify(after),id);
 });
 return loadStudySession(db,id);
}
export async function undoStudyAnswer(db:SQLiteDatabase,id:string){
 await ensure(db);
 await db.withExclusiveTransactionAsync(async tx=>{
  const last=await tx.getFirstAsync<{id:string;before_state:string;word:string;before_schedule:string;settled:number}>('SELECT * FROM study_events WHERE session_id=? ORDER BY sequence DESC LIMIT 1',id);
  if(!last)return;
  if(last.settled){
   const before=JSON.parse(last.before_schedule);
   await tx.runAsync('UPDATE study_lexemes SET due_at=?,interval_days=?,familiarity=? WHERE lemma=?',before.due_at,before.interval_days,before.familiarity,last.word);
   await tx.runAsync('DELETE FROM review_log WHERE id=?',last.id);
  }
  await tx.runAsync('UPDATE study_sessions SET state=? WHERE id=?',last.before_state,id);
  await tx.runAsync('DELETE FROM study_events WHERE id=?',last.id);
 });
 return loadStudySession(db,id);
}

async function admitWords(db:SQLiteDatabase,words:string[],now=Date.now()){
 for(const word of words){
  const row=await db.getFirstAsync<{due_at:number}>('SELECT due_at FROM study_lexemes WHERE lemma=?',word);
  if(row)await db.runAsync('INSERT OR IGNORE INTO study_admissions VALUES(?,?,?)',localDay(now),word,row.due_at===0?1:0);
 }
}
export async function studyAdmissions(db:SQLiteDatabase,now=Date.now()){
 await ensure(db);
 return (await db.getFirstAsync<{newWords:number;reviewWords:number}>('SELECT COALESCE(SUM(was_new),0) AS newWords,COALESCE(SUM(1-was_new),0) AS reviewWords FROM study_admissions WHERE day=?',localDay(now)))!;
}
export async function studyCandidates<T extends {word:string;due_at:number;created_at:number;lookup_count?:number}>(db:SQLiteDatabase,words:T[],plan:{newLimit:number;reviewLimit:number;order?:'default'|'frequency'},now=Date.now()){
 const usage=await studyAdmissions(db,now);
 const admitted=await db.getAllAsync<{word:string}>('SELECT word FROM study_admissions WHERE day=?',localDay(now));
 const used=new Set(admitted.map(row=>row.word));
 const eligible=words.filter(word=>!used.has(word.word));
 const byFrequency=(a:T,b:T)=>((b.lookup_count??0)-(a.lookup_count??0))||a.created_at-b.created_at||a.word.localeCompare(b.word);
 const reviews=eligible.filter(w=>w.due_at>0&&w.due_at<=now).sort((a,b)=>a.due_at-b.due_at||(plan.order==='frequency'?byFrequency(a,b):a.created_at-b.created_at)||a.word.localeCompare(b.word));
 const fresh=eligible.filter(w=>w.due_at===0).sort(plan.order==='frequency'?byFrequency:(a,b)=>a.created_at-b.created_at||a.word.localeCompare(b.word));
 return [...reviews.slice(0,Math.max(0,plan.reviewLimit-usage.reviewWords)),...fresh.slice(0,Math.max(0,plan.newLimit-usage.newWords))];
}
