import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sentenceContext} from '../src/services/vocabulary/sentenceContext';
test('sentence provenance never expands old chapter context',()=>{
 assert.equal(sentenceContext('First paragraph.\n\nThe target. More here.\n\nLast paragraph.','The target.'),'The target. More here.');
 assert.equal(sentenceContext('Old unrelated chapter','The target.'),'The target.');
 assert.equal(sentenceContext('{"previous":"large old context","following":"more"}','The target.'),'The target.');
});
