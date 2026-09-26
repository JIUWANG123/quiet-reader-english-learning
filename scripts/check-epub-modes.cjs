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
    await page.waitForTimeout(300);
    const motion=ts.transpile(fs.readFileSync('src/features/reader/epubPageMotion.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020});
    await page.addScriptTag({content:'var exports={};'+motion+';eval(exports.epubPageMotion);'});
    const first=await page.evaluate(()=>rendition.currentLocation().start.cfi);
    await page.evaluate(()=>rendition.next());await page.waitForTimeout(250);
    await page.evaluate(()=>{const doc=rendition.getContents()[0].document;doc.documentElement.classList.add('qr-selecting');const range=doc.createRange();range.selectNodeContents(doc.querySelector('p'));window.qrSelectionGuard.left=rendition.manager.container.scrollLeft;window.qrSelectionGuard.top=rendition.manager.container.scrollTop;doc.getSelection().addRange(range);});
    await page.waitForTimeout(120);
    const locked=await page.evaluate(()=>({cfi:rendition.currentLocation().start.cfi,left:rendition.manager.container.scrollLeft}));
    await page.evaluate(async()=>{await rendition.prev();rendition.manager.container.scrollLeft-=90;});await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>rendition.manager.container.scrollLeft),locked.left);
    await page.evaluate(()=>rendition.getContents()[0].document.getSelection().removeAllRanges());await page.waitForTimeout(120);
    const second=await page.evaluate(()=>rendition.currentLocation().start.cfi);assert.notEqual(first,second);
    assert.equal(await page.evaluate(()=>rendition.manager.container.getAnimations().length),0);
    await page.evaluate(async()=>{await rendition.prev();});await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>rendition.currentLocation().start.cfi),first);
    await page.evaluate(()=>{return rendition.next();});await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>rendition.currentLocation().start.cfi),second);
    await page.evaluate(()=>window.qrPageMotion.whenIdle());
    await page.evaluate(async()=>{await rendition.next();await rendition.next();});await page.waitForTimeout(100);
    const expectedBurst=await page.evaluate(()=>rendition.currentLocation().start.cfi);
    await page.evaluate(async()=>{await rendition.prev();await rendition.prev();});
    await page.evaluate(()=>Promise.all([rendition.next(),rendition.next(),rendition.next(),rendition.next()]));await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>rendition.currentLocation().start.cfi),expectedBurst);
    assert.equal(await page.evaluate(()=>rendition.manager.container.getAnimations().length),0);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>rendition.prev());
    assert.equal(await page.evaluate(()=>rendition.manager.container.getAnimations().length),0);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{const cfi=rendition.currentLocation().start.cfi;rendition.flow('scrolled-doc');return rendition.display(cfi);});await page.waitForTimeout(300);
    const scrolled=await page.evaluate(()=>({flow:rendition._layout.flow(),key:rendition.getContents()[0].document.qrSectionKey,scrollable:rendition.manager.container.scrollHeight>rendition.manager.container.clientHeight}));
    assert.equal(scrolled.key,'epub:0');assert.ok(scrolled.scrollable);assert.equal(scrolled.flow,'scrolled');
    const marked=await page.evaluate(async()=>{const content=rendition.getContents()[0],doc=content.document;const visible=doc.createRange();visible.selectNodeContents(doc.querySelector('p'));const cfi=content.cfiFromRange(visible);const range=await book.getRange(cfi),source=range.startContainer.ownerDocument;const before=source.createRange();before.selectNodeContents(source.querySelector('body'));before.setEnd(range.startContainer,range.startOffset);const start=before.toString().length;qrReader.setSentenceMarks([{section_key:'epub:'+book.spine.get(cfi).index,start_offset:start,end_offset:start+range.toString().length,text:range.toString(),style:'underline',color:'#90caf9'}]);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return [...doc.defaultView.CSS.highlights.get('qr-sentence-0')].length;});
    assert.equal(marked,1);
    await page.evaluate(()=>{rendition.flow('paginated');return rendition.display(book.spine.first().href);});await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>rendition._layout.flow()),'paginated');
    await page.evaluate(()=>rendition.next());await page.waitForTimeout(250);
    assert.notEqual(await page.evaluate(()=>rendition.currentLocation().start.cfi),first);
    const positionSource=ts.transpile(fs.readFileSync('src/features/reader/epubPosition.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020});
    await page.addScriptTag({content:'var exports={};'+positionSource+';window.restoreEpubPosition=exports.restoreEpubPosition;'});
    for(const flow of ['paginated','scrolled-doc']) {
      await page.evaluate(async flow=>{rendition.flow(flow);await rendition.display();},flow);
      await page.waitForTimeout(200);
      await page.evaluate(()=>rendition.display('epubcfi(/6/2!/4/30/1:0)'));
      await page.waitForTimeout(250);
      const saved=await page.evaluate(()=>rendition.currentLocation().start.cfi);
      assert.notEqual(saved,first);
      await page.evaluate(async ({saved,flow})=>{
        rendition.destroy();book.destroy();document.querySelector('#reader').innerHTML='';
        window.book=ePub(epubData);await book.ready;
        window.rendition=book.renderTo('reader',{width:360,height:560,flow,spread:'none'});
        window.accepted=[];window.positionRestored=false;
        rendition.on('relocated',location=>{if(positionRestored)accepted.push(location.start.cfi);});
        window.ReactNativeWebView.postMessage=function(json){const event=JSON.parse(json);if(event.type==='qr-position-ready'){window.positionRestored=true;accepted.push(event.location.start.cfi);}if(event.type==='qr-position-error')throw Error('restore failed');};
        await rendition.display();
        eval(restoreEpubPosition(saved));
      },{saved,flow});
      await page.waitForFunction(()=>positionRestored);
      assert.equal(await page.evaluate(()=>rendition.currentLocation().start.cfi),saved);
      // epub.js may emit a late duplicate relocated event after ready. The
      // production bridge/saver deduplicate it; every accepted CFI must still
      // be the restored page, never the transient first page.
      assert.deepEqual(await page.evaluate(()=>Array.from(new Set(accepted))),[saved]);
    }
    console.log('PASS: epub.js pagination, scrolling, marks and full reader recreation restores saved CFI in both modes without saving page one');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});


