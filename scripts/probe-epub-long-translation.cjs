const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Ciel Li/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
function load(path){const out={};new Function('exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(out);return out;}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:800}});
 await page.setContent('<div id="reader" style="width:390px;height:720px"></div>');
 for(const file of ['jszip','epubjs'])await page.addScriptTag({content:load(`node_modules/@epubjs-react-native/core/lib/module/${file}.js`).default});
 await page.evaluate(async()=>{
  const zip=new JSZip();zip.file('mimetype','application/epub+zip');
  zip.file('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">restore-test</dc:identifier><dc:title>Restore Test</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/><item id="chapter3" href="chapter3.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/><itemref idref="chapter2"/><itemref idref="chapter3"/></spine></package>');
  zip.file('nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>');
  zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body>'+Array.from({length:150},(_,i)=>'<p>Paragraph '+i+'. She found herself strangely reluctant to leave. The room was quiet and the window was open. He regarded her with suspicion.</p>').join('')+'</body></html>');
  zip.file('chapter2.xhtml',await zip.file('chapter.xhtml').async('string'));zip.file('chapter3.xhtml',await zip.file('chapter.xhtml').async('string'));window.fixture=await zip.generateAsync({type:'arraybuffer'});
  window.openBook=async()=>{window.book=ePub(fixture.slice(0));window.rendition=book.renderTo('reader',{width:390,height:720,spread:'none',flow:'paginated'});await rendition.display();};
  window.messages=[];window.ReactNativeWebView={postMessage:raw=>messages.push(JSON.parse(raw))};
  await openBook();for(let i=0;i<6;i++)await rendition.next();
 });

 await page.evaluate(()=>rendition.display());
 await page.addScriptTag({content:load('src/features/reader/epubParagraphBridge.ts').epubParagraphBridge});
 await page.evaluate(()=>{qrEpubParagraphs.setVisible(true);qrEpubParagraphs.sync({'0:0':{open:true,error:false,value:'长译文测试，每一行都应该能够继续阅读。'.repeat(300)}});});
 await page.waitForTimeout(300);
 await page.addScriptTag({content:load('src/features/reader/epubVisualPosition.ts').epubVisualPosition});
 const rows=[];
 for(let i=0;i<8;i++){
  rows.push(await page.evaluate(async()=>{const loc=rendition.located(await rendition.manager.currentLocation());return {visual:qrVisualPosition.capture(loc),cfi:loc.start.cfi,x:rendition.manager.container.scrollLeft,width:rendition.manager.container.scrollWidth};}));
  await page.evaluate(()=>rendition.next());
 }
 const restored=await page.evaluate(async pos=>{await rendition.display(pos.start.cfi);return await qrVisualPosition.restore(pos);},rows[3].visual);
 assert.equal(restored,true,'visual offset restores the exact translation continuation');
 assert.equal(await page.evaluate(()=>rendition.manager.container.scrollLeft),rows[3].x);
 assert.equal(await page.evaluate(({a,b})=>qrVisualPosition.same(a,b),{a:rows[2].visual,b:rows[3].visual}),false);
 console.log('PASS: distinct translation pages recognized and exact continuation restored.');
 assert.ok(rows.some((r,i)=>i&&r.cfi===rows[i-1].cfi&&r.x!==rows[i-1].x),'probe must expose distinct translation pages sharing an original CFI');
 await page.evaluate(()=>{window.messages=[];});
 await page.addScriptTag({content:load('src/features/reader/epubPreviewBoot.ts').epubPreviewBoot(1,7,rows[3].visual)+load('src/features/reader/epubPosition.ts').restoreEpubPosition(rows[3].cfi)});
 await page.waitForFunction(()=>messages.some(e=>e.type==='qr-preview-ready'||e.type==='qr-preview-error'||e.type==='qr-preview-boundary'));
 const result=await page.evaluate(()=>messages.find(e=>e.type==='qr-preview-ready'||e.type==='qr-preview-error'||e.type==='qr-preview-boundary'));
 assert.equal(result.type,'qr-preview-ready',JSON.stringify(result));
 assert.equal(result.location.qrVisual.x,rows[4].x);
 console.log('PASS: preview chain advances through identical-CFI translation pages.');
 const oldVisual=result.location;
 await page.evaluate(()=>qrEpubParagraphs.sync({'0:0':{open:false,error:false,value:'长译文测试，每一行都应该能够继续阅读。'.repeat(300)}}));
 await page.waitForTimeout(200);
 assert.equal(await page.evaluate(pos=>qrVisualPosition.restore(pos),oldVisual),false,'collapsed layout must reject expanded-page coordinates');
 for(let cycle=0;cycle<3;cycle++){
   await page.evaluate(()=>{qrEpubParagraphs.sync({'0:0':{open:true,error:false,value:'长译文测试，每一行都应该能够继续阅读。'.repeat(300)}});});
   await page.waitForTimeout(200);
   assert.equal(await page.evaluate(pos=>qrVisualPosition.restore(pos),oldVisual),true);
   await page.evaluate(()=>qrEpubParagraphs.sync({'0:0':{open:false,error:false,value:'长译文测试，每一行都应该能够继续阅读。'.repeat(300)}}));
   await page.waitForTimeout(200);
 }
 assert.equal(await page.evaluate(()=>rendition.getContents()[0].document.querySelectorAll('p').length),150,'translation toggles must not duplicate original paragraphs');
 console.log('PASS: repeated expand/collapse rejects stale layout offsets without duplicating source.');
 console.log('REPRODUCED: original CFI cannot distinguish consecutive pages inside long translation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
