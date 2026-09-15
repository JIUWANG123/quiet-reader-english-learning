import test from 'node:test';
import assert from 'node:assert/strict';
import {shortMeaning} from '../src/features/reader/shortMeaning';
import {chapterPassages} from '../src/services/ai/chapter';
import {assistancePrompt,resultFields,OpenAICompatibleProvider} from '../src/services/ai/provider';
test('inline meanings have consistent POS, one sense and bounded length',()=>{
 assert.equal(shortMeaning('**n.** 吸血鬼；吸血者'),'n.吸血鬼');
 assert.equal(shortMeaning('名词： 家具；陈设'),'n.家具');
 assert.equal(shortMeaning('adj. 不情愿的'),'adj.不情愿的');
 assert.equal(shortMeaning('n.'),'');assert.equal(shortMeaning(null),'');
 assert.ok(shortMeaning('v.这是一个非常非常长的中文释义').length<=11);
 assert.match(assistancePrompt('mark_meaning'),/at most 8 Chinese/);
});
test('chapter splitting keeps every word, paragraph order and surrogate pair',()=>{
 const text='First paragraph.\n\n'+('A reluctant vampire 🦇 walked slowly. ').repeat(250)+'\n\nLast paragraph.';
 const chunks=chapterPassages(text);assert.ok(chunks.length>3);assert.ok(chunks.every(s=>s.length<=1200));
 assert.equal(chunks.join('').replace(/\s/g,''),text.replace(/\s/g,''));
 assert.ok(chunks.every(s=>!/[\uD800-\uDBFF]$/.test(s)&&! /^[\uDC00-\uDFFF]/.test(s)));
 assert.deepEqual(chapterPassages(' \n '),[]);assert.deepEqual(resultFields('chapter'),['translation']);
});
test('chapter translation sends neighboring passages and uses a sufficient response budget',async()=>{
 const original=globalThis.fetch;let body:any;
 globalThis.fetch=async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:'{"translation":"他走了。"}'}}]}));};
 try{const result=await new OpenAICompatibleProvider('test',{baseUrl:'https://example.test',model:'test',temperature:.2}).assist({mode:'chapter',targetText:'He left.',previousContext:'He was upset.',followingContext:'She remained.'});assert.equal(result.translation,'他走了。');assert.equal(body.max_tokens,1200);assert.equal(JSON.parse(body.messages[1].content).followingContext,'She remained.');}finally{globalThis.fetch=original;}
});
