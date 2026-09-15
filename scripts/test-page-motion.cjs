const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_PATH);
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage();await page.setContent('<body style="background:#181818"><div id="reader" style="background:#181818;color:#ddd">Old page remains visible</div></body>');
 await page.evaluate(()=>{const container=document.querySelector('#reader');window.messages=[];window.ReactNativeWebView={postMessage:s=>messages.push(JSON.parse(s))};window.rendition={manager:{container},_layout:{flow:()=> 'paginated'},getContents:()=>[],currentLocation:()=>({atEnd:false,atStart:false}),next:()=>new Promise(resolve=>window.finishNext=()=>{container.textContent='Next page';resolve();}),prev:()=>Promise.resolve()};});
 const js=ts.transpileModule(fs.readFileSync('src/features/reader/epubPageMotion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;await page.addScriptTag({content:`var exports={};${js};eval(exports.epubPageMotion);`});
 await page.evaluate(()=>{window.turn=rendition.next();});await page.waitForTimeout(500);
 assert.equal(await page.locator('#reader').evaluate(e=>getComputedStyle(e).opacity),'1');assert.equal(await page.locator('#reader').textContent(),'Old page remains visible');
 await page.evaluate(async()=>{finishNext();await turn;});assert.equal(await page.locator('#reader').evaluate(e=>getComputedStyle(e).opacity),'1');assert.equal(await page.locator('#reader').textContent(),'Next page');console.log('PASS: delayed page resolution never fades viewport out; animation settles opaque');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
