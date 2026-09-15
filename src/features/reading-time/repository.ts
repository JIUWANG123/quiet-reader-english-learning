import type {SQLiteDatabase} from 'expo-sqlite';
import {focusDefaults,focusPreferences,type FocusPreferences} from './model';
export async function loadPreferences(db:SQLiteDatabase):Promise<FocusPreferences>{
 const row=await db.getFirstAsync<{value:string}>('SELECT value FROM settings WHERE key=?','reading_focus');
 try{return focusPreferences(JSON.parse(row?.value??'{}'));}catch{return {...focusDefaults};}
}
export async function savePreferences(db:SQLiteDatabase,value:FocusPreferences){
 await db.runAsync('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','reading_focus',JSON.stringify(focusPreferences(value)));
}
export async function recordReading(db:SQLiteDatabase,bookId:string,slices:{day:string;milliseconds:number}[],goalMinutes:number){
 if(!slices.length)return;
 await db.withExclusiveTransactionAsync(async tx=>{
  for(const slice of slices){
   if(!Number.isSafeInteger(slice.milliseconds)||slice.milliseconds<=0)continue;
   await tx.runAsync('INSERT INTO reading_daily(day,book_id,milliseconds) VALUES(?,?,?) ON CONFLICT(day,book_id) DO UPDATE SET milliseconds=milliseconds+excluded.milliseconds',slice.day,bookId,slice.milliseconds);
   const total=await tx.getFirstAsync<{n:number}>('SELECT SUM(milliseconds) n FROM reading_daily WHERE day=?',slice.day);
   if((total?.n??0)>=goalMinutes*60000)await tx.runAsync('INSERT OR IGNORE INTO reading_checkins(day,created_at) VALUES(?,?)',slice.day,Date.now());
  }
 });
}
export async function readingSummary(db:SQLiteDatabase){
 const [days,books,checkins]=await Promise.all([
  db.getAllAsync<{day:string;milliseconds:number}>('SELECT day,SUM(milliseconds) milliseconds FROM reading_daily GROUP BY day ORDER BY day DESC'),
  db.getAllAsync<{book_id:string;title:string;milliseconds:number}>("SELECT d.book_id,COALESCE(b.title,'已移除的书籍') title,SUM(d.milliseconds) milliseconds FROM reading_daily d LEFT JOIN books b ON b.id=d.book_id GROUP BY d.book_id ORDER BY milliseconds DESC"),
  db.getAllAsync<{day:string}>('SELECT day FROM reading_checkins ORDER BY day DESC')
 ]);
 return {days,books,checkins};
}
