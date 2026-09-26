import assert from 'node:assert/strict';
import test from 'node:test';
import {startSession,answerSession,resumeSession} from '../src/features/vocabulary/sessionModel';

test('correction survives serialization and only completes after two spaced successes',()=>{
 let s=startSession(['a','b','c','d','e']);
 s=answerSession(s,'wrong');
 assert.equal(s.queue[0],'b');
 s=answerSession(s,'correct');s=answerSession(s,'correct');
 assert.equal(s.queue[0],'a');
 s=answerSession(s,'correct');
 s=JSON.parse(JSON.stringify(s));
 assert.equal(s.words.a.streak,1);
 assert.equal(s.words.a.status,'active');
 while(s.queue[0]!=='a')s=answerSession(s,'correct');
 s=answerSession(s,'correct');
 assert.equal(s.words.a.status,'complete');
 assert.equal(Object.keys(s.words).length,5);
});
test('single difficult word is deferred rather than immediately repeated; reveal is not correct',()=>{
 let s=startSession(['a']);s=answerSession(s,'reveal');
 assert.equal(s.words.a.status,'deferred');
 assert.equal(s.words.a.streak,0);
 assert.deepEqual(s.queue,[]);
});
test('initial groups contain at most five distinct words',()=>{
 const s=startSession(['a','a','b','c','d','e','f']);
 assert.deepEqual(s.queue,['a','b','c','d','e']);
});
import {reconcileSession} from '../src/features/vocabulary/sessionModel';
test('removed words leave queue without counting as completed or retaining their draft',()=>{
 const s=startSession(['a','b','c']);
 s.draft={mode:'choice',input:'',revealed:true,correct:true,answer:'a',prompt:'a',choices:['a','b']};
 const next=reconcileSession(s,['b','c']);
 assert.deepEqual(next.queue,['b','c']);
 assert.equal(next.words.a.status,'removed');
 assert.equal(next.answered,0);
 assert.equal(next.draft,undefined);
 assert.equal(Object.values(next.words).filter(w=>w.status==='complete').length,0);
 assert.deepEqual(reconcileSession(next,['a','b','c']).queue,['b','c']);
});
import {introduceWord} from '../src/features/vocabulary/sessionModel';
test('introduction is persistent and never counts as an answer',()=>{
 const s=startSession(['a']);const next=introduceWord(s,'a');
 assert.equal(next.words.a.introduced,true);
 assert.equal(next.answered,0);assert.equal(next.words.a.status,'active');
 assert.equal(next.words.a.streak,0);
 assert.deepEqual(introduceWord(next,'a'),next);
});
test('introduced new word needs recognition and sentence practice before completion',()=>{
 let s=introduceWord(startSession(['a','b','c']),'a');
 s=answerSession(s,'correct');
 assert.equal(s.words.a.status,'active');
 assert.equal(s.words.a.practiceCorrect,1);
 assert.equal(s.queue[2],'a');
 s=answerSession(s,'correct');s=answerSession(s,'correct');
 s=answerSession(s,'correct');
 assert.equal(s.words.a.status,'complete');
});
test('session transitions work without a structuredClone global',()=>{
 const original=globalThis.structuredClone;
 try{
  Object.defineProperty(globalThis,'structuredClone',{value:undefined,configurable:true,writable:true});
  const s=startSession(['a','b','c']);
  assert.equal(introduceWord(s,'a').words.a.introduced,true);
  assert.equal(answerSession(s,'wrong').words.a.missed,true);
  assert.deepEqual(reconcileSession(s,['b','c']).queue,['b','c']);
  assert.equal(s.words.a.missed,false);
 }finally{Object.defineProperty(globalThis,'structuredClone',{value:original,configurable:true,writable:true});}
});

test('deferred correction carries its spacing debt across groups',()=>{
 let s=answerSession(startSession(['a']),'wrong');
 let next=resumeSession(s,['b','c']);
 assert.deepEqual(next.queue,['b','c','a']);
 next=answerSession(next,'correct');next=answerSession(next,'correct');
 assert.equal(next.queue[0],'a');
 assert.equal(next.words.a.missed,true);
 assert.deepEqual(resumeSession(s,[]).queue,[]);
});


test('removing intervening words preserves correction spacing',()=>{
 const s=answerSession(startSession(['a','b','c','d','e']),'wrong');
 const next=reconcileSession(s,['a','d','e']);
 assert.deepEqual(next.queue,['d','e','a']);
 assert.deepEqual(reconcileSession(s,['a']).queue,[]);
});
