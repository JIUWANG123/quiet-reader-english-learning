import test from 'node:test';
import assert from 'node:assert/strict';
import {quizChoices,sameAnswer,clozeSentence} from '../src/features/vocabulary/quiz';
test('late queue card is always an option, duplicates and blanks are removed',()=>{
 const options=quizChoices('teeth',['a','b','c','d','TEETH','','a'],()=>0.4);
 assert.equal(options.length,4);assert.ok(options.includes('teeth'));assert.equal(new Set(options.map(x=>x.toLowerCase())).size,4);
 assert.deepEqual(quizChoices('teeth',['TEETH','']),['teeth']);
});
test('spelling tolerates case and surrounding spaces but rejects wrong words',()=>{
 assert.ok(sameAnswer('  Teeth ','teeth'));assert.equal(sameAnswer('tooth','teeth'),false);
});
test('cloze preserves surrounding words and hides all exact target tokens',()=>{
 assert.equal(clozeSentence('The cat sat by a cathedral. Cat!',['cat']),'The ______ sat by a cathedral. ______!');
 assert.equal(clozeSentence('Nothing matches.',['cat']),null);
});
import {clozeQuestion} from '../src/features/vocabulary/quiz';
test('cloze answer retains original inflection and only masks selected occurrence',()=>{
 assert.deepEqual(clozeQuestion('She had taken it, then taken another.',['take','taken'],8),{text:'She had ______ it, then taken another.',answer:'taken',offset:8});
 assert.deepEqual(clozeQuestion('Cat and cat.',['cat'],8),{text:'Cat and ______.',answer:'cat',offset:8});
 assert.equal(clozeQuestion('A cathedral.',['cat']),null);
 assert.equal(clozeQuestion('Cat and cat.',['cat'],2),null);
 assert.equal(clozeQuestion('Cat and cat.',['cat']),null);
});
import {studyQuestionKind} from '../src/features/vocabulary/quiz';
test('missing learning content never produces an empty objective question',()=>{
 assert.equal(studyQuestionKind({translation:null,hasSentence:true,options:4}),'missing');
 assert.equal(studyQuestionKind({translation:'拿',hasSentence:false,options:4}),'recognition');
 assert.equal(studyQuestionKind({translation:'拿',hasSentence:true,options:1}),'reveal');
 assert.equal(studyQuestionKind({translation:'拿',hasSentence:true,options:4}),'cloze');
});

import {meaningChoices} from '../src/features/vocabulary/quiz';
test('meaning options reject overlapping senses and incompatible part of speech',()=>{
 const choices=meaningChoices('n.家具；陈设',['n.家具','n.陈设；设备','v.布置','n.牙齿','n.苹果'],()=>0.5);
 assert.deepEqual(new Set(choices),new Set(['n.家具；陈设','n.牙齿','n.苹果']));
});
