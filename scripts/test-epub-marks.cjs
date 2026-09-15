const fs=require('node:fs');
const setup=fs.readFileSync('scripts/test-epub-restore.cjs','utf8').split('\n assert.equal(await page.evaluate(()=>rendition.currentLocation()')[0];
const checks=String.raw`
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addScriptTag({content:load('src/features/reader/readingBridge.generated.ts').readingBridgeScript});
 await page.evaluate(()=>{
   const content=rendition.getContents()[0],doc=content.document;
   qrReader.attach(doc,'epub:'+content.sectionIndex);
   const paragraph=doc.querySelector('p'),range=doc.createRange();range.selectNodeContents(paragraph);
   const before=doc.createRange();before.selectNodeContents(doc.body);before.setEnd(range.startContainer,range.startOffset);
   window.note={section_key:'epub:'+content.sectionIndex,start_offset:before.toString().length,end_offset:before.toString().length+range.toString().length,text:range.toString(),style:'underline',color:'#8899aa',is_note:1};
   qrReader.setMarks([{lemma:'reluctant',forms:['reluctant'],style:'highlight',color:'#ffe082',show_meaning:1,contextual_meaning:'adj.不情愿'}]);qrReader.setSentenceMarks([note]);
 });
 await page.waitForTimeout(100);
 console.log('before paragraph bridge',await page.evaluate(()=>{const c=rendition.getContents()[0];return {words:c.window.CSS.highlights.get('qr-0')?.size,notes:c.window.CSS.highlights.get('qr-sentence-0')?.size,labels:c.document.querySelectorAll('.qr-meaning').length}}));
 await page.addScriptTag({content:load('src/features/reader/epubParagraphBridge.ts').epubParagraphBridge});
 await page.evaluate(()=>qrEpubParagraphs.setVisible(false));await page.waitForTimeout(100);
 console.log('after paragraph bridge',await page.evaluate(()=>{const c=rendition.getContents()[0];return {words:c.window.CSS.highlights.get('qr-0')?.size,notes:c.window.CSS.highlights.get('qr-sentence-0')?.size,labels:c.document.querySelectorAll('.qr-meaning').length}}));
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>rendition.getContents()[0].window.CSS.highlights.get('qr-0')?.size),150);assert.equal(await page.evaluate(()=>rendition.getContents()[0].window.CSS.highlights.get('qr-sentence-0')?.size),1);
 await page.evaluate(()=>qrReader.setSentenceMarks([{...note,start_offset:note.start_offset+3,end_offset:note.end_offset+3}]));await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>rendition.getContents()[0].window.CSS.highlights.get('qr-sentence-0')?.size),1,'unique source quote recovers old UI offset drift');
 console.log('PASS: marks and notes remain after paragraph translation defaults off');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});`;
new Function('require',setup+checks)(require);
