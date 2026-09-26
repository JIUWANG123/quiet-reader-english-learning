import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Reader } from '@epubjs-react-native/core';
import { useEpubFileSystem } from './useEpubFileSystem';
import { locationCache } from './epubLocationCache';
import { currentEpubWarmup, finishEpubWarmup, subscribeEpubWarmup } from '../../services/books/warmup';
export function EpubWarmupHost(){
 const [request,setRequest]=useState(currentEpubWarmup());
 useEffect(()=>{ const unsubscribe=subscribeEpubWarmup(()=>setRequest(currentEpubWarmup())); return ()=>{ unsubscribe(); }; },[]);
 if(!request)return null;
 return <View pointerEvents="none" style={{position:'absolute',left:-2,top:-2,width:1,height:1,opacity:0.01}}><WarmupReader bookId={request.bookId} source={request.source}/></View>;
}
function WarmupReader({bookId,source}:{bookId:string;source:string}){
 const fs=useEpubFileSystem('warmup-'+bookId.replace(/[^a-zA-Z0-9_-]/g,'_'),{generateLocations:true});
 const cache=useMemo(()=>locationCache(source,1600),[source]);
 const initial=useMemo(()=>cache.read(),[cache]);
 return <Reader src={source} fileSystem={()=>fs} width={1} height={1} initialLocations={initial as any} onLocationsReady={(_,locations)=>{cache.write(locations);finishEpubWarmup(bookId);}} onDisplayError={()=>finishEpubWarmup(bookId)} />;
}
