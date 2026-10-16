import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPreloadEpubNeighbors } from '../src/features/reader/epubPool';
import { readingBridgeScript } from '../src/features/reader/readingBridge.generated';
import { readingModeForBridge } from '../src/features/reader/readingModeBridge';
test('only swipe pagination preloads the previous and next EPUB documents',()=>{
 assert.equal(shouldPreloadEpubNeighbors('scroll'),false);
 assert.equal(shouldPreloadEpubNeighbors('tap'),false);
 assert.equal(shouldPreloadEpubNeighbors('swipe'),true);
});
test('injected reading bridge stays self-contained and does not call CommonJS require',()=>{
 assert.equal(readingBridgeScript.includes('require('),false);
});
test('swipe mode blocks vertical WebView scrolling and leaves page turns to the native stack',()=>{
 assert.match(readingBridgeScript,/touchAction\s*=\s*'none'/);
 assert.equal(readingBridgeScript.includes("post({type:'qr-turn'"),false);
});
test('the WebView bridge receives swipe mode instead of the generic native mode',()=>{
 assert.equal(readingModeForBridge('swipe'),'swipe');
 assert.equal(readingModeForBridge('tap'),'tap');
 assert.equal(readingModeForBridge('scroll'),'scroll');
});
