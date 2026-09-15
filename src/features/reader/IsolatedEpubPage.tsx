import {useEffect,useRef,useImperativeHandle,useMemo,type Ref} from 'react';
import {Reader,ReaderProvider,useReader,type ReaderProps} from '@epubjs-react-native/core';
import {useEpubFileSystem} from './useEpubFileSystem';
import {locationCache} from './epubLocationCache';

export type EpubPageController=ReturnType<typeof useReader>;
type Props=Omit<ReaderProps,'fileSystem'> & {runtimeId:string;startupAnchor?:string|null;generateLocations?:boolean;navigationRevision?:number;controllerRef:Ref<EpubPageController>};

/** Providers follow document identity, not visual slot. Promoting a prepared
 * page keeps its WebView and selection/CFI state instead of mounting a reader. */
export function IsolatedEpubPage(props:Props){
  return <ReaderProvider><Page {...props}/></ReaderProvider>;
}
function Page({runtimeId,startupAnchor,generateLocations=true,navigationRevision=0,controllerRef,...props}:Props){
  const controller=useReader();
  const cache=useMemo(()=>locationCache(props.src,props.charactersPerLocation??1600),[props.src,props.charactersPerLocation]);
  // Keep this snapshot stable: changing initialLocations reloads upstream Reader.
  // Its template interpolates a JSON literal despite declaring an array type.
  const cachedLocations=useMemo(()=>cache.read(),[cache]);
  const initialized=useRef(false),appliedRevision=useRef(navigationRevision);
  useImperativeHandle(controllerRef,()=>controller,[controller]);
  const startup=useRef({anchor:startupAnchor,generateLocations});
  const fileSystem=useMemo(()=>function usePageFileSystem(){return useEpubFileSystem(runtimeId,startup.current);},[runtimeId]);
  useEffect(()=>{
    if(!initialized.current||appliedRevision.current===navigationRevision)return;
    appliedRevision.current=navigationRevision;
    if(props.injectedJavascript)controller.injectJavascript(props.injectedJavascript);
  },[navigationRevision,controller,props.injectedJavascript]);
  return <Reader {...props} initialLocations={cachedLocations as unknown as ReaderProps['initialLocations']} fileSystem={fileSystem} onLocationsReady={(key,locations)=>{
    cache.write(locations);props.onLocationsReady?.(key,locations);
  }} onReady={(...args)=>{
    // Upstream injects the initial script before this callback. Only subsequent
    // assignments need an explicit navigation, never a new template or WebView.
    initialized.current=true;appliedRevision.current=navigationRevision;props.onReady?.(...args);
  }}/>;
}
