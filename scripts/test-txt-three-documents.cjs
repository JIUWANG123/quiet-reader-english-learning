const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Ciel Li/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
function load(path){const result={};new Function('exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(result);return result;}
const {txtParagraphBridge}=load('src/features/reader/txtParagraphBridge.ts');
const {txtScreenBoot}=load('src/features/reader/txtScreenBoot.ts');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const documents=await Promise.all([0,1,2].map(()=>browser.newPage({viewport:{width:390,height:800}})));
  for(const [index,page] of documents.entries()){
   await page.setContent('<style>body{margin:0;font:22px/1.8 serif}p{display:inline}.qrp{display:none}section{margin:20px}</style>'+Array.from({length:30},(_,i)=>`<section><p>Paragraph ${i}. She looked across the room and waited quietly for him to answer.</p><span class="qrp" data-i="${i}"></span></section>`).join(''));
   await page.evaluate(()=>{window.messages=[];window.ReactNativeWebView={postMessage:raw=>messages.push(JSON.parse(raw))};});
   await page.addScriptTag({content:txtParagraphBridge});
   await page.evaluate(()=>qrParagraphVisibility(true));
   await page.addScriptTag({content:txtScreenBoot({y:index*752})});
   await page.waitForFunction(()=>messages.some(m=>m.type==='qr-screen-ready'));
  }
  const [previous,current,next]=documents;
  assert.equal(await current.evaluate(()=>scrollY),752);
  assert.equal(await next.evaluate(()=>scrollY),1504);
  const id=8;
  await current.locator(`[data-i="${id}"] button`).click();
  const event=await current.evaluate(()=>messages.find(m=>m.type==='qr-paragraph-state'));
  assert.ok(event.state.pending);
  const sync=async state=>Promise.all(documents.map(page=>page.evaluate(({id,state})=>qrParagraphSync(id,state),{id,state})));
  await sync(event.state);
  await sync({open:true,pending:false,value:'她望向房间另一边，静静等候他的回答。'.repeat(8),error:false});
  const heights=await Promise.all(documents.map(page=>page.evaluate(()=>document.documentElement.scrollHeight)));
  assert.equal(new Set(heights).size,1,'expanded translations must produce identical pagination in every document');
  await sync({open:false,pending:false,value:'她望向房间另一边，静静等候他的回答。'.repeat(8),error:false});
  for(const page of documents){assert.equal(await page.locator(`[data-i="${id}"] div`).isVisible(),false);}
  assert.equal(await previous.evaluate(()=>messages.filter(m=>m.type==='qr-paragraph').length),0);
  assert.equal(await next.evaluate(()=>messages.filter(m=>m.type==='qr-paragraph').length),0);
  assert.equal(await current.evaluate(()=>messages.filter(m=>m.type==='qr-paragraph').length),1);
  console.log('PASS: three actual browser documents restore offsets, share translation geometry, and never issue preview AI requests');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
