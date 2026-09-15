import assert from 'node:assert/strict';
import test from 'node:test';
import {pageTurnDecision as decide} from '../src/features/reader/pageTurnDecision';
test('page turns require a rendered neighbor, including fast flings',()=>{
 assert.equal(decide(-200,-1200,400,true,false),0);
 assert.equal(decide(200,1200,400,false,true),0);
 assert.equal(decide(-200,0,400,true,true),1);
 assert.equal(decide(200,0,400,true,true),-1);
});
test('short drags rebound, direction reversal cancels, invalid layout cannot turn',()=>{
 assert.equal(decide(-20,-100,400,true,true),0);
 assert.equal(decide(-20,-1000,400,true,true),1);
 assert.equal(decide(-200,1000,400,true,true),0);
 assert.equal(decide(-200,-1000,0,true,true),0);
 assert.equal(decide(-2,-2000,400,true,true),0);
});
