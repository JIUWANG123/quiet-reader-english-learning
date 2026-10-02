import {useCallback,useRef} from 'react';
import {AppState,Platform} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {requireOptionalNativeModule} from 'expo';
export {volumeKeysEnabledForReadingMode} from './volumePolicy';
type Keys={setEnabled:(enabled:boolean)=>void;addListener:(event:string,fn:(event:{direction:number})=>void)=>{remove:()=>void}};
const keys=Platform.OS==='android'?requireOptionalNativeModule<Keys>('ReaderKeys'):null;
export const volumeKeysAvailable=Boolean(keys);
export function useVolumePageTurn(enabled:boolean,onTurn:(direction:number)=>void){
 const callback=useRef(onTurn);callback.current=onTurn;
 const allowed=useRef(enabled);allowed.current=enabled;
 useFocusEffect(useCallback(()=>{
  if(!keys)return;
  keys.setEnabled(enabled&&AppState.currentState==='active');
  const subscription=keys.addListener('onTurn',event=>{if(allowed.current&&(event.direction===1||event.direction===-1))callback.current(event.direction);});
  const state=AppState.addEventListener('change',value=>keys.setEnabled(enabled&&value==='active'));
  return()=>{keys.setEnabled(false);subscription.remove();state.remove();};
 },[enabled]));
}
