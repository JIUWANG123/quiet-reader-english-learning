const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_PATH);
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
  window.saved=rendition.currentLocation().start.cfi;
  await rendition.display();window.first=rendition.currentLocation().start.cfi;
  await rendition.display(saved);await rendition.display(undefined);
 });
 assert.equal(await page.evaluate(()=>rendition.currentLocation().start.cfi),await page.evaluate(()=>first),'reproduces 1.8.4 second display resetting to page one');
 const restore=load('src/features/reader/epubPosition.ts').restoreEpubPosition;
 const saved=await page.evaluate(()=>saved);
 for(let cycle=0;cycle<3;cycle++){
  await page.evaluate(async()=>{book.destroy();document.querySelector('#reader').replaceChildren();await openBook();messages=[];});
  await page.addScriptTag({content:restore(saved)});
  await page.waitForFunction(()=>messages.length>0);
  assert.equal(await page.evaluate(()=>messages[0].type),'qr-position-ready');
  assert.equal(await page.evaluate(()=>messages[0].location.start.cfi),saved);
 }
 await page.evaluate(()=>{messages=[];window.displayCalls=0;const display=rendition.display.bind(rendition);rendition.display=(...args)=>{displayCalls++;return display(...args);};});
 await page.addScriptTag({content:restore(undefined)});
 await page.waitForFunction(()=>messages.length>0);
 assert.equal(await page.evaluate(()=>displayCalls),0,'confirmation cannot navigate to page one');
 assert.equal(await page.evaluate(()=>messages[0].location.start.cfi),saved);
 await page.evaluate(()=>{messages=[];window.originalManagerLocation=rendition.manager.currentLocation.bind(rendition.manager);let calls=0;rendition.manager.currentLocation=()=>++calls<4?[]:originalManagerLocation();});
 await page.addScriptTag({content:restore(undefined)});
 await page.waitForFunction(()=>messages.length>0);
 assert.equal(await page.evaluate(()=>messages[0].type),'qr-position-ready','temporary empty layout must recover');
 await page.evaluate(()=>{rendition.manager.currentLocation=originalManagerLocation;});
 await page.evaluate(async()=>{await rendition.display();rendition.display=()=>Promise.resolve();messages=[];});
 await page.addScriptTag({content:restore(saved)});
 await page.waitForFunction(()=>messages.length>0);
 assert.equal(await page.evaluate(()=>messages[0].type),'qr-position-error','silent failure to restore must not confirm or save page one');
 const component=fs.readFileSync('src/features/reader/EpubReader.tsx','utf8');
 assert.ok(component.includes('restoreEpubPosition(document.anchor,document.visualAnchor)'));
 assert.ok(!component.includes('initialLocation='),'one restoration owner');
 console.log('PASS: real EPUB reproduces old reset; three destroy/reopen cycles restore saved CFI; absent target never resets position; failed restoration reports error');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
