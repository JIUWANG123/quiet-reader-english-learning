import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {epubPreviewBoot} from '../src/features/reader/epubPreviewBoot';

async function run(direction:-1|0|1,edge=false,fail=false){
 const sent:any[]=[];let next=0,previous=0;
 const context:any={setTimeout,clearTimeout,requestAnimationFrame:(fn:()=>void)=>fn(),
   qrProgress:{pause(){}},ReactNativeWebView:{postMessage:(raw:string)=>sent.push(JSON.parse(raw))},
   rendition:{next:()=>{next++;return fail?Promise.reject(Error()):Promise.resolve();},prev:()=>{previous++;return Promise.resolve();},
     manager:{currentLocation:async()=>[]},located:()=>({start:{cfi:'neighbor'}})}};
 context.window=context;vm.runInNewContext(epubPreviewBoot(direction),context);
 context.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-position-ready',location:{start:{cfi:'anchor'},atStart:edge,atEnd:edge}}));
 await new Promise<void>(resolve=>setImmediate(resolve));return{sent,next,previous};
}
test('EPUB preview steps exactly once through epub.js without reporting restored anchor as ready',async()=>{
 for(const direction of [-1,1] as const){const result=await run(direction);assert.equal(result.next,direction===1?1:0);assert.equal(result.previous,direction===-1?1:0);assert.deepEqual(result.sent,[{type:'qr-preview-ready',location:{start:{cfi:'neighbor'}},revision:0}]);}
});
test('EPUB preview reports book edges and failed rendering without committing a location',async()=>{
 assert.equal((await run(1,true)).sent[0].type,'qr-preview-ready','chapter edge must still try the next spine item');
 assert.equal((await run(-1,true)).sent[0].type,'qr-preview-ready','chapter edge must still try the previous spine item');
 assert.deepEqual((await run(1,false,true)).sent,[{type:'qr-preview-error',code:'PREVIEW_STEP',revision:0}]);
 const active=await run(0);assert.equal(active.sent[0].type,'qr-position-ready');assert.equal(active.next,0);
});

test('hidden preview restore failures are surfaced once instead of silently freezing navigation',()=>{
 const sent:any[]=[];
 const context:any={setTimeout,clearTimeout,ReactNativeWebView:{postMessage:(raw:string)=>sent.push(JSON.parse(raw))}};
 context.window=context;vm.runInNewContext(epubPreviewBoot(1),context);
 const failure=JSON.stringify({type:'qr-position-error',code:'RESTORE_ANCHOR'});
 context.ReactNativeWebView.postMessage(failure);context.ReactNativeWebView.postMessage(failure);
 assert.deepEqual(sent,[{type:'qr-preview-error',code:'RESTORE_ANCHOR',revision:0}]);
 context.qrPreviewPromoted=true;context.ReactNativeWebView.postMessage(failure);
 assert.equal(sent[1].type,'qr-position-error');
});

test('a stalled preview times out and cannot later commit a stale ready result',async()=>{
 const sent:any[]=[];let timeout=()=>{};let complete!:()=>void;
 const context:any={setTimeout:(fn:()=>void)=>{timeout=fn;return 1;},clearTimeout:()=>{},requestAnimationFrame:(fn:()=>void)=>fn(),
  ReactNativeWebView:{postMessage:(raw:string)=>sent.push(JSON.parse(raw))},
  rendition:{next:()=>new Promise<void>(resolve=>{complete=resolve;}),manager:{currentLocation:async()=>[]},located:()=>({start:{cfi:'late'}})}};
 context.window=context;vm.runInNewContext(epubPreviewBoot(1),context);
 context.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-position-ready',location:{start:{cfi:'anchor'}}}));
 await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(typeof complete,'function');
 timeout();complete();await new Promise<void>(resolve=>setImmediate(resolve));
 assert.deepEqual(sent,[{type:'qr-preview-error',code:'PREVIEW_TIMEOUT',revision:0}]);
});





test('cancelled preview cannot start queued navigation on recycled rendition',async()=>{
 let steps=0;const context:any={setTimeout,clearTimeout,requestAnimationFrame:(fn:()=>void)=>fn(),ReactNativeWebView:{postMessage:()=>{}},rendition:{next:async()=>{steps++;},manager:{currentLocation:async()=>[]},located:()=>({start:{cfi:'late'}})}};
 context.window=context;vm.runInNewContext(epubPreviewBoot(1,7),context);
 context.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-position-ready',location:{start:{cfi:'anchor'}}}));context.qrCancelPreview();
 await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(steps,0);
});

test('preview paints in its WebView without a second native bridge round trip',async()=>{
 const sent:any[]=[],painted:any[]=[];const context:any={setTimeout,clearTimeout,requestAnimationFrame:(f:()=>void)=>f(),qrPaintPage:(l:any,r:number)=>painted.push({l,r}),ReactNativeWebView:{postMessage:(s:string)=>sent.push(JSON.parse(s))},rendition:{next:async()=>{},manager:{currentLocation:async()=>[]},located:()=>({start:{cfi:'next'}})}};context.window=context;vm.runInNewContext(epubPreviewBoot(1,9),context);context.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-position-ready',location:{start:{cfi:'source'}}}));await new Promise<void>(r=>setImmediate(r));assert.equal(painted.length,1);assert.equal(painted[0].r,9);assert.equal(sent.length,0);
});
