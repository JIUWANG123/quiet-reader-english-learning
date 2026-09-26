import {File,Paths} from 'expo-file-system';
import {requireOptionalNativeModule} from 'expo';
import * as Crypto from 'expo-crypto';
import {Platform} from 'react-native';
import {ReaderSessionJournal} from './readerLifecycleCore';
import {classifyProcessExit} from './diagnosticsCore';
import {traceReading} from './diagnostics';
import {cleanupStaleEpubRuntimes} from './epubRuntime';

type Exit={reason:number;importance:number;pss:number;rss:number;timestamp:number};
type Native={lastProcessExit:()=>Exit|null;addListener:(event:'onMemoryPressure',callback:(detail:{level:number;pressure:string})=>void)=>{remove:()=>void}};
const native=Platform.OS==='android'?requireOptionalNativeModule<Native>('ReaderDiagnostics'):null;
const journal=new ReaderSessionJournal({
 read:()=>{try{return new File(Paths.document,'reader-session.json').textSync();}catch{return'';}},
 write:value=>new File(Paths.document,'reader-session.json').write(value),
});
let initialized=false;
export function initializeReaderDiagnostics(){
 if(initialized)return;initialized=true;
 try{const previous=journal.recoverPrevious();if(previous)traceReading('previous-session-unclean',{sessionId:previous.sessionId,bookId:previous.bookId});}catch{}
 try{const exit=native?.lastProcessExit();if(exit){const result=classifyProcessExit(exit.reason);traceReading('previous-process-exit',{code:result.reason,importance:exit.importance,pss:exit.pss,rss:exit.rss,timestamp:exit.timestamp});}}catch{}
 try{cleanupStaleEpubRuntimes();}catch{}
}
export function startReaderSession(bookId:string){initializeReaderDiagnostics();const sessionId=Crypto.randomUUID();try{journal.start(sessionId,bookId);}catch{}traceReading('reader-session-start',{sessionId,bookId});return sessionId;}
export function readyReaderSession(sessionId:string,bookId?:string){traceReading('reader-session-ready',{sessionId,bookId});}
export function backgroundReaderSession(sessionId:string){traceReading('reader-session-background',{sessionId});}
export function foregroundReaderSession(sessionId:string){traceReading('reader-session-foreground',{sessionId});}
export function recoverReaderSession(sessionId:string){traceReading('reader-session-recover',{sessionId});}
export function endReaderSession(sessionId:string){try{journal.end(sessionId);}catch{}traceReading('reader-session-clean-end',{sessionId});}
export function subscribeReaderMemoryPressure(callback:(pressure:'running-low'|'running-critical')=>void){
 if(!native)return()=>{};
 const subscription=native.addListener('onMemoryPressure',detail=>{
  if(detail.pressure!=='running-low'&&detail.pressure!=='running-critical')return;
  traceReading('memory-pressure',{pressure:detail.pressure});callback(detail.pressure);
 });
 return()=>subscription.remove();
}
