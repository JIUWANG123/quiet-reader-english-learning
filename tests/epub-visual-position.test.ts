import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {epubVisualPosition} from '../src/features/reader/epubVisualPosition';

test('same-layout hidden-page scroll is verified without waiting for presentation frames',async()=>{
 let frames=0;
 const container={scrollLeft:0,scrollTop:0,clientWidth:390,clientHeight:720};
 const context:any={requestAnimationFrame:(f:()=>void)=>{frames++;f();},rendition:{currentLocation:()=>({start:{index:2}}),manager:{container,scrollTo:(x:number,y:number)=>{container.scrollLeft=x;container.scrollTop=y;}}}};
 context.window=context;vm.runInNewContext(epubVisualPosition,context);
 const location={qrVisual:{layout:'',section:2,x:780,y:0,width:390,height:720}};
 assert.equal(await context.qrVisualPosition.restore(location),true);
 assert.equal(frames,0,'preparing a hidden position must not wait for redundant paints; final paint gate owns presentation');
 assert.equal(await context.qrVisualPosition.restore({qrVisual:{...location.qrVisual,width:400}}),false);
 assert.equal(await context.qrVisualPosition.restore({qrVisual:{...location.qrVisual,layout:'changed'}}),false);
 assert.equal(await context.qrVisualPosition.restore({qrVisual:{...location.qrVisual,section:3}}),false);
});
