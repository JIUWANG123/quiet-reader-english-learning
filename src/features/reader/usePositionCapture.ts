import {useCallback,useEffect,useRef} from 'react';
import type {Location} from '@epubjs-react-native/core';
export type PositionCaptureRef={current:(()=>Promise<boolean>)|null};
type Message={type?:string;requestId?:number;location?:Location;fraction?:number};
export function usePositionCapture(inject:(script:string)=>void,accept:(location:Location,fraction?:number)=>void,ready:()=>boolean,onError:()=>void){
 const requests=useRef(new Map<number,{resolve:(ok:boolean)=>void;timer:ReturnType<typeof setTimeout>}>());
 const nextId=useRef(0);
 const capture=useCallback(()=>{
  if(!ready())return Promise.resolve(true); // A failed restoration must still allow returning to the library.
  return new Promise<boolean>(resolve=>{const id=++nextId.current;
   const timer=setTimeout(()=>{requests.current.delete(id);onError();resolve(false);},5000);
   requests.current.set(id,{resolve,timer});
   inject(`window.qrProgress?.capture(${id});true;`);
  });
 },[inject,ready,onError]);
 const receive=useCallback((data:Message)=>{
  if(data.type!=='qr-position-snapshot')return false;
  const request=requests.current.get(data.requestId??-1);if(!request)return true;
  clearTimeout(request.timer);requests.current.delete(data.requestId!);
  const valid=Boolean(ready()&&data.location?.start?.cfi);
  if(valid)accept(data.location!,Number.isFinite(data.fraction)?data.fraction:undefined);else onError();
  request.resolve(valid);return true;
 },[accept,onError,ready]);
 useEffect(()=>()=>{for(const request of requests.current.values()){clearTimeout(request.timer);request.resolve(false);}requests.current.clear();},[]);
 return {capture,receive};
}
