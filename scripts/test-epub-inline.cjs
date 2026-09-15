// Reuse the real archive fixture and epub.js version from the restore regression.
const fs=require('node:fs');
let setup=fs.readFileSync('scripts/test-epub-restore.cjs','utf8').split('\n assert.equal(await page.evaluate(()=>rendition.currentLocation()')[0];
if(!setup.includes('window.fixture='))throw Error('Restore fixture changed');
const checks=String.raw`
 await page.evaluate(()=>{
   const doc=rendition.getContents()[0].document;
   window.originalText=doc.body.textContent;
   const range=doc.createRange();range.setStart(doc.querySelectorAll('p')[10].firstChild,3);range.setEnd(doc.querySelectorAll('p')[10].firstChild,18);
   window.anchor=rendition.getContents()[0].cfiFromRange(range);window.anchorText=range.toString();messages=[];
 });
 await page.addScriptTag({content:load('src/features/reader/epubParagraphBridge.ts').epubParagraphBridge});
 assert.equal(await page.evaluate(()=>messages.length),0,'mount never requests AI');
 assert.equal(await page.evaluate(()=>getComputedStyle(rendition.getContents()[0].document.querySelector('[data-qr-ui]')).display),'none','default off');
 await page.evaluate(()=>qrEpubParagraphs.setVisible(true));
 assert.equal(await page.evaluate(()=>messages.length),0,'enabling never requests AI');
 assert.equal(await page.evaluate(()=>rendition.getContents()[0].document.body.textContent),await page.evaluate(()=>originalText));
 await page.evaluate(()=>rendition.getContents()[0].document.querySelector('[data-qr-ui]').shadowRoot.querySelector('button').click());
 assert.equal(await page.evaluate(()=>messages[0].type),'qr-epub-paragraph');
 assert.ok((await page.evaluate(()=>messages[0].followingContext)).includes('Paragraph 1'));
 await page.evaluate(()=>qrEpubParagraphs.reply(messages[0].id,'<script>bad()</script> 她留下来了。',false));
 assert.equal(await page.evaluate(()=>rendition.getContents()[0].document.body.textContent),await page.evaluate(()=>originalText),'translation must not enter source offsets');
 assert.equal(await page.evaluate(()=>book.getRange(anchor).then(r=>r.toString())),await page.evaluate(()=>anchorText),'old CFI still points to same text');
 await page.evaluate(()=>{const root=rendition.getContents()[0].document.querySelector('[data-qr-ui]').shadowRoot;root.querySelector('button').click();root.querySelector('button').click();});
 assert.equal(await page.evaluate(()=>messages.length),1,'reopen uses cached text');
 assert.equal(await page.evaluate(()=>rendition.getContents()[0].document.querySelector('[data-qr-ui]').shadowRoot.querySelector('script')),null);
 await page.evaluate(()=>qrEpubParagraphs.setVisible(false));
 assert.equal(await page.evaluate(()=>getComputedStyle(rendition.getContents()[0].document.querySelector('[data-qr-ui]')).display),'none');
 await page.evaluate(()=>{qrEpubParagraphs.setVisible(true);rendition.getContents()[0].document.querySelector('[data-qr-ui]').shadowRoot.querySelector('button').click();});
 assert.equal(await page.evaluate(()=>messages.length),1,'hidden translation retains cache');
 console.log('PASS: real EPUB inline translation retains source offsets and CFI; explicit request, context, cached toggle and safe output');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});`;
new Function('require',setup+checks)(require);
