const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { chromium } = require('C:/Users/Ciel Li/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

function load(file, name) {
  const exports = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText)(exports);
  return exports[name];
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<p>A paragraph whose translation changes pagination.</p>');
    await page.evaluate(() => {
      window.events = [];
      window.messages = [];
      window.ReactNativeWebView = { postMessage(raw) { const message = JSON.parse(raw); messages.push(message); events.push(message.type); } };
      window.rendition = {
        hooks: { content: { register() {} } },
        getContents() { return [{ document, window, sectionIndex: 0 }]; },
        manager: { async currentLocation() { return [1]; } },
        located() { return { start: { cfi: 'epubcfi(/6/2!/4/2/1:0)' } }; },
      };
      window.qrVisualPosition = { capture(location) { return location; } };
      window.qrPreviewRevision = 0;
      window.qrDecoratePage = function () { qrEpubParagraphs.setVisible(true); };
    });
    await page.addScriptTag({ content: load('src/features/reader/epubParagraphBridge.ts', 'epubParagraphBridge') });
    await page.addScriptTag({ content: load('src/features/reader/epubPaint.ts', 'epubPaintPageScript') });
    await page.evaluate(() => qrPaintPage({ start: { cfi: 'stale-before-layout' } }, 0));
    await page.waitForFunction(() => events.includes('qr-paragraph-layout'));
    const events = await page.evaluate(() => window.events);
    assert.ok(events.indexOf('qr-paragraph-layout') < events.indexOf('qr-page-painted'),
      `page-painted preceded paragraph relayout: ${events.join(' -> ')}`);
    assert.equal(events.filter(event => event === 'qr-page-painted').length, 1);
    assert.equal((await page.evaluate(() => messages.find(message => message.type === 'qr-page-painted'))).location.start.cfi,
      'epubcfi(/6/2!/4/2/1:0)');
    console.log('PASS: page-painted follows paragraph relayout');

    const noChange = await page.evaluate(async () => {
      const started = performance.now();
      const stable = await qrEpubParagraphs.whenLayoutStable();
      return { stable, elapsed: performance.now() - started };
    });
    assert.equal(noChange.stable, true);
    assert.ok(noChange.elapsed < 50, `settled layout took ${noChange.elapsed}ms`);
    console.log('PASS: no pending paragraph layout resolves immediately');

    const epochs = await page.evaluate(async () => {
      qrEpubParagraphs.setVisible(false);
      const first = qrEpubParagraphs.layoutEpoch;
      const waiting = qrEpubParagraphs.whenLayoutStable();
      qrEpubParagraphs.setVisible(true);
      const second = qrEpubParagraphs.layoutEpoch;
      await waiting;
      return { first, second, stable: qrEpubParagraphs.stableEpoch, pending: qrEpubParagraphs.pendingLayout };
    });
    assert.ok(epochs.second > epochs.first);
    assert.equal(epochs.stable, epochs.second);
    assert.equal(epochs.pending, false);
    console.log('PASS: superseded layout waits for the latest epoch');

    const stale = await page.evaluate(async () => {
      window.events = [];
      qrEpubParagraphs.setVisible(false);
      const started = performance.now();
      const painting = qrPaintPage({ start: { cfi: 'old' } }, 0);
      qrPreviewRevision = 1;
      const result = await painting;
      return { result, elapsed: performance.now() - started, events };
    });
    assert.equal(stale.result, false);
    assert.ok(stale.elapsed < 100, `stale revision took ${stale.elapsed}ms`);
    assert.ok(!stale.events.includes('qr-page-painted'));
    console.log('PASS: stale revision exits during layout wait without paint');

    const lateEpoch = await page.evaluate(async () => {
      window.events = [];
      window.messages = [];
      qrPreviewRevision = 2;
      const original = window.requestAnimationFrame;
      let frames = 0;
      window.requestAnimationFrame = callback => original(time => {
        frames++;
        if (frames === 2) qrEpubParagraphs.setVisible(false);
        callback(time);
      });
      try {
        const result = await qrPaintPage({ start: { cfi: 'old' } }, 2);
        return { result, messages, epoch: qrEpubParagraphs.layoutEpoch };
      } finally { window.requestAnimationFrame = original; }
    });
    assert.equal(lateEpoch.result, true);
    assert.equal(lateEpoch.messages.filter(message => message.type === 'qr-page-painted').length, 1);
    assert.equal(lateEpoch.messages.find(message => message.type === 'qr-page-painted').layoutEpoch, lateEpoch.epoch);
    assert.ok(lateEpoch.messages.findIndex(message => message.type === 'qr-paragraph-layout') <
      lateEpoch.messages.findIndex(message => message.type === 'qr-page-painted'));
    console.log('PASS: a mutation during final RAF restarts stabilization');

    const sameRevisionCancel = await page.evaluate(async () => {
      window.events = [];
      window.messages = [];
      qrEpubParagraphs.setVisible(false);
      const started = performance.now();
      const painting = qrPaintPage({ start: { cfi: 'old' } }, 2);
      window.qrCancelPaint?.();
      const result = await painting;
      return { result, elapsed: performance.now() - started, events };
    });
    assert.equal(sameRevisionCancel.result, false);
    assert.ok(sameRevisionCancel.elapsed < 100);
    assert.ok(!sameRevisionCancel.events.includes('qr-page-painted'));
    console.log('PASS: same-revision hidden cancellation stops paint immediately');

    const externalResize = await page.evaluate(async () => {
      await qrEpubParagraphs.whenLayoutStable();
      const before = qrEpubParagraphs.layoutEpoch;
      window.dispatchEvent(new Event('resize'));
      const after = qrEpubParagraphs.layoutEpoch;
      await qrEpubParagraphs.whenLayoutStable();
      return { before, after, stable: qrEpubParagraphs.stableEpoch };
    });
    assert.equal(externalResize.after, externalResize.before + 1);
    assert.equal(externalResize.stable, externalResize.after);
    console.log('PASS: external resize creates one layout cycle without recursion');

    const invalid = await page.evaluate(async () => {
      window.events = [];
      window.messages = [];
      qrPreviewRevision = 3;
      qrEpubParagraphs.setVisible(false);
      rendition.located = () => ({ start: {} });
      const started = performance.now();
      const result = await qrPaintPage({ start: { cfi: 'old' } }, 3);
      return { result, elapsed: performance.now() - started, events, messages };
    });
    assert.equal(invalid.result, false);
    assert.ok(invalid.elapsed >= 2900 && invalid.elapsed < 4500,
      `layout watchdog fired after ${invalid.elapsed}ms`);
    assert.ok(invalid.messages.some(message => message.type === 'qr-preview-error' && message.code === 'LAYOUT_TIMEOUT'));
    assert.ok(!invalid.events.includes('qr-page-painted'));
    console.log('PASS: invalid final location reaches bounded watchdog without painting');

    const hung = await page.evaluate(async () => {
      window.events = [];
      window.messages = [];
      qrPreviewRevision = 4;
      rendition.located = () => ({ start: { cfi: 'epubcfi(/6/2!/4/2/1:0)' } });
      qrEpubParagraphs.setVisible(false);
      await qrEpubParagraphs.whenLayoutStable();
      qrEpubParagraphs.setVisible(true);
      await qrEpubParagraphs.whenLayoutStable();
      rendition.manager.currentLocation = () => new Promise(() => {});
      const started = performance.now();
      const result = await qrPaintPage({ start: { cfi: 'old' } }, 4);
      return { result, elapsed: performance.now() - started, messages };
    });
    assert.equal(hung.result, false);
    assert.ok(hung.elapsed >= 4800 && hung.elapsed < 6500, `full paint watchdog fired after ${hung.elapsed}ms`);
    assert.ok(hung.messages.some(message => message.type === 'qr-preview-error' && message.code === 'PAINT_TIMEOUT'));
    assert.ok(!hung.messages.some(message => message.type === 'qr-page-painted'));
    console.log('PASS: hung final currentLocation reaches full paint watchdog');

    const rejected = await page.evaluate(async () => {
      window.events = [];
      window.messages = [];
      qrPreviewRevision = 5;
      rendition.manager.currentLocation = () => Promise.reject(Error('manager failed'));
      const result = await qrPaintPage({ start: { cfi: 'old' } }, 5);
      return { result, messages };
    });
    assert.equal(rejected.result, false);
    assert.ok(rejected.messages.some(message => message.type === 'qr-preview-error' && message.code === 'LOCATION_UNSTABLE'));
    assert.ok(!rejected.messages.some(message => message.type === 'qr-page-painted'));
    console.log('PASS: final location failure cannot be reported as decoration or paint');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
