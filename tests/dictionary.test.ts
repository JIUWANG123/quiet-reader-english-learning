import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { extractSingleLookupWord, normalizeLookupWord, tokenizeReadableText, sentenceFromSelection } from '../src/features/dictionary/normalize';

test('vocabulary keeps the selected occurrence instead of an earlier repeated word', () => {
  assert.equal(sentenceFromSelection({previousContext: 'He took a book. She had ',targetText:'taken',followingContext:' the wrong train. He waited.'}), 'She had taken the wrong train.');
});

const databasePath = path.resolve('assets/dictionary/dictionary.db');

test('normalizes punctuation and preserves meaningful apostrophes and hyphens', () => {
  assert.equal(normalizeLookupWord('“Taken,”'), 'taken');
  assert.equal(normalizeLookupWord('Couldn’t'), "couldn't");
  assert.deepEqual(tokenizeReadableText('A well-known child.'), ['','A',' ','well-known',' ','child','.']);
  assert.equal(extractSingleLookupWord('“Taken,”'), 'taken');
  assert.equal(extractSingleLookupWord('two words'), null);
});

test('ECDICT resolves required inflections through the lemma index', () => {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const resolve = (word: string) => {
    const row = db.prepare('SELECT lemma FROM lemmas WHERE form = ? COLLATE NOCASE').get(word) as { lemma?: string } | undefined;
    return row?.lemma ?? word;
  };
  assert.equal(resolve('give'), 'give');
  assert.equal(resolve('gave'), 'give');
  assert.equal(resolve('given'), 'give');
  assert.equal(resolve('taking'), 'take');
  assert.equal(resolve('teeth'), 'tooth');
  assert.equal(resolve('children'), 'child');
  for (const word of ['reluctant', 'contemptuous']) {
    assert.ok(db.prepare('SELECT translation FROM entries WHERE word = ? COLLATE NOCASE').get(word));
  }
  db.close();
});
