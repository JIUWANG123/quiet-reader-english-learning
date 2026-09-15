const fs=require('node:fs'), assert=require('node:assert/strict'), ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Ciel Li/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output={};
new Function('exports',ts.transpileModule(fs.readFileSync('src/features/reader/txtParagraphBridge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(output);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<style>p{display:inline}.qrp{display:none}</style><section><p>She stayed.</p><span class="qrp" data-qr-ui="" data-i="0"><span style="display:none">＋ 译</span></span></section>');
  await page.evaluate(()=>{window.sourceBefore=document.body.textContent;window.requests=[];window.ReactNativeWebView={postMessage:value=>requests.push(JSON.parse(value))};});
  await page.addScriptTag({content:output.txtParagraphBridge});
  assert.equal(await page.evaluate(()=>requests.filter(item=>item.type==='qr-paragraph').length),0);
  assert.equal(await page.locator('.qrp').isVisible(),false);
  await page.evaluate(()=>qrParagraphVisibility(true));
  assert.equal(await page.evaluate(()=>requests.filter(item=>item.type==='qr-paragraph').length),0);
  const button=page.locator('.qrp button'),box=page.locator('.qrp div');
  const p=await page.locator('p').boundingBox(),b=await button.boundingBox();
  assert.ok(b.x>=p.x+p.width&&b.y<p.y+p.height,'entry follows final sentence inline');
  await button.click();
  await page.evaluate(()=>qrParagraphResult(0,'她留了下来。',false));
  await box.click();
  assert.equal(await button.getAttribute('aria-expanded'),'false');
  await button.click();
  assert.equal(await box.isVisible(),true);
  assert.equal(await page.evaluate(()=>requests.filter(item=>item.type==='qr-paragraph').length),1);
  await page.evaluate(()=>qrParagraphVisibility(false));
  assert.equal(await box.isVisible(),false);
  await page.evaluate(()=>qrParagraphVisibility(true));
  assert.equal(await box.isVisible(),false);
  await button.click();assert.equal(await box.isVisible(),true);
  assert.equal(await page.evaluate(()=>requests.filter(item=>item.type==='qr-paragraph').length),1);
  assert.equal(await page.evaluate(()=>document.body.textContent),await page.evaluate(()=>sourceBefore),'no source offset drift');
  console.log('PASS: explicit request only; inline close/reopen uses cached translation in one click');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
