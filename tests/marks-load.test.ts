import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadReaderMarks} from '../src/features/reader/loadMarks';
import type {WordMark,SentenceMark} from '../src/features/reader/marks';
const word={lemma:'take',style:'highlight',color:'#ffe082',show_meaning:1,contextual_meaning:'v.拿'};
const note={section_key:'epub:0',start_offset:0,end_offset:9,text:'She left.',style:'underline',color:'#8899aa'};
test('dictionary failure cannot hide saved words or notes',async()=>{
  let words:WordMark[]=[],notes:SentenceMark[]=[];const errors:string[]=[];
  await loadReaderMarks({words:async()=>[word],sentences:async()=>[note],forms:async()=>{throw Error('database locked')}},{words:rows=>{words=rows},sentences:rows=>{notes=rows},error:value=>errors.push(value),active:()=>true});
  assert.equal(notes[0],note);assert.deepEqual(words[0].forms,['take']);assert.ok(errors.some(Boolean));
});
test('slow dictionary never delays original marks and notes; querying is bounded',async()=>{
  let active=0,peak=0,wordsShown=false,notesShown=false;
  await loadReaderMarks({words:async()=>Array.from({length:20},(_,i)=>({...word,lemma:'word'+i})),sentences:async()=>[note],forms:async lemma=>{
    assert.equal(wordsShown,true);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return [lemma+'s'];
  }},{words:()=>{wordsShown=true},sentences:()=>{notesShown=true},error:()=>{},active:()=>true});
  assert.equal(notesShown,true);assert.ok(peak<=4);
});
test('failed word read does not hide notes; obsolete loads cannot publish',async()=>{
  let notes:SentenceMark[]=[];
  await loadReaderMarks({words:async()=>{throw Error()},sentences:async()=>[note]},{words:()=>assert.fail(),sentences:rows=>{notes=rows},error:()=>{},active:()=>true});
  assert.equal(notes[0],note);
  await loadReaderMarks({words:async()=>[word],sentences:async()=>[note]},{words:()=>assert.fail(),sentences:()=>assert.fail(),error:()=>assert.fail(),active:()=>false});
});
