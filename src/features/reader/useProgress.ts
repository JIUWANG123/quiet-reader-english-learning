import {useCallback,useEffect,useMemo,useState} from 'react';
import {AppState} from 'react-native';
import {useSQLiteContext} from 'expo-sqlite';
import {saveEpubProgress,saveProgress} from '../../services/books/repository';
import {readingProgress,clamp} from '../../services/books/text';
import {writeRecovery,positionStamp} from './progressRecovery';
import {createProgressSaver} from './progressSaver';
import {traceReading} from './diagnostics';
export function useProgress(id:string){
 const db=useSQLiteContext();const [error,setError]=useState('');
 const saver=useMemo(()=>createProgressSaver({journal:value=>{try{writeRecovery(id,value);}catch(error){traceReading('journal-error',{bookId:id,code:'WRITE_ERROR'});throw error;}},onError:setError,save:async value=>{
  try{if(value.cfi)await saveEpubProgress(db,id,value.cfi,value.progress,value.updated);else await saveProgress(db,id,value.page,value.fraction,value.count,value.updated);traceReading('saved',{bookId:id,cfi:value.cfi,progress:value.progress});}
  catch(error){traceReading('save-error',{bookId:id,cfi:value.cfi,code:/SQLITE_[A-Z]+/.exec(String(error))?.[0]??'WRITE_ERROR'});throw error;}
 }}),[db,id]);
 const schedule=useCallback((page:number,fraction:number,count:number)=>saver.stage({page,fraction:clamp(fraction,0,1),count,progress:readingProgress(page,fraction,count),updated:positionStamp()}),[saver]);
 const scheduleEpub=useCallback((cfi:string,fraction:number)=>saver.stage({page:0,fraction:0,count:0,cfi,progress:clamp(fraction,0,1),updated:positionStamp()}),[saver]);
 useEffect(()=>{saver.open();const sub=AppState.addEventListener('change',state=>{if(state!=='active')void saver.flush();});return()=>{sub.remove();void saver.close();};},[saver]);
 return {schedule,scheduleEpub,flush:saver.flush,error};
}
