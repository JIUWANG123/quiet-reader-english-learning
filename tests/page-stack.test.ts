import assert from 'node:assert/strict';
import test from 'node:test';
import {makePageStack,rotatePageStack} from '../src/features/reader/pageStack';
test('page stack rotates previous/current/next slots without a gap',()=>{
 const rows=[0,1,2].map(page_index=>({page_index,text:String(page_index),heading:null}));
 const stack=makePageStack(rows,1);assert.equal(stack.previous?.page_index,0);assert.equal(stack.next?.page_index,2);
 const next=rotatePageStack(stack,1,{page_index:3,text:'3',heading:null});assert.equal(next.current?.page_index,2);assert.equal(next.previous?.page_index,1);assert.equal(next.next?.page_index,3);
 const prev=rotatePageStack(stack,-1,{page_index:-1,text:'-1',heading:null});assert.equal(prev.current?.page_index,0);assert.equal(prev.next?.page_index,1);
});
