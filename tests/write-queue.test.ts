import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeQueue} from '../src/db/writeQueue';
test('writes serialize and a failed operation does not poison the queue',async()=>{
 const queue=writeQueue();const order:string[]=[];let release!:()=>void;
 const first=queue(async()=>{order.push('start');await new Promise<void>(r=>release=r);order.push('end');});
 const second=queue(async()=>{order.push('next');throw Error('disk full');});const caught=second.catch(()=>{});
 await new Promise(r=>setTimeout(r,0));assert.deepEqual(order,['start']);release();await first;await caught;
 assert.deepEqual(order,['start','end','next']);assert.equal(await queue(async()=>42),42);
});
test('only transient lock failures retry',async()=>{
 const queue=writeQueue();let attempts=0;
 assert.equal(await queue(async()=>{if(++attempts<3)throw Error('SQLITE_BUSY');return 'saved';}),'saved');assert.equal(attempts,3);
 let fatal=0;await assert.rejects(queue(async()=>{fatal++;throw Error('disk full');}));assert.equal(fatal,1);
});
