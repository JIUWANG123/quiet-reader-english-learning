import test from 'node:test';
import assert from 'node:assert/strict';
import * as pool from '../src/features/reader/epubPool';
const location=(cfi:string)=>({start:{cfi},end:{cfi}} as any);
test('cold current starts only next; previous starts after next ready',()=>{
 let p=pool.readyEpubDocument(pool.createEpubPool('saved'),'0',location('saved'));
 assert.ok(p.next);assert.equal(p.previous,null);
 p=pool.readyEpubDocument(p,p.next!.id,location('next'));
 assert.ok(p.previous);assert.equal(p.current.location?.start.cfi,'saved');
});
test('layout invalidation admits only one heavy job and rejects stale completion',()=>{
 const api=pool as any;
 assert.equal(typeof api.scheduleEpubPreview,'function');
 let p:any=pool.readyEpubDocument(pool.createEpubPool('a'),'0',location('a'));
 p=pool.readyEpubDocument(p,p.next!.id,location('b'));
 p=pool.readyEpubDocument(p,p.previous!.id,location('z'));
 const old=p.next!;p=pool.invalidateEpubNeighbors(p);p=api.scheduleEpubPreview(p,0);
 assert.equal([p.previous,p.next].filter((d:any)=>d?.status==='loading').length,1);
 assert.equal(p.next?.id,old.id);assert.equal(pool.readyEpubDocument(p,old.id,location('bad'),old.revision??0),p);
});
test('two hidden failures retry serially after backoff, then stop',()=>{
 const api=pool as any;assert.equal(typeof api.failEpubPreview,'function');
 let p:any=pool.readyEpubDocument(pool.createEpubPool('a'),'0',location('a'));
 p=api.failEpubPreview(p,p.next.id,0,0);
 assert.equal(p.current.location.start.cfi,'a');
 p=api.scheduleEpubPreview(p,499);assert.equal([p.previous,p.next].filter((d:any)=>d?.status==='loading').length,1,'other direction can work while retry waits');
 p=pool.readyEpubDocument(p,p.previous!.id,location('z'));
 p=api.scheduleEpubPreview(p,500);assert.equal(p.next.origin,'retry');assert.equal(p.next.status,'loading');
 p=api.failEpubPreview(p,p.next.id,p.next.revision,600);
 p=api.scheduleEpubPreview(p,2099);assert.notEqual(p.next.status,'loading');
 p=api.scheduleEpubPreview(p,2100);assert.equal(p.next.status,'loading');
 p=api.failEpubPreview(p,p.next.id,p.next.revision,2200);
 p=api.scheduleEpubPreview(p,99999);assert.equal(p.next.status,'failed');
});
test('reverse intent prioritizes queued direction without interrupting active job',()=>{
 const api=pool as any;assert.equal(typeof api.prioritizeEpubPreview,'function');
 let p:any=pool.readyEpubDocument(pool.createEpubPool('a'),'0',location('a'));
 const active=p.next!.id;p=api.prioritizeEpubPreview(p,-1);
 assert.equal(p.next!.id,active);assert.equal(p.previous,null);
 p=pool.readyEpubDocument(p,active,location('b'));assert.equal((p.previous as any).status,'loading');
});

