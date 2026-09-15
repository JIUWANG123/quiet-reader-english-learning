import {createContext,useContext,useEffect,useRef,useState,type PropsWithChildren} from 'react';
import {AppState,Vibration} from 'react-native';
import {useSQLiteContext} from 'expo-sqlite';
import {countdownRemaining,focusDefaults,type FocusPreferences} from './model';
import {loadPreferences,savePreferences} from './repository';
type Phase='idle'|'focus'|'break'|'done';
function useFocusController(){
 const db=useSQLiteContext();const [preferences,setPreferences]=useState(focusDefaults);const [phase,setPhase]=useState<Phase>('idle');const [remaining,setRemaining]=useState(0);const [error,setError]=useState('');
 const deadline=useRef(0);const phaseRef=useRef<Phase>('idle');const prefs=useRef(preferences);prefs.current=preferences;
 useEffect(()=>{void loadPreferences(db).then(setPreferences).catch(()=>setError('偏好读取失败'));},[db]);
 function finish(){deadline.current=0;phaseRef.current='done';setPhase('done');setRemaining(0);if(prefs.current.vibrate&&AppState.currentState==='active')Vibration.vibrate(180);}
 useEffect(()=>{function tick(){if(!deadline.current)return;const left=countdownRemaining(deadline.current,Date.now());setRemaining(left);if(!left)finish();}const timer=setInterval(tick,1000);const sub=AppState.addEventListener('change',()=>tick());return()=>{clearInterval(timer);sub.remove();Vibration.cancel();};},[]);
 function start(next:'focus'|'break'){const seconds=(next==='focus'?preferences.minutes:preferences.breakMinutes)*60;deadline.current=Date.now()+seconds*1000;phaseRef.current=next;setPhase(next);setRemaining(seconds);}
 function stop(){deadline.current=0;phaseRef.current='idle';setPhase('idle');setRemaining(0);Vibration.cancel();}
 async function update(value:FocusPreferences){try{await savePreferences(db,value);setPreferences(value);if(!value.vibrate)Vibration.cancel();setError('');}catch{setError('设置保存失败，请重试');}}
 return {preferences,phase,remaining,error,start,stop,update};
}
const FocusContext=createContext<ReturnType<typeof useFocusController>|null>(null);
export function FocusProvider({children}:PropsWithChildren){const value=useFocusController();return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;}
export function useFocusTimer(){const value=useContext(FocusContext);if(!value)throw new Error('FocusProvider missing');return value;}
export function focusLabel(seconds:number){return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
