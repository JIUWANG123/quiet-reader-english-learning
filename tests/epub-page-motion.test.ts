import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {epubPageMotion} from '../src/features/reader/epubPageMotion';

async function turn(on:boolean){
 const sent:any[]=[];const observed:string[]=[];let next=0;
 const node={style:{transition:'',transform:'',opacity:''}};
 const container={scrollLeft:0,scrollTop:0,offsetWidth:1,addEventListener(){}};
 const context:any={
  window:{
   qrPageAnimation:on,
   matchMedia:()=>({matches:false}),
   ReactNativeWebView:{postMessage:(raw:string)=>sent.push(JSON.parse(raw))},
  },
  rendition:{
   next:async()=>{next++;},
   prev:async()=>{},
   manager:{container},
   _layout:{flow:()=> 'paginated'},
   currentLocation:()=>({}),
   getContents:()=>[{window:{getSelection:()=>null},document:{documentElement:node}}],
  },
  requestAnimationFrame:(fn:()=>void)=>{observed.push(node.style.transform);fn();},
  setTimeout:(fn:()=>void)=>{fn();return 1;},
  clearTimeout:()=>{},
 };
 context.window.window=context.window;
 context.window.rendition=context.rendition;
 vm.runInNewContext(epubPageMotion,context,{filename:'epub-page-motion.js'});
 await context.rendition.next();
 return {sent,observed,next};
}

test('EPUB page motion animates the new page in when animation is enabled',async()=>{
 const result=await turn(true);
 assert.equal(result.next,1);
 assert.deepEqual(result.observed,['translateX(24px)']);
 assert.equal(result.sent.at(-1).type,'qr-turn-settled');
});

test('EPUB page motion keeps an immediate turn when animation is disabled',async()=>{
 const result=await turn(false);
 assert.equal(result.next,1);
 assert.deepEqual(result.observed,[]);
 assert.equal(result.sent.at(-1).type,'qr-turn-settled');
});
