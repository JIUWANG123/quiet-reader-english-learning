import type {SQLiteDatabase} from 'expo-sqlite';
import type {VocabularyItem} from './repository';
export type FrequencyFilter='all'|'high'|'medium'|'low';
export type Filters={book:string; familiarity:number; due:'all'|'due'|'new'; frequency?:FrequencyFilter};
export const defaultFilters:Filters={book:'all',familiarity:-1,due:'all',frequency:'all'};
export type StudyOrder='default'|'frequency';
export function filterWords<T extends VocabularyItem>(words:T[],f:Filters,now=Date.now()){
 const frequency=f.frequency??'all';
 return words.filter(w=>(f.book==='all'||(f.book==='deleted'?(w.source_books?.some(b=>b.id===null)??w.source_book_id===null):(w.source_books?.some(b=>b.id===f.book)??w.source_book_id===f.book)))&&(f.familiarity<0||w.familiarity===f.familiarity)&&(f.due==='all'||(f.due==='new'?w.due_at===0:w.due_at<=now))&&(frequency==='all'||(frequency==='high'?w.lookup_count>=5:frequency==='medium'?w.lookup_count>=2&&w.lookup_count<=4:w.lookup_count===1)));
}
export function localDay(now=Date.now()){const d=new Date(now);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export type Plan={newLimit:number;reviewLimit:number;order?:StudyOrder};
export const defaultPlan:Plan={newLimit:10,reviewLimit:30,order:'default'};
export function normalizePlan(value:Partial<Plan>):Plan{
 const safe=(n:unknown,fallback:number)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(200,Math.floor(n))):fallback;
 return {newLimit:safe(value.newLimit,10),reviewLimit:safe(value.reviewLimit,30),order:value.order==='frequency'?'frequency':'default'};
}
export async function readPlan(db:SQLiteDatabase){const row=await db.getFirstAsync<{value:string}>("SELECT value FROM settings WHERE key='study_plan'");try{return normalizePlan(JSON.parse(row?.value??'{}'));}catch{return defaultPlan;}}
export async function savePlan(db:SQLiteDatabase,plan:Plan){await db.runAsync("INSERT INTO settings(key,value) VALUES('study_plan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(normalizePlan(plan)));}
export async function todayStats(db:SQLiteDatabase,now=Date.now()){
 return (await db.getFirstAsync<{attempts:number;correct:number;words:number;newWords:number;reviewWords:number}>(`SELECT count(*) attempts,COALESCE(sum(rating>=2),0) correct,count(DISTINCT word) words,
 count(DISTINCT CASE WHEN was_new=1 THEN word END) newWords,
 count(DISTINCT CASE WHEN was_new=0 THEN word END) reviewWords FROM review_log WHERE day=?`,localDay(now)))!;
}
export async function studyQueue(db:SQLiteDatabase,words:VocabularyItem[],plan:Plan,now=Date.now()){
 const stats=await todayStats(db,now);
 const frequency=(a:VocabularyItem,b:VocabularyItem)=>plan.order==='frequency'?(b.lookup_count-a.lookup_count||a.created_at-b.created_at||a.word.localeCompare(b.word)):a.created_at-b.created_at||a.word.localeCompare(b.word);
 const fresh=words.filter(w=>w.due_at===0).sort(frequency).slice(0,Math.max(0,plan.newLimit-stats.newWords));
 const reviews=words.filter(w=>w.due_at>0&&w.due_at<=now).sort((a,b)=>a.due_at-b.due_at||(plan.order==='frequency'?b.lookup_count-a.lookup_count:0)||a.created_at-b.created_at||a.word.localeCompare(b.word)).slice(0,Math.max(0,plan.reviewLimit-stats.reviewWords));
 return [...reviews,...fresh];
}
// Conservative interval progression, not a claim of implementing FSRS.
export function nextReview(interval:number,rating:number,now:number){
 if(!Number.isInteger(rating)||rating<0||rating>3)throw Error('Invalid rating');
 const days=rating===0?0:rating===1?Math.max(1,Math.round(interval*0.6)):rating===2?Math.max(3,Math.round(interval*2)):Math.max(7,Math.round(interval*2.5));
 return {days:Math.min(365,days),due:now+(rating===0?600000:Math.min(365,days)*86400000)};
}
export async function recordReview(db:SQLiteDatabase,id:string,word:string,mode:string,rating:number,now=Date.now()){
 await db.withExclusiveTransactionAsync(async tx=>{
  if(await tx.getFirstAsync('SELECT id FROM review_log WHERE id=?',id))return;
  const current=await tx.getFirstAsync<VocabularyItem>('SELECT * FROM vocabulary WHERE word=? COLLATE NOCASE',word);
  if(!current)throw Error('单词已移除，请重新载入队列');
  const next=nextReview(current.interval_days,rating,now);
  await tx.runAsync('UPDATE vocabulary SET familiarity=?,interval_days=?,due_at=? WHERE word=? COLLATE NOCASE',rating,next.days,next.due,word);
  await tx.runAsync('INSERT INTO review_log VALUES(?,?,?,?,?,?,?)',id,current.word,mode,rating,now,localDay(now),(await tx.getFirstAsync<{was_new:number}>('SELECT was_new FROM review_log WHERE word=? AND day=? ORDER BY reviewed_at LIMIT 1',current.word,localDay(now)))?.was_new??(current.due_at===0?1:0));
 });
}
