import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeReadingEvent, classifyProcessExit, appendReadingEvent} from '../src/features/reader/diagnosticsCore';
import {ReaderSessionJournal} from '../src/features/reader/readerLifecycleCore';
import {RuntimeRegistry} from '../src/features/reader/epubRuntimeCore';

test('diagnostics include bounded numerical fields and never export private strings',()=>{
 const row=sanitizeReadingEvent('webview-process-gone',{bookId:'Secret title',cfi:'epubcfi(/6/4)',target:'file:///private/book.epub',slot:'next',revision:3,active:false,didCrash:true,archiveSize:1024,code:'BAD /private/path'},123,'1.11.2');
 assert.equal(row.event,'webview-process-gone');assert.equal(row.slot,'next');assert.equal(row.revision,3);assert.equal(row.active,false);assert.equal(row.didCrash,true);
 assert.equal(row.archiveSize,1024);assert.equal(row.code,undefined);
 const json=JSON.stringify(row);for(const secret of ['Secret title','epubcfi','/private/','book.epub'])assert.equal(json.includes(secret),false);
});
test('diagnostic ring keeps the latest 500 rows',()=>{
 const rows:{time:number}[]=[];
 for(let time=0;time<601;time++)appendReadingEvent(rows,{time});
 assert.equal(rows.length,500);assert.equal(rows[0].time,101);assert.equal(rows[499].time,600);
});
test('exit reason classification distinguishes user termination and real failure',()=>{
 assert.deepEqual(classifyProcessExit(10),{reason:'USER_REQUESTED',crash:false});
 assert.deepEqual(classifyProcessExit(4),{reason:'CRASH',crash:true});
 assert.deepEqual(classifyProcessExit(5),{reason:'CRASH_NATIVE',crash:true});
 assert.deepEqual(classifyProcessExit(6),{reason:'ANR',crash:true});
 assert.deepEqual(classifyProcessExit(3),{reason:'LOW_MEMORY',crash:true});
 assert.deepEqual(classifyProcessExit(9),{reason:'EXCESSIVE_RESOURCE_USAGE',crash:true});
 assert.deepEqual(classifyProcessExit(999),{reason:'UNKNOWN',crash:false});
});
test('session journal reports an unfinished prior session once and writes clean end durably',()=>{
 let saved='';const storage={read:()=>saved,write:(value:string)=>{saved=value;}};
 const first=new ReaderSessionJournal(storage);
 first.start('session-1','book-1',100);
 const next=new ReaderSessionJournal(storage);
 assert.deepEqual(next.recoverPrevious(),{sessionId:'session-1',bookId:'book-1',startedAt:100});
 assert.equal(next.recoverPrevious(),null);
 next.start('session-2','book-2',200);next.end('session-2');
 assert.equal(new ReaderSessionJournal(storage).recoverPrevious(),null);
});
test('old runtime token cannot retire or delete a new lease with same namespace',()=>{
 const registry=new RuntimeRegistry();
 registry.activate('shared','old');registry.activate('shared','new');
 registry.retire('shared','old');
 assert.equal(registry.canDelete('shared','old','new'),false);
 assert.equal(registry.canDelete('shared','new','new'),false);
 registry.retire('shared','new');
 assert.equal(registry.canDelete('shared','new','new'),true);
});
