const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { chromium } = require(process.env.PLAYWRIGHT_PATH);

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await page.setContent('<!doctype html><style>body{margin:0}iframe{width:390px;height:2400px;border:0}</style>' +
      '<iframe id=epub srcdoc="<!doctype html><style>body{margin:24px;padding-top:1100px;font:22px/2 serif}</style><p>He knew full well that his family would fall with him.</p>"></iframe>');
    await page.evaluate(() => {
      window.messages = [];
      window.qrReadingMode = 'scroll';
      window.ReactNativeWebView = { postMessage: value => window.messages.push(JSON.parse(value)) };
    });
    const compiled = ts.transpileModule(
      fs.readFileSync('src/features/reader/readingBridge.ts', 'utf8'),
      { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } },
    ).outputText;
    await page.addScriptTag({ content: 'var exports={};' + compiled + ';exports.readingBridge();' });
    await page.evaluate(() => {
      const frame = document.querySelector('#epub');
      window.qrReader.attach(frame.contentDocument, 'epub:0');
      window.scrollTo(0, 1000);
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const doc = document.querySelector('#epub').contentDocument;
      const paragraph = doc.querySelector('p');
      const rect = paragraph.getBoundingClientRect();
      const x = rect.left + 40, y = rect.top + 12;
      const touch = new Touch({ identifier: 1, target: paragraph.firstChild, clientX: x, clientY: y });
      doc.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], changedTouches: [touch], bubbles: true }));
    });
    await page.waitForTimeout(1150);
    const result = await page.evaluate(() => ({
      selected: document.querySelector('#epub').contentWindow.getSelection().toString(),
      toolbarTop: window.messages.findLast(message => message.type === 'qr-selection-ready')?.toolbarTop,
      frameTop: document.querySelector('#epub').getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
    }));
    assert.match(result.selected, /He knew full well/);
    assert.ok(Number.isFinite(result.toolbarTop), 'sentence selection must send the action-toolbar position');
    assert.ok(result.toolbarTop >= 0 && result.toolbarTop < result.viewportHeight,
      'action toolbar must be positioned inside the visible reader viewport; got ' + result.toolbarTop + 'px with iframe top ' + result.frameTop + 'px');
    console.log('PASS: scrolled EPUB selection keeps action toolbar inside the visible reader viewport');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
