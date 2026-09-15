import {useCallback,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode,Ref} from 'react';
import {StyleSheet,View} from 'react-native';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import Animated,{cancelAnimation,runOnJS,runOnUI,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import type {SharedValue} from 'react-native-reanimated';
import {pageTurnDecision} from './pageTurnDecision';

export type PageDirection=1|-1;
export type PageStackHandle={turn:(direction:PageDirection)=>boolean};
type Props={onBoundary?:(direction:PageDirection)=>void;controllerRef?:Ref<PageStackHandle>;animate?:boolean;pageIds?:Partial<Record<'previous'|'current'|'next',string>>;width?:number;height?:number;enabled?:boolean;pageKey?:string;previousReady?:boolean;nextReady?:boolean;onTurn:(direction:PageDirection)=>void;onInteraction?:(active:boolean)=>void;renderPage:(slot:'previous'|'current'|'next')=>ReactNode};

/** Only a committed page identity resets the transform. Ordinary React renders
 * (progress, marks, toolbar) must never interrupt a gesture or settle animation. */
export function NativePageStack({onBoundary,controllerRef,animate=true,pageIds,width:widthProp,height:heightProp,enabled=true,pageKey='',previousReady=false,nextReady=false,onTurn,onInteraction,renderPage}:Props){
 const [layout,setLayout]=useState({width:0,height:0});
 const width=widthProp??layout.width,height=heightProp??layout.height;
 const offset=useSharedValue(0),busy=useSharedValue(false),dragging=useSharedValue(false);
 const positions=useSharedValue<Record<string,number>>({});
 const ids={previous:pageIds?.previous??'previous',current:pageIds?.current??'current',next:pageIds?.next??'next'};
 const callbacks=useRef({onTurn,onInteraction,onBoundary});callbacks.current={onTurn,onInteraction,onBoundary};
 const notify=useCallback((active:boolean)=>callbacks.current.onInteraction?.(active),[]);
 const boundary=useCallback((direction:PageDirection)=>callbacks.current.onBoundary?.(direction),[]);
 const commit=useCallback((direction:PageDirection)=>callbacks.current.onTurn(direction),[]);
 const committedLayout=useRef({pageKey,width,height});
 useLayoutEffect(()=>{
   // Stable document keys read one shared position map. Updating slot styles in
   // React separately from resetting the UI-thread offset exposed the old offset
   // for a frame after promotion. Commit both coordinates in one UI worklet.
   const nextPositions={[ids.previous]:-width,[ids.current]:0,[ids.next]:width};
   const old=committedLayout.current;
   const reset=old.pageKey!==pageKey||old.width!==width||old.height!==height;
   committedLayout.current={pageKey,width,height};
   runOnUI((next:Record<string,number>,reset:boolean)=>{
     'worklet';positions.value=next;
     // A neighbor becoming ready must not cancel a gesture already in progress.
     if(reset){cancelAnimation(offset);offset.value=0;busy.value=false;dragging.value=false;runOnJS(notify)(false);}
   })(nextPositions,reset);
 },[pageKey,ids.previous,ids.current,ids.next,width,height,offset,positions,busy,dragging,notify]);
 // Buttons and volume keys use exactly the same commit path as a swipe.
 useImperativeHandle(controllerRef,()=>({turn(direction){
  if(busy.value||width<=0||!(direction===1?nextReady:previousReady))return false;
  busy.value=true;notify(true);
  offset.value=withTiming(-direction*width,{duration:animate?210:0},finished=>{if(finished)runOnJS(commit)(direction);});
  return true;
 }}),[width,nextReady,previousReady,animate,busy,offset,notify,commit]);
 const pan=useMemo(()=>Gesture.Pan().enabled(enabled&&width>0&&height>0)
  .maxPointers(1).activeOffsetX([-14,14]).failOffsetY([-24,24])
  .onStart(()=>{if(busy.value)return;dragging.value=true;runOnJS(notify)(true);})
  .onUpdate(event=>{
   if(!dragging.value||busy.value)return;
   const available=event.translationX<0?nextReady:previousReady;
   offset.value=available?Math.max(-width,Math.min(width,event.translationX)):event.translationX*.15;
  })
  .onEnd(event=>{
   if(!dragging.value||busy.value)return;
   dragging.value=false;busy.value=true;
   const requested=pageTurnDecision(event.translationX,event.velocityX,width,true,true);
   const direction=pageTurnDecision(event.translationX,event.velocityX,width,previousReady,nextReady);
   offset.value=withTiming(direction===0?0:-direction*width,{duration:210},finished=>{
    if(!finished)return;
    if(direction!==0){runOnJS(commit)(direction);}else{busy.value=false;runOnJS(notify)(false);if(requested!==0)runOnJS(boundary)(requested);}
   });
  })
  .onFinalize(()=>{
   // Failed vertical gestures never acquire interaction ownership. Interrupted
   // horizontal gestures return home and release their lock after the rebound.
   if(!dragging.value)return;
   dragging.value=false;busy.value=true;
   offset.value=withTiming(0,{duration:180},()=>{busy.value=false;runOnJS(notify)(false);});
  }),[enabled,width,height,previousReady,nextReady,commit,boundary,notify,offset,busy,dragging]);
 return <GestureDetector gesture={pan}><View onLayout={e=>{const {width,height}=e.nativeEvent.layout;setLayout(old=>old.width===width&&old.height===height?old:{width,height});}} style={[styles.viewport,widthProp===undefined?null:{width:widthProp},heightProp===undefined?null:{height:heightProp}]}>
  {(['previous','current','next'] as const).slice().sort((a,b)=>ids[a].localeCompare(ids[b])).map(slot=><PageSurface key={ids[slot]} id={ids[slot]} positions={positions} offset={offset} width={width} height={height} pointerEvents={slot==='current'?'auto':'none'} accessibilityElementsHidden={slot!=='current'} importantForAccessibility={slot==='current'?'auto':'no-hide-descendants'}>{renderPage(slot)}</PageSurface>)}
 </View></GestureDetector>;
}
const styles=StyleSheet.create({viewport:{flex:1,overflow:'hidden',backgroundColor:'transparent'},page:{position:'absolute',left:0,top:0,backgroundColor:'transparent'}});


function PageSurface({id,positions,offset,width,height,children,...props}:React.ComponentProps<typeof View>&{id:string;positions:SharedValue<Record<string,number>>;offset:SharedValue<number>;width:number;height:number}){
 const style=useAnimatedStyle(()=>({transform:[{translateX:(positions.value[id]??width*3)+offset.value}],zIndex:positions.value[id]===0?3:2}));
 return <Animated.View {...props} style={[styles.page,{width,height},style]}>{children}</Animated.View>;
}
