import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reinforce} from '../src/features/vocabulary/reinforcement';
test('missed words repeat until two consecutive correct answers',()=>{
 assert.deepEqual(reinforce(undefined,true),{streak:undefined,repeat:false});
 let state=reinforce(undefined,false);assert.equal(state.repeat,true);
 state=reinforce(state.streak,true);assert.equal(state.repeat,true);
 state=reinforce(state.streak,false);assert.equal(state.streak,0);
 state=reinforce(state.streak,true);assert.equal(state.repeat,true);
 state=reinforce(state.streak,true);assert.equal(state.repeat,false);
});
