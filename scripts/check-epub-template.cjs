const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {chromium}=require('C:/Users/Ciel Li/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
    const page=await browser.newPage({viewport:{width:390,height:750}});
    await page.setContent('<div id="reader" style="width:360px;height:560px"></div>');
    await page.addScriptTag({content:require('@epubjs-react-native/core/lib/commonjs/jszip').default});
    await page.addScriptTag({content:require('@epubjs-react-native/core/lib/commonjs/epubjs').default});
    const bridge=ts.transpile(fs.readFileSync('src/features/reader/readingBridge.generated.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020});
    await page.addScriptTag({content:'var exports={};'+bridge+';window.ReactNativeWebView={postMessage:function(){}};eval(exports.readingBridgeScript);'});
    await page.evaluate(async()=>{
      const zip=new JSZip();zip.file('mimetype','application/epub+zip');
      zip.file('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
      zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">quiet-test</dc:identifier><dc:title>Reader Test</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
      zip.file('nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>');
      zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title><style>body{font:20px/1.8 serif}</style></head><body>'+('<p>He regarded her with suspicion. She found herself strangely reluctant to leave.</p>').repeat(60)+'</body></html>');
      window.epubData=await zip.generateAsync({type:'arraybuffer'});window.book=ePub(epubData);await book.ready;
      window.rendition=book.renderTo('reader',{width:360,height:560,flow:'paginated',spread:'none'});
      rendition.hooks.content.register(content=>qrReader.attach(content.document,'epub:'+content.sectionIndex));
      await rendition.display();
    });

    const base64=await page.evaluate(()=>{let s='';for(const b of new Uint8Array(epubData))s+=String.fromCharCode(b);return btoa(s);});
    const probe=await browser.newPage({viewport:{width:390,height:750}});const errors=[];probe.on('pageerror',e=>errors.push(e.message));
    const patched={};new Function('exports',ts.transpile(fs.readFileSync('src/features/reader/epubTemplate.ts','utf8'),{module:ts.ModuleKind.CommonJS}))(patched);
    let template=patched.prepareEpubTemplate(require('@epubjs-react-native/core/lib/commonjs/template').default);
    template=template.replace('<script id="jszip"></script>',()=>'<script src="data:text/javascript;base64,'+Buffer.from(require('@epubjs-react-native/core/lib/commonjs/jszip').default).toString('base64')+'"></script>').replace('<script id="epubjs"></script>',()=>'<script src="data:text/javascript;base64,'+Buffer.from(require('@epubjs-react-native/core/lib/commonjs/epubjs').default).toString('base64')+'"></script>')
    .replace('const type = window.type;',"const type='base64';").replace('const file = window.book;',()=> 'const file='+JSON.stringify(base64)+';')
    .replace('const theme = window.theme;',"const theme={body:{background:'#fff',color:'#222'}};")
    .replace('const initialLocations = window.locations;','const initialLocations=undefined;').replace('const enableSelection = window.enable_selection;','const enableSelection=true;')
    .replace('flow: "auto"','flow: "scrolled-doc"').replace('allowPopups: allowPopups','allowPopups: false').replace('allowScriptedContent: allowScriptedContent','allowScriptedContent: false');
    await probe.setContent('<script>window.events=[];window.ReactNativeWebView={postMessage:s=>events.push(JSON.parse(s))};</script>'+template);
    await probe.waitForFunction(()=>events.some(e=>e.type==='onReady'));
    const state=await probe.evaluate(()=>({events:events.map(e=>e.type),height:rendition.manager.container.clientHeight,scroll:rendition.manager.container.scrollHeight}));
    assert.deepEqual(errors,[]);assert.ok(state.events.includes('onRendered'));assert.ok(state.scroll>state.height);
    const saved=await probe.evaluate(async()=>{await rendition.display('epubcfi(/6/2!/4/30/1:0)');return rendition.currentLocation().start.cfi;});
    await probe.goto('about:blank');await probe.setContent('<script>window.events=[];window.ReactNativeWebView={postMessage:s=>events.push(JSON.parse(s))};</script>'+template);
    await probe.waitForFunction(()=>events.some(e=>e.type==='onReady'));
    await probe.evaluate(saved=>rendition.display(saved),saved);assert.equal(await probe.evaluate(()=>rendition.currentLocation().start.cfi),saved);
    await probe.evaluate(()=>{const s=book.spine.first(),doc=s.document;s.document=undefined;try{rendition.emit('relocated',rendition.currentLocation());}finally{s.document=doc;}});
    const fastTemplate=patched.prepareEpubTemplate(template,{anchor:saved,generateLocations:false});
    await probe.goto('about:blank');
    await probe.setContent('<script>window.events=[];window.ReactNativeWebView={postMessage:s=>events.push(JSON.parse(s))};</script>'+fastTemplate);
    await probe.waitForFunction(()=>events.some(e=>e.type==='onReady'));
    assert.equal(await probe.evaluate(()=>events.find(e=>e.type==='onReady').currentLocation.start.cfi),saved,'first ready must already be at saved anchor');
    assert.equal(await probe.evaluate(()=>book.locations.total),0,'preview must not scan full book');
    const locations=await probe.evaluate(async()=>{await book.locations.generate(2400);return book.locations.save();});
    const cachedTemplate=fastTemplate.replace('const initialLocations=undefined;',()=> 'const initialLocations='+locations+';');
    await probe.goto('about:blank');
    await probe.setContent('<script>window.events=[];window.ReactNativeWebView={postMessage:s=>events.push(JSON.parse(s))};</script>'+cachedTemplate);
    await probe.waitForFunction(()=>events.some(e=>e.type==='onReady'));
    assert.ok(await probe.evaluate(()=>book.locations.total)>0,'cached index must be loaded before ready');
    assert.equal(await probe.evaluate(()=>events.some(e=>e.type==='onLocationsReady')),false,'cached load must not regenerate index');
    assert.equal(await probe.evaluate(()=>events.find(e=>e.type==='onReady').currentLocation.start.cfi),saved);
    const failing=cachedTemplate.replace(/var displayed = rendition.display\([^;]*;/,'var displayed = Promise.reject(new Error("DISPLAY_TEST_FAILURE"));');
    await probe.goto('about:blank');
    await probe.setContent('<script>window.events=[];window.ReactNativeWebView={postMessage:s=>events.push(JSON.parse(s))};</script>'+failing);
    await probe.waitForFunction(()=>events.some(e=>e.type==='onDisplayError'));
    assert.equal(await probe.evaluate(()=>events.find(e=>e.type==='onDisplayError').reason),'DISPLAY_TEST_FAILURE');
    assert.deepEqual(errors,[]);console.log('PASS: actual wrapper template opens scrolled mode, emits rendered/ready without circular JSON errors, and reopens at saved CFI.');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

