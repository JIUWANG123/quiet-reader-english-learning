import {File,Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import {Platform} from 'react-native';
import {sanitizeReadingEvent,appendReadingEvent,type ReadingEvent,type ReadingDetail} from './diagnosticsCore';

export type {ReadingEvent,ReadingDetail} from './diagnosticsCore';
let events:ReturnType<typeof sanitizeReadingEvent>[]|undefined,timer:ReturnType<typeof setTimeout>|undefined;
let lastKey='',lastTime=0;
const logFile=()=>new File(Paths.document,'reader-diagnostics.json');
function read(){if(!events){try{const parsed=JSON.parse(logFile().textSync());events=Array.isArray(parsed)?parsed.slice(-500):[];}catch{events=[];}}return events;}
function persist(){if(timer)clearTimeout(timer);timer=undefined;try{logFile().write(JSON.stringify(read()));}catch{/* Never block reading. */}}
export function traceReading(event:ReadingEvent,detail:ReadingDetail={}){
 try{
  const now=Date.now(),row=sanitizeReadingEvent(event,detail,now,Constants.expoConfig?.version),key=event+JSON.stringify({...row,time:undefined});
  if(key===lastKey&&now-lastTime<250)return;lastKey=key;lastTime=now;
  const rows=read();appendReadingEvent(rows,row);
  if(event.endsWith('error')||event.startsWith('reader-session-')||event.startsWith('previous-')||event==='webview-process-gone')persist();
  else if(!timer)timer=setTimeout(persist,2000);
 }catch{/* Diagnostics are best effort. */}
}
export async function exportReadingDiagnostics(){
 persist();
 if(!await Sharing.isAvailableAsync())throw Error('此设备暂不支持文件分享。');
 const file=new File(Paths.cache,'QuietReader-diagnostics.json');
 file.write(JSON.stringify({version:Constants.expoConfig?.version,platform:Platform.OS,system:Platform.Version,events:read()},null,2));
 await Sharing.shareAsync(file.uri,{mimeType:'application/json',UTI:'public.json',dialogTitle:'导出阅读诊断'});
}
