const fs=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
const {chromium}=require('C:/Users/Ciel Li/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
    const page=await browser.newPage({viewport:{width:390,height:750}});
    await page.setContent('<html><head><style>body{font:22px/2 serif;padding:20px}</style></head><body>Vampire teeth. The vampire took the book. Taken away.</body></html>');
    await page.evaluate(()=>{window.messages=[];window.ReactNativeWebView={postMessage:message=>window.messages.push(JSON.parse(message))};});
    const code=ts.transpile(fs.readFileSync('src/features/reader/readingBridge.generated.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS});
    await page.addScriptTag({content:'var exports={};'+code+';'+ 'eval(exports.readingBridgeScript);'});
    await page.evaluate(()=>window.qrReader.setMarks([{lemma:'vampire',forms:['vampire'],style:'highlight',color:'#ffe082',show_meaning:1,contextual_meaning:'n.吸血鬼'},{lemma:'take',forms:['take','took','taken'],style:'underline',color:'#90caf9',show_meaning:0}]));
    const state=await page.evaluate(()=>({text:document.body.textContent,labels:Array.from(document.querySelectorAll('span')).map(x=>x.textContent),counts:[...CSS.highlights.values()].map(x=>x.size)}));
    assert.equal(state.text,'Vampire teeth. The vampire took the book. Taken away.');
    assert.deepEqual(state.counts,[2,2]); assert.equal(state.labels.filter(x=>x==='n.吸血鬼').length,2);
    await page.evaluate(()=>{const range=document.createRange();range.setStart(document.body.firstChild,0);range.setEnd(document.body.firstChild,13);getSelection().addRange(range);});
    await page.waitForTimeout(250);
    await page.evaluate(()=>window.qrReader.choose('translate'));
    const message=await page.evaluate(()=>window.messages.at(-1));assert.equal(message.targetText,'Vampire teeth');assert.ok(message.followingContext.includes('took'));
    await page.evaluate(()=>window.qrReader.setMarks([]));assert.equal(await page.evaluate(()=>CSS.highlights.size),0);
    await page.evaluate(async()=>{
      const frame=document.createElement('iframe');frame.srcdoc='<html><body>He regarded her with suspicion. She looked away.</body></html>';
      const loaded=new Promise(resolve=>frame.onload=resolve);document.body.appendChild(frame);await loaded;
      window.qrReader.attach(frame.contentDocument);
      window.qrReader.setMarks([{lemma:'regard',forms:['regard','regarded'],style:'text',color:'#90caf9',show_meaning:1,contextual_meaning:'v.注视'}]);
      const doc=frame.contentDocument;const range=doc.createRange();range.setStart(doc.body.firstChild,3);range.setEnd(doc.body.firstChild,11);doc.getSelection().addRange(range);
    });
    await page.waitForTimeout(250);
    await page.evaluate(()=>window.qrReader.choose('word'));
    const iframeMessage=await page.evaluate(()=>window.messages.at(-1));
    assert.equal(iframeMessage.targetText,'regarded');assert.equal(iframeMessage.previousContext,'He ');assert.ok(iframeMessage.followingContext.startsWith(' her with suspicion'));
    const iframeState=await page.evaluate(()=>{const doc=document.querySelector('iframe').contentDocument;return {text:doc.body.textContent,rule:doc.querySelector('style').textContent,count:[...doc.defaultView.CSS.highlights.values()][0].size};});
    assert.equal(iframeState.text,'He regarded her with suspicion. She looked away.');assert.ok(iframeState.rule.includes('color:#90caf9'));assert.equal(iframeState.count,1);
    const sentenceResult=await page.evaluate(()=>{
      const doc=document.querySelector('iframe').contentDocument;
      const sentence='He regarded her with suspicion.';
      doc.body.innerHTML='<p>'+sentence+'</p><p>'+sentence+'</p>';
      window.qrReader.attach(doc,'epub:2');
      window.qrReader.setSentenceMarks([{section_key:'epub:2',start_offset:0,end_offset:sentence.length,text:sentence,style:'highlight',color:'#80cbc4'}]);
      const ranges=[...doc.defaultView.CSS.highlights.get('qr-sentence-0')];
      const result={count:ranges.length,text:ranges[0].toString(),first:ranges[0].startContainer===doc.querySelector('p').firstChild,body:doc.body.textContent};
      window.qrReader.setSentenceMarks([{section_key:'epub:3',start_offset:0,end_offset:sentence.length,text:sentence,style:'highlight',color:'#80cbc4'}]);
      result.otherChapter=doc.defaultView.CSS.highlights.has('qr-sentence-0');
      window.qrReader.setSentenceMarks([]);return result;
    });
    assert.equal(sentenceResult.count,1);assert.equal(sentenceResult.first,true);assert.equal(sentenceResult.otherChapter,false);assert.equal(sentenceResult.body,sentenceResult.text.repeat(2));
    await page.evaluate(()=>{getSelection().removeAllRanges();document.body.innerHTML='<p>First sentence. She found herself strangely <em>reluctant</em> to leave. Last sentence.</p>';});
    await page.evaluate(()=>{const text=document.querySelector('em').firstChild,range=document.createRange();range.selectNodeContents(text);const r=range.getBoundingClientRect();document.querySelector('em').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+4,clientY:r.top+5}));});
    assert.equal(await page.evaluate(()=>getSelection().toString()),'She found herself strangely reluctant to leave.');
    await page.evaluate(()=>qrReader.choose('translate'));
    const sentence=await page.evaluate(()=>messages.at(-1));assert.equal(sentence.targetText,'She found herself strangely reluctant to leave.');assert.ok(sentence.previousContext.includes('First sentence.'));assert.ok(sentence.followingContext.includes('Last sentence.'));
    console.log('PASS: intact text nodes, case/forms matching, labels, iframe context, sentence occurrence isolation and clearing marks');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
