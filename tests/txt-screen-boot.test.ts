import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {txtScreenBoot} from '../src/features/reader/txtScreenBoot';

test('TXT restoration suppresses initial progress and waits for fonts and painted position',async()=>{
  const frames:Array<()=>void>=[],messages:any[]=[];
  const listeners:Record<string,()=>void>={};
  let resolveFonts!:()=>void;
  const context:any={scrollY:0,innerHeight:600,document:{body:{},documentElement:{scrollHeight:2600},fonts:{ready:new Promise<void>(r=>{resolveFonts=r;})}},
    requestAnimationFrame:(fn:()=>void)=>frames.push(fn),
    ResizeObserver:class{observe(){}},
    addEventListener:(name:string,fn:()=>void)=>{listeners[name]=fn;},
    ReactNativeWebView:{postMessage:(raw:string)=>messages.push(JSON.parse(raw))}};
  context.window=context;
  context.scrollTo=(_x:number,y:number)=>{context.scrollY=y;listeners.scroll?.();};
  vm.runInNewContext(txtScreenBoot({fraction:.65}),context);
  listeners.scroll();assert.equal(messages.length,0);
  assert.equal(frames.length,0);
  resolveFonts();await new Promise<void>(resolve=>setImmediate(resolve));
  frames.shift()!();assert.equal(context.scrollY,1300);assert.equal(messages.length,0);
  frames.shift()!();assert.equal(messages[0].type,'qr-screen-ready');assert.equal(messages[0].y,1300);
  listeners.scroll();assert.equal(messages[1].value,.65);
  context.qrMeasure();context.qrMeasure();assert.equal(frames.length,1);
  frames.shift()!();assert.equal(messages.length,2,'unchanged geometry must not cause render loops');
});

test('TXT preview restores its absolute offset instead of the active page fraction',async()=>{
  const frames:Array<()=>void>=[];const messages:any[]=[];
  const context:any={scrollY:0,innerHeight:600,document:{body:{},documentElement:{scrollHeight:2600}},
    requestAnimationFrame:(fn:()=>void)=>frames.push(fn),ResizeObserver:class{observe(){}},addEventListener:()=>{},
    ReactNativeWebView:{postMessage:(raw:string)=>messages.push(JSON.parse(raw))}};
  context.window=context;context.scrollTo=(_x:number,y:number)=>{context.scrollY=y;};
  vm.runInNewContext(txtScreenBoot({y:552}),context);await Promise.resolve();
  frames.shift()!();frames.shift()!();assert.equal(messages[0].y,552);
});


