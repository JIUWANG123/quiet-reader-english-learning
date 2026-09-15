import {File,Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import {Platform} from 'react-native';

type Event='preview-ready'|'preview-error'|'load'|'started'|'restore-ready'|'restore-error'|'progress'|'saved'|'save-error'|'journal-error';
type Detail={bookId?:string;cfi?:string;progress?:number;code?:string;mode?:string};
// Compare positions without exporting EPUB IDs or text.
function fingerprint(value:string){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return (h>>>0).toString(16);}
let events:object[]|undefined,timer:ReturnType<typeof setTimeout>|undefined;
const logFile=()=>new File(Paths.document,'reader-diagnostics.json');
function read(){if(!events){try{const parsed=JSON.parse(logFile().textSync());events=Array.isArray(parsed)?parsed.slice(-200):[];}catch{events=[];}}return events!;}
function persist(){if(timer)clearTimeout(timer);timer=undefined;try{logFile().write(JSON.stringify(read()));}catch{/* Diagnostics must never block reading. */}}
export function traceReading(event:Event,detail:Detail={}){
 try{
  const rows=read();rows.push({time:Date.now(),version:Constants.expoConfig?.version,event,
   book:detail.bookId?fingerprint(detail.bookId):undefined,anchor:detail.cfi?fingerprint(detail.cfi):undefined,
   progress:Number.isFinite(detail.progress)?detail.progress:undefined,
   code:detail.code&&/^[A-Z_]{1,40}$/.test(detail.code)?detail.code:undefined,
   mode:['swipe','tap','scroll'].includes(detail.mode??'')?detail.mode:undefined});
  if(rows.length>200)rows.splice(0,rows.length-200);
  if(event.endsWith('error'))persist();else if(!timer)timer=setTimeout(persist,2000);
 }catch{/* Logging is best effort. */}
}
export async function exportReadingDiagnostics(){
 persist();
 if(!await Sharing.isAvailableAsync())throw Error('此设备暂不支持文件分享。');
 const file=new File(Paths.cache,'QuietReader-diagnostics.json');
 file.write(JSON.stringify({version:Constants.expoConfig?.version,platform:Platform.OS,system:Platform.Version,events:read()},null,2));
 await Sharing.shareAsync(file.uri,{mimeType:'application/json',UTI:'public.json',dialogTitle:'导出阅读诊断'});
}
