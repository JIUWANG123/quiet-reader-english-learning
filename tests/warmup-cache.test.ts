import test from 'node:test';
import assert from 'node:assert/strict';
import {createWarmupSnapshot,readWarmup,warmupKey,writeWarmup,type WarmupSettings} from '../src/features/reader/warmupCache';
const settings:WarmupSettings={width:390,height:720,fontSize:20,lineHeight:1.8,margin:12,theme:'light',paragraphTranslation:false,readingMode:'swipe'};
const cfi='epubcfi(/6/2!/4/1:0)';
test('warmup cache round-trips locations and nearby anchors',()=>{let raw='';const store={read:()=>raw,write:(v:string)=>{raw=v;}};const snapshot=createWarmupSnapshot('book-v1',settings,[cfi],{current:cfi,next:cfi,section:0});assert.equal(writeWarmup(store,snapshot),true);assert.deepEqual(readWarmup(store,'book-v1',settings),snapshot);});
test('settings or source changes invalidate warmup without fallback data',()=>{let raw=JSON.stringify(createWarmupSnapshot('book-v1',settings,[cfi]));const store={read:()=>raw,write:()=>{}};assert.equal(readWarmup(store,'book-v2',settings),undefined);assert.equal(readWarmup(store,'book-v1',{...settings,width:401}),undefined);});
test('malformed, oversized and interrupted caches are ignored',()=>{let raw='not json';const store={read:()=>raw,write:()=>{}};assert.equal(readWarmup(store,'book-v1',settings),undefined);raw=JSON.stringify({key:warmupKey('book-v1',settings),sourceFingerprint:'book-v1',locations:['plain text']});assert.equal(readWarmup(store,'book-v1',settings),undefined);assert.equal(writeWarmup(store,{...createWarmupSnapshot('book-v1',settings,[cfi]),locations:Array.from({length:20001},()=>cfi)}),false);});
