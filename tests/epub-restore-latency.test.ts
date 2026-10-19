import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {restoreEpubPosition} from '../src/features/reader/epubPosition';
test('ready rendition is checked immediately without a fixed polling delay',async()=>{
 const sent:any[]=[],delays:number[]=[];const location={start:{cfi:'a'},end:{cfi:'z'}};
 const context:any={setTimeout:(fn:()=>void,ms:number)=>{delays.push(ms);return 1;},clearTimeout:()=>{},ReactNativeWebView:{postMessage:(raw:string)=>sent.push(JSON.parse(raw))},rendition:{display:async()=>{},manager:{currentLocation:async()=>[1]},located:()=>location},ePub:{CFI:{prototype:{compare:(a:string,b:string)=>a.localeCompare(b)}}}};
 context.window=context;vm.runInNewContext(restoreEpubPosition('b'),context);await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(sent[0]?.type,'qr-position-ready');assert.ok(!delays.includes(100));
});

test('same-layout visual anchor bypasses expensive CFI redisplay',async()=>{
 let displays=0;const location={start:{cfi:'b'},end:{cfi:'z'}};const sent:any[]=[];
 const context:any={setTimeout,clearTimeout,qrVisualPosition:{restore:async()=>true},ReactNativeWebView:{postMessage:(s:string)=>sent.push(JSON.parse(s))},rendition:{display:async()=>{displays++;},manager:{currentLocation:async()=>[1]},located:()=>location},ePub:{CFI:{prototype:{compare:(a:string,b:string)=>a.localeCompare(b)}}}};context.window=context;
 vm.runInNewContext((restoreEpubPosition as any)('b',{start:{cfi:'b'},qrVisual:{}}),context);await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(sent[0]?.type,'qr-position-ready');assert.equal(displays,0);
});

test('cancelled restore cannot move a recycled visual anchor',async()=>{
 let moves=0;const context:any={setTimeout,clearTimeout,qrVisualPosition:{restore:async()=>{moves++;return true;}},ReactNativeWebView:{postMessage:()=>{}},rendition:{display:async()=>{moves++;}}};context.window=context;
 vm.runInNewContext(restoreEpubPosition('b',{qrVisual:{}}),context);context.qrCancelRestore();await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(moves,0);
});

test('scroll restore accepts epub.js visible location after display settles',async()=>{
 const sent:any[]=[],location={start:{cfi:'other'},end:{cfi:'other-end'}};
 const context:any={setTimeout,clearTimeout,ReactNativeWebView:{postMessage:(s:string)=>sent.push(JSON.parse(s))},rendition:{display:async()=>{},manager:{currentLocation:async()=>[1]},located:()=>location},ePub:{CFI:{prototype:{compare:()=>1}}}};context.window=context;
 vm.runInNewContext((restoreEpubPosition as any)('saved-cfi',undefined,'scroll'),context);await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(sent[0]?.type,'qr-position-ready');
});

test('paginated restore accepts a saved CFI just beyond a repaginated page edge in the same section',async()=>{
 const sent:any[]=[];let displays=0;
 const saved='epubcfi(/6/22!/4/22/3:156)';
 const location={start:{cfi:'epubcfi(/6/22!/4/12/5:335)',index:10},end:{cfi:'epubcfi(/6/22!/4/22/3:155)',index:10}};
 const context:any={
  setTimeout,clearTimeout,
  ReactNativeWebView:{postMessage:(s:string)=>sent.push(JSON.parse(s))},
  book:{spine:{get:()=>({index:10})}},
  rendition:{display:async()=>{displays++;},manager:{currentLocation:async()=>[1]},located:()=>location},
  ePub:{CFI:{prototype:{compare:(a:string,b:string)=>a.localeCompare(b)}}}
 };context.window=context;
 vm.runInNewContext(restoreEpubPosition(saved),context);await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(displays,1);
 assert.equal(sent[0]?.type,'qr-position-ready');
});
