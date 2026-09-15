import {useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,View} from 'react-native';

// Capture only the visible page, never the chapter. The live WebView stays opaque
// underneath, so slow chapter layout cannot expose a white/empty animation frame.
export function usePaperTurn(enabled:boolean,background:string) {
  const viewport=useRef<View>(null);
  const alive=useRef(true),busy=useRef(false),reduced=useRef(false),width=useRef(0);
  const didTurn=useRef(false);
  const pageReady=useRef<(()=>void)|null>(null);
  useEffect(()=>{
    alive.current=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{reduced.current=value;});
    const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{reduced.current=value;});
    return()=>{alive.current=false;sub.remove();pageReady.current?.();};
  },[]);
  function wait(ref:typeof pageReady,timeout:number){return new Promise<void>(resolve=>{
    const finish=()=>{clearTimeout(timer);if(ref.current===finish)ref.current=null;resolve();};
    const timer=setTimeout(finish,timeout);ref.current=finish;
  });}
  async function turn(direction:number,navigate:()=>void){
    if(busy.current)return;
    busy.current=true;
    try {
      didTurn.current=false;
      // Navigation starts immediately. Waiting for a pre-turn screenshot was
      // the visible source of the flash and several hundred ms of latency.
      const settled=wait(pageReady,1200);navigate();await settled;
    } catch {
      // Navigation errors are reported by the reader bridge. A disappearing
      // native view must still release its temporary image and interaction lock.
    } finally {
      pageReady.current?.();
      busy.current=false;
    }
  }
  return {viewport,turn,settle:(moved=true)=>{didTurn.current=moved;pageReady.current?.();},busy,
    onLayout:(event:{nativeEvent:{layout:{width:number}}})=>{width.current=event.nativeEvent.layout.width;},
    overlay:null};
}
