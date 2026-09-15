import test from 'node:test';
import assert from 'node:assert/strict';
import {createEpubPool,readyEpubDocument,turnEpubPool} from '../src/features/reader/epubPool';
const loc=(cfi:string)=>({start:{cfi},end:{cfi},atStart:false,atEnd:true} as any);
test('EPUB section end still prepares a following page',()=>{
 let p=createEpubPool('a');p=readyEpubDocument(p,'0',loc('a'));assert.ok(p.next);
 p=readyEpubDocument(p,p.next!.id,loc('b'));const n=turnEpubPool(p,1);
 assert.equal(n.current.location?.start.cfi,'b');assert.ok(n.next,'chapter end must not stop continuous paging');
});
test('EPUB pool can rotate repeatedly without losing the current page',()=>{
 let p=createEpubPool('a');p=readyEpubDocument(p,'0',loc('a'));
 for(const cfi of ['b','c','d']){const id=p.next!.id;p=readyEpubDocument(p,id,loc(cfi));p=turnEpubPool(p,1);assert.equal(p.current.location?.start.cfi,cfi);}
 assert.equal(p.previous?.location?.start.cfi,'c');
});

test('fifty turns reuse three identities and invalidate recycled locations',()=>{
 let p=readyEpubDocument(createEpubPool('a'),'0',loc('a'));
 const ids=new Set([p.current.id,p.previous!.id,p.next!.id]);
 for(let i=0;i<50;i++){
  p=readyEpubDocument(p,p.next!.id,loc('page-'+i));
  const outgoing=p.previous!,revision=outgoing.revision??0;
  p=turnEpubPool(p,1);
  assert.equal(p.next!.id,outgoing.id);
  assert.equal(p.next!.revision,revision+1);
  assert.equal(p.next!.location,undefined);
  assert.equal(p.next!.anchor,p.current.location!.start.cfi);
  for(const item of [p.current,p.previous!,p.next!])assert.ok(ids.has(item.id));
 }
 assert.equal(p.serial,3);
});


import {invalidateEpubNeighbors} from '../src/features/reader/epubPool';
test('layout invalidation preserves current page and rejects old neighbor readiness',()=>{
 const pool:any={serial:3,current:{id:'a',anchor:'saved',direction:0,location:{start:{cfi:'current'}}},previous:{id:'b',revision:2,location:{start:{cfi:'old-before'}}},next:{id:'c',revision:5,location:{start:{cfi:'old-after'}}}};
 const next=invalidateEpubNeighbors(pool);
 assert.equal(next.current,pool.current);
 assert.equal(next.previous?.revision,3);assert.equal(next.next?.revision,6);
 assert.equal(next.previous?.location,undefined);assert.equal(next.next?.location,undefined);
 assert.equal(next.next?.anchor,'current');
 assert.equal(turnEpubPool(next,1),next);
});
