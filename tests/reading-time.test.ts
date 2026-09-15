import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readingSlices,focusPreferences,localDay} from '../src/features/reading-time/model';
test('reading stops at inactivity cutoff and never counts background or backwards clock',()=>{
 assert.equal(readingSlices(1000,601000,1000,true).reduce((n,r)=>n+r.milliseconds,0),300000);
 assert.deepEqual(readingSlices(1000,5000,1000,false),[]);
 assert.deepEqual(readingSlices(5000,1000,1000,true),[]);
});
test('reading splits local midnight without losing milliseconds',()=>{
 const start=new Date(2026,8,9,23,59,30).getTime();
 assert.deepEqual(readingSlices(start,start+60000,start,true),[{day:localDay(start),milliseconds:30000},{day:localDay(start+60000),milliseconds:30000}]);
});
test('focus defaults silent and preferences are bounded',()=>{
 assert.equal(focusPreferences({}).vibrate,false);
 assert.deepEqual(focusPreferences({minutes:NaN,breakMinutes:-2,vibrate:true,checkInMinutes:999}),{minutes:25,breakMinutes:1,vibrate:true,checkInMinutes:120});
});
import {DatabaseSync} from 'node:sqlite';
import type {SQLiteDatabase} from 'expo-sqlite';
import {schema} from '../src/db/schema';
import {recordReading,readingSummary} from '../src/features/reading-time/repository';
import {readingStreak} from '../src/features/reading-time/model';
test('reading persists per book, check-in happens once after cumulative threshold',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(schema);
 const adapter={runAsync:async(sql:string,...args:any[])=>db.prepare(sql).run(...args),getFirstAsync:async(sql:string,...args:any[])=>db.prepare(sql).get(...args),getAllAsync:async(sql:string,...args:any[])=>db.prepare(sql).all(...args),withExclusiveTransactionAsync:async(fn:(t:any)=>Promise<void>)=>{db.exec('BEGIN');try{await fn(adapter);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}} as unknown as SQLiteDatabase;
 await recordReading(adapter,'a',[{day:'2026-09-09',milliseconds:120000}],5);
 assert.equal((await readingSummary(adapter)).checkins.length,0);
 await recordReading(adapter,'b',[{day:'2026-09-09',milliseconds:180000}],5);
 await recordReading(adapter,'a',[{day:'2026-09-09',milliseconds:1000}],5);
 const result=await readingSummary(adapter);assert.equal(result.checkins.length,1);assert.equal(result.days[0].milliseconds,301000);assert.equal(result.books.length,2);db.close();
});
test('streak includes yesterday until today is complete',()=>{
 const now=new Date(2026,8,10,12).getTime();assert.equal(readingStreak(['2026-09-08','2026-09-09'],now),2);assert.equal(readingStreak(['2026-09-08'],now),0);
});

import {countdownRemaining} from '../src/features/reading-time/model';
test('countdown derives remaining from deadline instead of timer ticks',()=>{
 assert.equal(countdownRemaining(61000,1000),60);
 assert.equal(countdownRemaining(61000,60500),1);
 assert.equal(countdownRemaining(61000,90000),0);
 assert.equal(countdownRemaining(0,1000),0);
});
