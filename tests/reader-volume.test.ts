import test from 'node:test';
import assert from 'node:assert/strict';
import {volumeKeysEnabledForReadingMode} from '../src/features/reader/volumePolicy';

test('volume page turns are disabled for EPUB scroll reading',()=>{
 assert.equal(volumeKeysEnabledForReadingMode(true,'scroll'),false);
 assert.equal(volumeKeysEnabledForReadingMode(true,'swipe'),true);
 assert.equal(volumeKeysEnabledForReadingMode(true,'tap'),true);
 assert.equal(volumeKeysEnabledForReadingMode(false,'swipe'),false);
});
