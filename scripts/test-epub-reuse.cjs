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
 const boot=load('src/features/reader/epubPreviewBoot.ts').epubPreviewBoot;
 const restore=load('src/features/reader/epubPosition.ts').restoreEpubPosition;
 let anchor=await page.evaluate(()=>rendition.currentLocation().start.cfi);
 const chapters=new Set();
 for(let i=0;i<40;i++){ const direction=i<20?1:-1;
   await page.evaluate(async()=>{window.messages=[];});
   await page.addScriptTag({content:boot(direction,i+1)+restore(anchor)});
   try{await page.waitForFunction(()=>messages.some(m=>m.type==='qr-preview-ready'||m.type==='qr-preview-error'||m.type==='qr-position-error'),{},{timeout:25000});}catch(error){console.error('Failed assignment',i,await page.evaluate(()=>({messages,location:rendition.currentLocation(),promoted:window.qrPreviewPromoted})));throw error;}
   const event=await page.evaluate(()=>messages.find(m=>m.type==='qr-preview-ready'||m.type==='qr-preview-error'||m.type==='qr-position-error'));
   assert.equal(event.type,'qr-preview-ready',JSON.stringify(event));
   chapters.add(event.location.start.index);const next=event.location.start.cfi;
   const order=await page.evaluate(({next,anchor})=>ePub.CFI.prototype.compare(next,anchor),{next,anchor});assert.equal(Math.sign(order),direction,'recycled reader must move in requested direction on turn '+i);assert.equal(event.revision,i+1);anchor=next;
   await page.evaluate(()=>{window.qrPreviewPromoted=true;window.messages=[];});
   await page.addScriptTag({content:restore(anchor)});
   await page.waitForFunction(()=>messages.some(m=>m.type==='qr-position-ready'),{},{timeout:25000});
 }
 assert.ok(chapters.size>1,'must cross a spine chapter boundary');console.log('PASS: one real EPUB rendition reused for 20 forward and 20 backward assignments, with revision and promotion verification');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});



