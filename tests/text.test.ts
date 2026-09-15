import assert from 'node:assert/strict';
import test from 'node:test';
import { fileFormat, MAX_IMPORT_BYTES, normalizeText, paginateText, readingProgress } from '../src/services/books/text';
import { parseSettings } from '../src/features/settings/model';

test('recognizes allowed file extensions case-insensitively', () => {
  assert.equal(MAX_IMPORT_BYTES, 128 * 1024 * 1024);
  assert.ok(MAX_IMPORT_BYTES > 67 * 1024 * 1024);
  assert.equal(fileFormat('My.Book.EPUB'), 'epub');
  assert.equal(fileFormat('novel.TXT'), 'txt');
  assert.throws(() => fileFormat('novel.pdf'));
});
test('normalizes BOM and newlines and rejects empty or undecodable text', () => {
  assert.equal(normalizeText('\uFEFFHello\r\nWorld\r!'), 'Hello\nWorld\n!');
  for (const value of ['   ', 'bad\0text', 'bad\uFFFDtext']) assert.throws(() => normalizeText(value));
});
test('large books preserve every character including Unicode and paragraphs', () => {
  const text = ('Chapter 1\n\nHello, world! “I couldn’t leave.” 📖\n\n').repeat(10000);
  const pages = paginateText(text);
  assert.ok(pages.length > 100);
  assert.equal(pages.map(page => page.text).join(''), text);
  assert.ok(pages.every(page => page.text.length <= 3502 && page.text.length > 0));
});
test('long tokens never split surrogate pairs or loop indefinitely', () => {
  const text = 'a'.repeat(3499) + '📖'.repeat(9000);
  const pages = paginateText(text);
  assert.equal(pages.map(page => page.text).join(''), text);
  assert.ok(pages.every(page => !/[\uD800-\uDBFF]$/.test(page.text)));
});
test('progress is bounded and supports last-page completion', () => {
  assert.equal(readingProgress(0, 0, 4), 0);
  assert.equal(readingProgress(2, 0.5, 4), 0.625);
  assert.equal(readingProgress(3, 1, 4), 1);
  assert.equal(readingProgress(0, 0, 0), 0);
  assert.equal(readingProgress(100, 1, 4), 1);
});
test('corrupt settings recover and unreasonable settings are clamped', () => {
  assert.equal(parseSettings().paragraphTranslation,false);
  assert.equal(parseSettings('{"theme":"dark"}').paragraphTranslation,false);
  assert.equal(parseSettings('{"paragraphTranslation":true}').paragraphTranslation,true);
  assert.equal(parseSettings('{"paragraphTranslation":"true"}').paragraphTranslation,false);
  assert.equal(parseSettings('{"readingMode":"tap","pageAnimation":false}').readingMode,'tap');
  assert.equal(parseSettings('{"readingMode":"tap","pageAnimation":false}').pageAnimation,false);
  assert.equal(parseSettings('{"readingMode":"scroll"}').readingMode,'scroll');
  assert.equal(parseSettings('{"readingMode":"invalid"}').readingMode,'swipe');
  assert.equal(parseSettings('{bad').theme, 'paper');
  assert.equal(parseSettings('null').fontSize, 21);
  assert.equal(parseSettings('{"theme":"blue","fontSize":100}').fontSize, 32);
});
