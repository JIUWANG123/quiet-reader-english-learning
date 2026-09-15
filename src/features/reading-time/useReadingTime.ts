import {useCallback,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useSQLiteContext} from 'expo-sqlite';
import {readingSlices} from './model';
import {loadPreferences,recordReading} from './repository';
export function useReadingTime(bookId:string,ready:boolean){
 const db=useSQLiteContext();const activity=useRef<()=>void>(()=>{});const [error,setError]=useState('');
 const interact=useCallback(()=>activity.current(),[]);
 useFocusEffect(useCallback(()=>{
  if(!ready)return;
  let last=Date.now(),lastInteraction=last,foreground=AppState.currentState==='active',goal=5;
  let pending:{day:string;milliseconds:number}[]=[],saving=false,closed=false;
  void loadPreferences(db).then(p=>{goal=p.checkInMinutes;}).catch(()=>{});
  async function persist(){
   if(saving||!pending.length)return;saving=true;const batch=pending;pending=[];let saved=false;
   try{await recordReading(db,bookId,batch,goal);saved=true;if(!closed)setError('');}
   catch{pending.unshift(...batch);if(!closed)setError('阅读时长保存失败，将自动重试');}
   finally{saving=false;if(saved&&pending.length)void persist();}
  }
  function tick(save=true){const now=Date.now();pending.push(...readingSlices(last,now,lastInteraction,foreground));last=now;if(save)void persist();}
  activity.current=()=>{tick(false);lastInteraction=Date.now();};
  const change=AppState.addEventListener('change',state=>{tick();foreground=state==='active';last=Date.now();if(foreground)lastInteraction=last;});
  const blur=AppState.addEventListener('blur',()=>{tick();foreground=false;});
  const focus=AppState.addEventListener('focus',()=>{last=Date.now();lastInteraction=last;foreground=AppState.currentState==='active';});
  const timer=setInterval(()=>tick(),15000);
  return ()=>{tick();closed=true;activity.current=()=>{};clearInterval(timer);change.remove();blur.remove();focus.remove();};
 },[bookId,db,ready]));
 return {interact,error};
}
