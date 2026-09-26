import {useEffect,useRef,useImperativeHandle,useMemo,type Ref} from 'react';
import {Reader,ReaderProvider,useReader,type ReaderProps} from '@epubjs-react-native/core';
import {useEpubFileSystem} from './useEpubFileSystem';
import {locationCache} from './epubLocationCache';

export type EpubPageController=ReturnType<typeof useReader>;
type Props=Omit<ReaderProps,'fileSystem'> & {runtimeId:string;startupAnchor?:string|null;generateLocations?:boolean;navigationRevision?:number;navigationJavascript?:string;controllerRef:Ref<EpubPageController>};

/** Providers follow document identity, not visual slot. Promoting a prepared
 * page keeps its WebView and selection/CFI state instead of mounting a reader. */
export function IsolatedEpubPage(props:Props){
  return <ReaderProvider><Page {...props}/></ReaderProvider>;
}
function Page({runtimeId,startupAnchor,generateLocations=true,navigationRevision=0,navigationJavascript,controllerRef,...props}:Props){
  const controller=useReader();
  const cache=useMemo(()=>locationCache(props.src,props.charactersPerLocation??1600),[props.src,props.charactersPerLocation]);
  // Keep this snapshot stable: changing initialLocations reloads upstream Reader.
  // Its template interpolates a JSON literal despite declaring an array type.
  const cachedLocations=useMemo(()=>cache.read(),[cache]);
  const initialized=useRef(false),appliedRevision=useRef(navigationRevision);
  const pendingNavigation=useRef({revision:navigationRevision,script:navigationJavascript??props.injectedJavascript});
  pendingNavigation.current={revision:navigationRevision,script:navigationJavascript??props.injectedJavascript};
  function applyPendingNavigation(){
    const pending=pendingNavigation.current;
    if(!initialized.current||appliedRevision.current===pending.revision||!pending.script)return;
    controller.injectJavascript(pending.script);appliedRevision.current=pending.revision;
  }
  useImperativeHandle(controllerRef,()=>controller,[controller]);
  const startup=useRef({anchor:startupAnchor,generateLocations});
  const fileSystem=useMemo(()=>function usePageFileSystem(){return useEpubFileSystem(runtimeId,startup.current);},[runtimeId]);
  useEffect(()=>{
    applyPendingNavigation();
  },[navigationRevision,controller,navigationJavascript,props.injectedJavascript]);
  return <Reader {...props} initialLocations={cachedLocations as unknown as ReaderProps['initialLocations']} fileSystem={fileSystem} onLocationsReady={(key,locations)=>{
    cache.write(locations);props.onLocationsReady?.(key,locations);
  }} onReady={(...args)=>{
    // Upstream injects the initial script before this callback. Only subsequent
    // assignments need an explicit navigation, never a new template or WebView.
    // A cold/replacement document can be reassigned before onReady. Drain
    // that assignment rather than falsely acknowledging a script never sent.
    initialized.current=true;applyPendingNavigation();props.onReady?.(...args);
  }}/>;
}
