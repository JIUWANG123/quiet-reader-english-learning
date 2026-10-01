import test from 'node:test';
import assert from 'node:assert/strict';
import {countWordOccurrences,mergeWordOccurrences} from '../src/services/books/wordFrequency';
test('counts book words case-insensitively and preserves apostrophes and hyphens',()=>{
 assert.deepEqual(countWordOccurrences("Word word WORD don't don't well-known well-known."),{word:3,"don't":2,"well-known":2});
});
test('merges chapter frequency maps without sharing state',()=>{
 const target={word:2};assert.deepEqual(mergeWordOccurrences(target,{word:3,other:1}),{word:5,other:1});
});
