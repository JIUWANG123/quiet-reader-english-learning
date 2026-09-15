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
  zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">restore-test</dc:identifier><dc:title>Restore Test</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
  zip.file('nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>');
  zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body>'+Array.from({length:150},(_,i)=>'<p>Paragraph '+i+'. She found herself strangely reluctant to leave. The room was quiet and the window was open. He regarded her with suspicion.</p>').join('')+'</body></html>');
  window.fixture=await zip.generateAsync({type:'arraybuffer'});
  window.openBook=async()=>{window.book=ePub(fixture.slice(0));window.rendition=book.renderTo('reader',{width:390,height:720,spread:'none',flow:'paginated'});await rendition.display();};
  window.messages=[];window.ReactNativeWebView={postMessage:raw=>messages.push(JSON.parse(raw))};
  await openBook();for(let i=0;i<6;i++)await rendition.next();
 });
 const boot=load('src/features/reader/epubPreviewBoot.ts').epubPreviewBoot;
 const restore=load('src/features/reader/epubPosition.ts').restoreEpubPosition;
 let anchor=await page.evaluate(()=>rendition.currentLocation().start.cfi);
 const seen=new Set([anchor]);
 for(let i=0;i<12;i++){
   await page.evaluate(async()=>{rendition.destroy();book.destroy();document.querySelector('#reader').innerHTML='';window.messages=[];window.qrPreviewPromoted=false;window.ReactNativeWebView={postMessage:raw=>messages.push(JSON.parse(raw))};await openBook();});
   await page.addScriptTag({content:boot(1)+restore(anchor)});
   await page.waitForFunction(()=>messages.some(m=>m.type==='qr-preview-ready'||m.type==='qr-preview-error'||m.type==='qr-position-error'),{},{timeout:25000});
   const event=await page.evaluate(()=>messages.find(m=>m.type==='qr-preview-ready'||m.type==='qr-preview-error'||m.type==='qr-position-error'));
   assert.equal(event.type,'qr-preview-ready',JSON.stringify(event));
   const next=event.location.start.cfi;
   assert.ok(!seen.has(next),'preview repeated a prior page on turn '+i);seen.add(next);anchor=next;
   await page.evaluate(()=>{window.qrPreviewPromoted=true;window.messages=[];});
   await page.addScriptTag({content:restore(anchor)});
   await page.waitForFunction(()=>messages.some(m=>m.type==='qr-position-ready'),{},{timeout:25000});
 }
 console.log('PASS: 12 real EPUB preview advances and promoted-page restoration acknowledgements');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
