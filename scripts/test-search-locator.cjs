const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {epubSearchText,searchMatches}=require('../.test-build/src/services/books/searchText');
const {chromium}=require('C:/Users/Ciel Li/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out={};new Function('exports',ts.transpileModule(fs.readFileSync('src/features/reader/searchLocator.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(out);
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage();
 const html='<html><body><p>Repeated phrase.</p><p>She <em>knew</em> &amp; smiled. 🐈</p><p>Repeated phrase.</p></body></html>';
 await page.setContent(html);await page.addScriptTag({content:out.searchLocator});
 const text=epubSearchText(html),matches=searchMatches(text,'Repeated phrase.',false);
 assert.equal(matches.length,2);
 for(let i=0;i<2;i++){const position=await page.evaluate(hit=>{const range=qrSearchRange(document,hit);return {text:range.toString(),paragraph:Array.from(document.querySelectorAll('p')).indexOf(range.startContainer.parentElement)};},matches[i]);assert.equal(position.text,'Repeated phrase.');assert.equal(position.paragraph,i*2);}
 const cross=searchMatches(text,'knew & smiled',false)[0];assert.equal(await page.evaluate(hit=>qrSearchRange(document,hit).toString(),cross),'knew & smiled');
 await page.evaluate(()=>{const ui=document.createElement('span');ui.dataset.qrUi='';ui.textContent='译文';document.querySelector('p').appendChild(ui);});
 assert.equal(await page.evaluate(hit=>qrSearchRange(document,hit).toString(),matches[1]),'Repeated phrase.');
 await assert.rejects(()=>page.evaluate(hit=>qrSearchRange(document,{...hit,offset:hit.offset+1}),matches[1]));
 console.log('PASS: exact repeated occurrence, cross-node phrase, ignored reader UI, stale offset rejection.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
