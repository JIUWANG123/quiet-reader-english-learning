const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {chromium}=require('C:/Users/Ciel Li/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const exportsObject={};new Function('exports',ts.transpileModule(fs.readFileSync('src/features/reader/epubParagraphBridge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exportsObject);
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const pages=await Promise.all([0,1,2].map(()=>browser.newPage()));
 for(const p of pages){await p.setContent('<p>One original sentence.</p><p>Another paragraph.</p>');await p.evaluate(()=>{window.events=[];window.ReactNativeWebView={postMessage:s=>events.push(JSON.parse(s))};window.rendition={hooks:{content:{register:()=>{}}},getContents:()=>[{document,window,sectionIndex:4}]};});await p.addScriptTag({content:exportsObject.epubParagraphBridge});await p.evaluate(()=>qrEpubParagraphs.setVisible(true));}
 await pages[0].evaluate(()=>document.querySelector('[data-qr-ui]').shadowRoot.querySelector('button').click());
 const request=await pages[0].evaluate(()=>events.find(e=>e.type==='qr-epub-paragraph'));assert.equal(request.id,'4:0');
 const value='完整译文。'.repeat(700);await pages[0].evaluate(({id,value})=>qrEpubParagraphs.reply(id,value,false),{id:request.id,value});
 await pages[1].evaluate(()=>{window.resizeCount=0;window.addEventListener('resize',()=>resizeCount++);});
 const latest=await pages[0].evaluate(()=>events.filter(e=>e.type==='qr-paragraph-state').at(-1));
 for(const p of pages.slice(1)){await p.evaluate(s=>qrEpubParagraphs.sync(s),{[latest.id]:latest.state});assert.equal(await p.evaluate(()=>document.querySelector('[data-qr-ui]').shadowRoot.querySelector('div').textContent),value);assert.equal(await p.evaluate(()=>events.length),0,'state replication must not trigger another AI request');}
 const before=await pages[1].evaluate(()=>resizeCount);await pages[1].evaluate(s=>{qrEpubParagraphs.sync(s);qrEpubParagraphs.setVisible(true);},{[latest.id]:latest.state});assert.equal(await pages[1].evaluate(()=>resizeCount),before,'identical sync must not trigger layout');
 await pages[0].evaluate(()=>document.querySelector('[data-qr-ui]').shadowRoot.querySelector('button').click());const closed=await pages[0].evaluate(()=>events.filter(e=>e.type==='qr-paragraph-state').at(-1));assert.equal(closed.state.open,false);
 console.log('PASS: stable paragraph key; complete long response synchronizes to independent documents; collapse state emitted; no AI request on sync. Pagination not covered.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
