import test from 'node:test';
import assert from 'node:assert/strict';
import {PreviewWatchdog} from '../src/features/reader/previewWatchdog';
test('soft warning retains job; late successful paint remains valid',()=>{
 const w=new PreviewWatchdog(0);assert.equal(w.poll(1799),null);assert.equal(w.poll(1800),'slow');
 assert.equal(w.poll(1814),null);assert.equal(w.poll(3000),null);assert.equal(w.stage,'created');
 w.advance('page-painted',3000);assert.equal(w.lastProgressAt,3000);
});
test('only genuine stage advances refresh stalled watchdog',()=>{
 const w=new PreviewWatchdog(0);w.advance('navigation-start',7000);assert.equal(w.poll(8000),'slow');
 w.advance('navigation-start',14000);assert.equal(w.lastProgressAt,7000);
 w.advance('webview-ready',14001);assert.equal(w.lastProgressAt,7000);
 assert.equal(w.poll(14999),null);assert.equal(w.poll(15000),'timeout');
});
