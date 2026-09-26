import {test} from 'node:test';import assert from 'node:assert/strict';
import {createProgressSaver} from '../src/features/reader/progressSaver';
import {latestPosition,type Position} from '../src/features/reader/positionModel';
const position=(updated:number):Position=>({page:updated,count:100,fraction:.2,progress:updated/100,updated});
test('failed write keeps newest recovery during an in-flight save; retry coalesces to latest',async()=>{
 let reject!:(error:Error)=>void;const slots:string[]=[];const writes:number[]=[];let failure=true;
 const saver=createProgressSaver({journal:p=>{slots.push(JSON.stringify(p));},onError:()=>{},save:async p=>{writes.push(p.updated);if(failure)await new Promise<void>((_,r)=>reject=r);}});
 saver.stage(position(1));const first=saver.flush();saver.stage(position(2));saver.stage(position(3));reject(Error('disk full'));assert.equal(await first,false);
 assert.deepEqual(latestPosition(slots),position(3));failure=false;assert.equal(await saver.flush(),true);assert.deepEqual(writes,[1,3]);await saver.close();
});
test('close checkpoints pending position even if database stays unavailable',async()=>{
 let recovery:Position|null=null;const saver=createProgressSaver({journal:p=>{recovery=p;},save:async()=>{throw Error('disk full');},onError:()=>{}});
 saver.stage(position(9));assert.equal(await saver.close(),false);assert.deepEqual(recovery,position(9));
});
test('does not claim recovery success if both writes fail',async()=>{
 let message='';const saver=createProgressSaver({journal:()=>{throw Error('disk full');},save:async()=>{throw Error('disk full');},onError:m=>message=m});
 saver.stage(position(4));await saver.flush();assert.equal(message,'位置未保存，请重试。');await saver.close();
});

test('identical positions do not repeat database or recovery writes',async()=>{
 const writes:number[]=[],journals:number[]=[];
 const saver=createProgressSaver({save:async p=>{writes.push(p.updated);},journal:p=>journals.push(p.updated),onError:()=>{}});
 saver.stage(position(1));await saver.flush();saver.stage({...position(1),updated:2});await saver.flush();await saver.close();
 assert.deepEqual(writes,[1]);assert.deepEqual(journals,[1]);
});
