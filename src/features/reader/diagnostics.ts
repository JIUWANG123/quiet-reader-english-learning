import {File,Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import {Platform} from 'react-native';
import {keepRecentAIDiagnostics,sanitizeAIDiagnosticError,type AIDiagnosticEvent} from '../../services/ai/diagnosticsModel';

type Event='gesture-start'|'gesture-blocked'|'gesture-release'|'preview-request'|'preview-ready'|'preview-error'|'load'|'started'|'restore-ready'|'restore-error'|'progress'|'saved'|'save-error'|'journal-error'|'import-start'|'import-picker-done'|'import-stage'|'import-index-failure'|'import-failure'|'import-complete'|'webview-unresponsive'|'webview-responsive'|'library-refresh-failure'|'app-error';
type Detail={bookId?:string;cfi?:string;target?:string;progress?:number;code?:string;mode?:string;direction?:number;requestId?:string;generation?:number;duration?:number;cacheHit?:boolean;lockReason?:string;isAnimating?:boolean;previewReady?:boolean;stage?:string;format?:'epub'|'txt';sizeBucket?:'lt1mb'|'1to10mb'|'10to50mb'|'50to128mb'|'over128mb';result?:'success'|'failure'|'cancelled'};
// Compare positions without exporting EPUB IDs or text.
function fingerprint(value:string){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return (h>>>0).toString(16);}
let events:object[]|undefined,timer:ReturnType<typeof setTimeout>|undefined;
let lastKey='',lastTime=0;
const logFile=()=>new File(Paths.document,'reader-diagnostics.json');
const aiLogFile=()=>new File(Paths.document,'ai-diagnostics.json');
let aiEvents:AIDiagnosticEvent[]|undefined;
function read(){if(!events){try{const parsed=JSON.parse(logFile().textSync());events=Array.isArray(parsed)?parsed.slice(-200):[];}catch{events=[];}}return events!;}
function persist(){if(timer)clearTimeout(timer);timer=undefined;try{logFile().write(JSON.stringify(read()));}catch{/* Diagnostics must never block reading. */}}
export function traceReading(event:Event,detail:Detail={}){
 try{
  const now=Date.now(),key=event+JSON.stringify(detail);
  if(key===lastKey&&now-lastTime<250)return;lastKey=key;lastTime=now;
  const rows=read();rows.push({time:Date.now(),version:Constants.expoConfig?.version,event,
   book:detail.bookId?fingerprint(detail.bookId):undefined,anchor:detail.cfi?fingerprint(detail.cfi):undefined,
   progress:Number.isFinite(detail.progress)?detail.progress:undefined,
   target:detail.target?fingerprint(detail.target):undefined,
   direction:[-1,0,1].includes(detail.direction??2)?detail.direction:undefined,
   requestId:detail.requestId&&/^[a-zA-Z0-9:-]{1,80}$/.test(detail.requestId)?detail.requestId:undefined,
   generation:Number.isSafeInteger(detail.generation)?detail.generation:undefined,
   duration:Number.isFinite(detail.duration)?Math.round(detail.duration!):undefined,
   cacheHit:detail.cacheHit,isAnimating:detail.isAnimating,previewReady:detail.previewReady,
   lockReason:['ANIMATING','PREVIEW_PENDING','BOUNDARY','CANCELLED','TIMEOUT'].includes(detail.lockReason??'')?detail.lockReason:undefined,
   code:detail.code&&/^[A-Z0-9_]{1,48}$/.test(detail.code)?detail.code:undefined,
   mode:['swipe','tap','scroll','epub','txt','import'].includes(detail.mode??'')?detail.mode:undefined,
   stage:detail.stage&&/^[a-z0-9_-]{1,48}$/.test(detail.stage)?detail.stage:undefined,
   format:['epub','txt'].includes(detail.format??'')?detail.format:undefined,
   sizeBucket:['lt1mb','1to10mb','10to50mb','50to128mb','over128mb'].includes(detail.sizeBucket??'')?detail.sizeBucket:undefined,
   result:['success','failure','cancelled'].includes(detail.result??'')?detail.result:undefined});
  if(rows.length>400)rows.splice(0,rows.length-400);
  if(event.endsWith('error')||event.endsWith('failure')||event.startsWith('import-')||event==='webview-unresponsive'||event==='app-error')persist();else if(!timer)timer=setTimeout(persist,2000);
 }catch{/* Logging is best effort. */}
}
export async function exportReadingDiagnostics(){
 persist();
 if(!await Sharing.isAvailableAsync())throw Error('此设备暂不支持文件分享。');
 const file=new File(Paths.cache,'QuietReader-diagnostics.json');
 const aiEvents=readAIDiagnostics();
 const timeline=[...read(),...aiEvents.map(item=>({time:item.time,version:Constants.expoConfig?.version,event:`ai-${item.event}`,mode:item.mode,stage:item.stage,duration:item.duration,status:item.status,error:item.error,cached:item.cached}))].sort((a,b)=>(a as {time:number}).time-(b as {time:number}).time).slice(-500);
 file.write(JSON.stringify({version:Constants.expoConfig?.version,platform:Platform.OS,system:Platform.Version,events:timeline,aiEvents},null,2));
 await Sharing.shareAsync(file.uri,{mimeType:'application/json',UTI:'public.json',dialogTitle:'导出阅读诊断'});
}

function readAIDiagnostics(){if(!aiEvents){try{const parsed=JSON.parse(aiLogFile().textSync());aiEvents=Array.isArray(parsed)?keepRecentAIDiagnostics(parsed):[];}catch{aiEvents=[];}}return aiEvents;}
export function recordAIDiagnostic(entry:AIDiagnosticEvent){try{const rows=readAIDiagnostics();if(entry.event==='progress'){const last=rows[rows.length-1];if(last?.event==='started'&&last.mode===entry.mode){rows[rows.length-1]={...last,stage:entry.stage,status:entry.status};}else rows.push({...entry});}else rows.push({...entry,error:entry.error?sanitizeAIDiagnosticError(entry.error):undefined});aiEvents=keepRecentAIDiagnostics(rows);aiLogFile().write(JSON.stringify(aiEvents));}catch{/* Diagnostics must never interrupt AI requests. */}}
export function clearAIDiagnostics(){try{aiEvents=[];aiLogFile().write('[]');}catch{/* Best effort. */}}
export function readAIDiagnosticEvents(){return readAIDiagnostics().slice();}
