import {test} from 'node:test';import assert from 'node:assert/strict';
import {pagePositionsFor,pageSlotsFor,pageSurfacesFor} from '../src/features/reader/pageStack';

// Mirrors the identity formula in TxtReader.tsx.
const slotIds=(screen:{id:string;y:number;max:number;step:number},sectionKey:string)=>{
 const positions={previous:Math.max(0,screen.y-screen.step),current:screen.y,next:Math.min(screen.max,screen.y+screen.step)};
 return {previous:positions.previous===screen.y?screen.id:'previous:'+sectionKey+':'+positions.previous,current:screen.id,next:positions.next===screen.y?screen.id:'next:'+sectionKey+':'+positions.next};
};
const keysOf=(ids:Record<'previous'|'current'|'next',string>)=>pageSurfacesFor(ids).map(surface=>surface.key);

// Reproduces the reported error: "Encountered two children with the same key,
// `txt:1:initial`". screen.max is still 0 before the first measurement, so every
// slot collapses onto the current page id.
test('every slot collapses onto the current id before the first measurement',()=>{
 const ids=slotIds({id:'txt:1:initial',y:0,max:0,step:1},'txt:1');
 assert.equal(ids.previous,'txt:1:initial');
 assert.equal(ids.next,'txt:1:initial');
 assert.equal(ids.current,ids.previous);
});

test('rendered surface keys are unique at boot and still mount the visible page',()=>{
 const ids=slotIds({id:'txt:1:initial',y:0,max:0,step:1},'txt:1');
 const keys=keysOf(ids);
 assert.equal(new Set(keys).size,keys.length);
 assert.deepEqual(keys,['txt:1:initial']);
});

test('an id shared by two slots is mounted once, and current always wins',()=>{
 assert.deepEqual(pageSlotsFor({previous:'same',current:'same',next:'same'}),['current']);
 assert.deepEqual(pageSlotsFor({previous:'same',current:'same',next:'cur'}),['current','next']);
 assert.deepEqual(pageSlotsFor({previous:'cur',current:'cur',next:'same'}),['current','next']);
 assert.deepEqual(pageSlotsFor({previous:'same',current:'cur',next:'same'}),['current','previous']);
});

test('a collapsed initial stack keeps the current page at the viewport origin',()=>{
 assert.deepEqual(pagePositionsFor({previous:'same',current:'same',next:'same'},320),{same:0});
});

test('a last-page next slot cannot overwrite the current page position',()=>{
 assert.deepEqual(pagePositionsFor({previous:'previous',current:'current',next:'current'},320),{current:0,previous:-320});
});

test('the visible page is mounted for every reachable slot arrangement',()=>{
 const screens=[{id:'txt:1:initial',y:0,max:0,step:1},{id:'txt:5:4096',y:4096,max:12000,step:600},{id:'txt:5:0',y:0,max:600,step:600},{id:'txt:9:9999',y:9999,max:9999,step:600}];
 for(const screen of screens){
  const ids=slotIds(screen,'txt:1');
  assert.ok(pageSlotsFor(ids).includes('current'),`current missing for ${JSON.stringify(screen)}`);
  const keys=keysOf(ids);
  assert.equal(new Set(keys).size,keys.length,`duplicate key for ${JSON.stringify(screen)}`);
 }
});

test('distinct surfaces are ordered by their rendered key',()=>{
 assert.deepEqual(pageSlotsFor({previous:'a',current:'b',next:'c'}),['current','next','previous']);
 assert.deepEqual(pageSlotsFor({previous:'1',current:'2',next:'3'}),['current','next','previous']);
});

test('a last screen keeps its previous document and folds next onto current',()=>{
 const ids=slotIds({id:'txt:9:9999',y:9999,max:9999,step:600},'txt:9');
 assert.equal(ids.next,'txt:9:9999');
 assert.equal(ids.previous,'previous:txt:9:9399');
 assert.deepEqual(keysOf(ids),['txt:9:9999','previous:txt:9:9399']);
	assert.equal(new Set(keysOf(ids)).size,2);
});

test('neighbouring screens keep distinct keys',()=>{
 const ids=slotIds({id:'txt:5:4096',y:4096,max:12000,step:600},'txt:5');
 assert.equal(ids.previous,'previous:txt:5:3496');
 assert.equal(ids.next,'next:txt:5:4696');
 assert.deepEqual(keysOf(ids),['txt:5:4096','next:txt:5:4696','previous:txt:5:3496']);
 assert.equal(new Set(keysOf(ids)).size,3);
});

test('a first screen in a long document has no previous surface',()=>{
 const ids=slotIds({id:'txt:5:0',y:0,max:12000,step:600},'txt:5');
 assert.equal(ids.previous,'txt:5:0');
 assert.equal(ids.next,'next:txt:5:600');
 assert.deepEqual(keysOf(ids),['txt:5:0','next:txt:5:600']);
});

test('a prepared page keeps its React surface key when promoted from next to current',()=>{
 const before=pageSurfacesFor({previous:'a',current:'b',next:'c'});
 const after=pageSurfacesFor({previous:'b',current:'c',next:'d'});
 assert.deepEqual(before.find(surface=>surface.id==='c'),{key:'c',id:'c',slot:'next'});
 assert.deepEqual(after.find(surface=>surface.id==='c'),{key:'c',id:'c',slot:'current'});
});
