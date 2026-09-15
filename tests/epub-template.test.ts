import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareEpubTemplate} from '../src/features/reader/epubTemplate';
test('EPUB template retains fractional percentage and safe section payload',()=>{
 const source="type: 'onRendered'; section: section, var percentage = Math.floor(percent * 100); var chapter = getChapter(location);";
 const fixed=prepareEpubTemplate(source);
 assert.ok(fixed.includes('var percentage = percent * 100;'));
 assert.ok(!fixed.includes('section: section,'));
 assert.ok(fixed.includes('try{chapter=getChapter(location);}'));
});
