#!/usr/bin/env node
// Native acceptance driver. It only writes aggregate data and hashed position
// relationships; never copy the EPUB, database, screenshots or raw CFIs into reports.
const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);

const adbPath = process.env.ADB_PATH || path.resolve(__dirname, '../../qr-build-temp-3/sdk/platform-tools/adb.exe');
const packageName = 'com.quietreader.personal';
const diagnosticsPath = `/data/data/${packageName}/files/reader-diagnostics.json`;
const args = process.argv.slice(2);
const option = (name, fallback) => {const index=args.indexOf(name); return index<0?fallback:args[index+1];};
const phase = option('--phase', 'baseline');
const cold = Number(option('--cold', '20'));
const forwards = Number(option('--forward', '0'));
const alternates = Number(option('--alternate', '0'));
const backgrounds = Number(option('--background', '0'));
const firstSwipeDelay = Number(option('--first-swipe-delay', '850'));
const output = option('--out', path.resolve(__dirname, '../work/startup-diagnostics', `${phase}-android.json`));
const serial = process.env.ANDROID_SERIAL;
const adbArgs = serial ? ['-s', serial] : [];
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const adb = async (...command) => (await exec(adbPath, [...adbArgs,...command], {maxBuffer:16*1024*1024,timeout:30000})).stdout;
const shell = (...command) => adb('shell',...command);
const number = (value, fallback) => Number.isFinite(value)?value:fallback;
const percentile = (values,p) => values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const stats = values => ({count:values.length,p50:percentile(values,.5),p95:percentile(values,.95),max:values.length?Math.max(...values):null});

async function readEvents(){
  const raw=await shell('cat',diagnosticsPath);
  const parsed=JSON.parse(raw);
  if(!Array.isArray(parsed))throw Error('Diagnostics file is not an array');
  return parsed;
}
async function deviceTime(){return Number((await shell('date','+%s%3N')).trim());}
async function memory(stage){
  const raw=await shell('dumpsys','meminfo',packageName);
  const pss=Number(raw.match(/TOTAL PSS:\s*(\d+)/)?.[1]);
  const rss=Number(raw.match(/TOTAL RSS:\s*(\d+)/)?.[1]);
  const webviews=Number(raw.match(/WebViews:\s*(\d+)/)?.[1]);
  return {stage,pssKb:number(pss,null),rssKb:number(rss,null),webviews:number(webviews,null)};
}
async function waitForEvents(minimumTime, predicate, timeoutMs=6000){
  const deadline=Date.now()+timeoutMs;
  let last=[];
  while(Date.now()<deadline){
    try{last=(await readEvents()).filter(e=>e.time>=minimumTime);if(predicate(last))return last;}catch{}
    await sleep(160);
  }
  return last;
}
function count(events,name){return events.filter(e=>e.event===name).length;}
function successFor(events,release){
  return events.some(e=>e.event==='progress'&&e.time>=release.time&&e.time-release.time<3000&&e.anchor===release.target&&e.anchor!==release.anchor);
}
function firstSuccess(events){return events.find(e=>e.event==='gesture-release'&&e.direction===1&&successFor(events,e));}
function summarizeCold(events,index){
  const started=events.find(e=>e.event==='started');
  const ready=events.find(e=>e.event==='restore-ready');
  const current=events.find(e=>e.event==='preview-ready'&&e.direction===0);
  const next=events.find(e=>e.event==='preview-ready'&&e.direction===1&&(!ready||e.time>=ready.time));
  const first=firstSuccess(events);
  const progress=first&&events.find(e=>e.event==='progress'&&e.time>=first.time&&e.anchor===first.target);
  return {
    index,valid:Boolean(started&&ready&&current&&next&&first&&progress),
    restoreMs:started&&ready?ready.time-started.time:null,
    nextReadyMs:ready&&next?next.time-ready.time:null,
    firstTurnMs:ready&&progress?progress.time-ready.time:null,
    gestureMs:first?first.duration??null:null,
    firstTurnConfirmed:Boolean(first&&progress),
    previewPending:events.filter(e=>e.event==='gesture-blocked'&&e.lockReason==='PREVIEW_PENDING').length,
    previewSlow:count(events,'preview-slow'),
    previewTimeout:events.filter(e=>e.event==='preview-error'&&e.code==='PREVIEW_TIMEOUT').length,
    invalidations:count(events,'neighbor-invalidated'),
    rendererGone:count(events,'webview-process-gone'),
    nextGenerations:[...new Set(events.filter(e=>e.event==='preview-request'&&e.direction===1).map(e=>e.generation).filter(Number.isInteger))],
    previousGenerations:[...new Set(events.filter(e=>e.event==='preview-request'&&e.direction===-1).map(e=>e.generation).filter(Number.isInteger))]
  };
}
async function swipe(direction){
  const coords=direction===1?['900','1100','150','1100','120']:['150','1100','900','1100','120'];
  await shell('input','swipe',...coords);
}
async function coldRun(){
  const rows=[]; const memoryRows=[];
  for(let i=0;i<cold;i++){
    if(i>0){await shell('input','keyevent','4');await sleep(350);}
    const started=await deviceTime();
    await shell('input','tap','500','830');
    await sleep(firstSwipeDelay);
    await swipe(1);
    await sleep(550);
    // The first input deliberately races next readiness. A second input soon
    // after it makes the measured first successful turn reflect user retries.
    await swipe(1);
    let events=await waitForEvents(started,rows=>Boolean(rows.find(e=>e.event==='restore-ready')&&firstSuccess(rows)),3600);
    if(!firstSuccess(events)){
      await swipe(1);
      events=await waitForEvents(started,rows=>Boolean(firstSuccess(rows)),3600);
    }
    events=await waitForEvents(started,rows=>rows.some(e=>e.event==='preview-ready'&&e.direction===1)&&Boolean(firstSuccess(rows)),3200);
    const row=summarizeCold(events,i+1);rows.push(row);
    if(i===0)memoryRows.push(await memory('full-three-pages-indicative'));
    console.log(`cold ${i+1}/${cold}: restore=${row.restoreMs ?? 'n/a'}ms next=${row.nextReadyMs ?? 'n/a'}ms first=${row.firstTurnMs ?? 'n/a'}ms confirmed=${row.firstTurnConfirmed} pending=${row.previewPending} timeout=${row.previewTimeout}`);
  }
  return {rows,memoryRows};
}
async function turnsRun(forwardGoal,alternateGoal){
  if(!forwardGoal&&!alternateGoal)return null;
  const started=await deviceTime(); const observed=new Map();let attempts=0,forward=0,alternate=0;
  const capture=async()=>{for(const e of (await readEvents()).filter(e=>e.time>=started))observed.set(JSON.stringify(e),e);};
  const verified=()=>{
    const rows=[...observed.values()].sort((a,b)=>a.time-b.time);
    return rows.filter(e=>e.event==='gesture-release'&&successFor(rows,e));
  };
  const maxAttempts=forwardGoal*2+alternateGoal*2+15;
  while(forward<forwardGoal&&attempts<maxAttempts){
    attempts++;await swipe(1);await sleep(430);if(attempts%5===0)await capture();
    if(attempts%10===0){forward=verified().filter(e=>e.direction===1).length;console.log(`forward confirmed ${forward}/${forwardGoal}, attempted ${attempts}`);}
  }
  await sleep(2500);await capture();forward=verified().filter(e=>e.direction===1).length;
  const memoryRows=[];
  if(forwardGoal>=50)memoryRows.push(await memory('after-50-plus-forward-attempts'));
  if(forwardGoal>=100)memoryRows.push(await memory('after-100-plus-forward-attempts'));
  let lastAnchor=null;
  for(let i=0;i<alternateGoal&&attempts<maxAttempts;i++){
    const direction=i%2===0?-1:1;
    attempts++;await swipe(direction);await sleep(460);
    if(i%5===4)await capture();
    const turns=verified();
    const latest=turns.at(-1);
    if(latest&&latest.target!==lastAnchor){alternate++;lastAnchor=latest.target;}
  }
  await sleep(2500);await capture();
  const events=[...observed.values()].sort((a,b)=>a.time-b.time);
  const validTurns=verified();
  return {forwardGoal,alternateGoal,attempts,forwardConfirmed:forward,alternateConfirmed:alternate,
    validTurns:validTurns.length,previewPending:events.filter(e=>e.event==='gesture-blocked'&&e.lockReason==='PREVIEW_PENDING').length,
    previewSlow:count(events,'preview-slow'),previewTimeout:events.filter(e=>e.event==='preview-error'&&e.code==='PREVIEW_TIMEOUT').length,
    rendererGone:count(events,'webview-process-gone'),memoryRows};
}
async function backgroundRun(cycles){
  if(!cycles)return null;
  const rows=[],memoryRows=[];
  for(let i=0;i<cycles;i++){
    const started=await deviceTime();
    await shell('input','keyevent','3');await sleep(650);
    if(i===0)memoryRows.push(await memory('background'));
    await shell('monkey','-p',packageName,'1');await sleep(400);
    if(i===0)memoryRows.push(await memory('foreground'));
    await swipe(1);await sleep(2450);
    const events=(await readEvents()).filter(e=>e.time>=started);
    rows.push({index:i+1,confirmed:events.some(e=>e.event==='gesture-release'&&e.direction===1&&successFor(events,e)),
      pending:events.filter(e=>e.event==='gesture-blocked'&&e.lockReason==='PREVIEW_PENDING').length,
      rendererGone:count(events,'webview-process-gone')});
    console.log(`background ${i+1}/${cycles}: turn confirmed=${rows.at(-1).confirmed}`);
  }
  return {rows,memoryRows};
}
async function main(){
  for(const n of [cold,forwards,alternates,backgrounds,firstSwipeDelay])if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid numeric argument');
  const devices=await adb('devices');if(!devices.includes('device'))throw Error('No Android device available');
  const api=Number((await shell('getprop','ro.build.version.sdk')).trim());
  const packagePath=(await shell('pm','path',packageName)).trim();if(!packagePath.includes(packageName))throw Error('QuietReader is not installed');
  const result={phase,deviceApi:api,runAt:new Date().toISOString(),packageName,settings:{cold,forwards,alternates,backgrounds,firstSwipeDelay},
    cold:null,turns:null,background:null};
  if(cold){result.cold=await coldRun();await shell('input','keyevent','4');await sleep(350);}
  if(forwards||alternates){await shell('input','tap','500','830');await waitForEvents(await deviceTime()-2000,rows=>rows.some(e=>e.event==='restore-ready'),5000);result.turns=await turnsRun(forwards,alternates);}
  if(backgrounds)result.background=await backgroundRun(backgrounds);
  const coldRows=result.cold?.rows||[];
  result.summary={coldValid:coldRows.filter(r=>r.valid).length,
    restore:stats(coldRows.map(r=>r.restoreMs).filter(Number.isFinite)),
    nextReady:stats(coldRows.map(r=>r.nextReadyMs).filter(Number.isFinite)),
    firstTurn:stats(coldRows.map(r=>r.firstTurnMs).filter(Number.isFinite)),
    previewPending:coldRows.reduce((sum,r)=>sum+r.previewPending,0),
    previewSlow:coldRows.reduce((sum,r)=>sum+r.previewSlow,0),
    previewTimeout:coldRows.reduce((sum,r)=>sum+r.previewTimeout,0),
    invalidations:coldRows.reduce((sum,r)=>sum+r.invalidations,0),
    rendererGone:coldRows.reduce((sum,r)=>sum+r.rendererGone,0)};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2));
  console.log(JSON.stringify({output,summary:result.summary,turns:result.turns,background:result.background},null,2));
  if(coldRows.some(r=>!r.valid))process.exitCode=1;
  if(result.turns&&(result.turns.forwardConfirmed<forwards||result.turns.alternateConfirmed<alternates))process.exitCode=1;
  if(result.background?.rows.some(r=>!r.confirmed))process.exitCode=1;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
