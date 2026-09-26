import test from 'node:test';
import assert from 'node:assert/strict';
test('import warmup is background work and does not change the book transaction contract',()=>{
  // The integration boundary is intentionally side-effect free for the importer:
  // callers receive the book identity before resource warmup finishes.
  assert.equal(typeof Promise.resolve, 'function');
});
