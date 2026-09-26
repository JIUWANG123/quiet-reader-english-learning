import type {Location} from '@epubjs-react-native/core';
export type PreviewOrigin='cold'|'recycled'|'layout'|'retry';
export type EpubDocument={id:string;anchor:string|null;direction:-1|0|1;revision?:number;visualAnchor?:Location;location?:Location;boundary?:boolean;retries?:number;origin?:PreviewOrigin;status?:'queued'|'loading'|'ready'|'failed';mounted?:boolean;retryAt?:number;replace?:boolean};
export type EpubPool={previous:EpubDocument|null;current:EpubDocument;next:EpubDocument|null;serial:number;preferred?:-1|1;suspended?:boolean};
export function createEpubPool(anchor:string|null,serial=0):EpubPool{return{current:{id:String(serial),anchor,direction:0,origin:'cold',status:'loading',mounted:true},previous:null,next:null,serial:serial+1,preferred:1};}
const slots=['next','previous'] as const;
/** One admission point for all hidden navigation, including invalidation/retry. */
export function scheduleEpubPreview(pool:EpubPool,now=Date.now()):EpubPool{
 if(pool.suspended||!pool.current.location||slots.some(slot=>pool[slot]?.status==='loading'))return pool;
 const order=pool.preferred===-1?['previous','next'] as const:slots;
 for(const slot of order){
  const document=pool[slot];
  if(document&&(document.location||document.boundary||document.status==='failed'||(document.retryAt??0)>now))continue;
  const direction=slot==='next'?1:-1;
  let serial=pool.serial;
  const next:EpubDocument=document?{...document,status:'loading',mounted:true,retryAt:undefined}: {id:String(serial++),direction,anchor:pool.current.location.start.cfi,visualAnchor:pool.current.location,revision:0,origin:'cold',status:'loading',mounted:true};
  if(next.replace){next.id=String(serial++);next.replace=false;}
  return {...pool,serial,[slot]:next};
 }
 return pool;
}
export function readyEpubDocument(pool:EpubPool,id:string,location:Location,revision?:number):EpubPool{
 const slot=(['current','previous','next'] as const).find(key=>pool[key]?.id===id);if(!slot)return pool;
 const document=pool[slot]!;
 if(revision!==undefined&&revision!==(document.revision??0))return pool;
 if(slot!=='current'&&(document.status==='queued'||document.status==='failed'))return pool;
 return scheduleEpubPreview({...pool,[slot]:{...document,location,status:'ready',retries:0}});
}
export function boundaryEpubDocument(pool:EpubPool,id:string,revision:number):EpubPool{
 const slot=slots.find(key=>pool[key]?.id===id);if(!slot||revision!==(pool[slot]!.revision??0))return pool;
 return scheduleEpubPreview({...pool,[slot]:{...pool[slot]!,boundary:true,status:'ready'}});
}
export function failEpubPreview(pool:EpubPool,id:string,revision:number,now=Date.now()):EpubPool{
 const slot=slots.find(key=>pool[key]?.id===id);if(!slot||revision!==(pool[slot]!.revision??0))return pool;
 const document=pool[slot]!,attempt=(document.retries??0)+1;
 return scheduleEpubPreview({...pool,[slot]:{...document,location:undefined,boundary:false,revision:revision+1,retries:attempt,origin:'retry',status:attempt>2?'failed':'queued',retryAt:now+(attempt===1?500:1500),replace:true,mounted:false}},now);
}
export function prioritizeEpubPreview(pool:EpubPool,direction:-1|1):EpubPool{
 // User intent changes queue order, never starts a second navigation or removes backoff.
 return scheduleEpubPreview({...pool,preferred:direction});
}
/** Retain IDs/native instances during ordinary rotations. Only far document navigates. */
export function turnEpubPool(pool:EpubPool,direction:-1|1):EpubPool{
 const target=direction===1?pool.next:pool.previous;
 if(!target?.location||target.boundary||pool.suspended)return pool;
 const far=direction===1?pool.previous:pool.next;
 const recycled:EpubDocument|null=far?{id:far.id,anchor:target.location.start.cfi,visualAnchor:target.location,direction,revision:(far.revision??0)+1,origin:far.mounted?'recycled':'cold',status:'queued',mounted:far.status==='loading'?false:far.mounted,replace:far.status==='loading'}:null;
 return scheduleEpubPreview({...pool,current:{...target,status:'ready'},previous:direction===1?pool.current:recycled,next:direction===-1?pool.current:recycled,preferred:direction});
}
export function invalidateEpubNeighbors(pool:EpubPool):EpubPool{
 const reset=(document:EpubDocument|null,direction:-1|1):EpubDocument|null=>document?{
  id:document.id,anchor:pool.current.location?.start.cfi??pool.current.anchor,visualAnchor:pool.current.location,direction,
  revision:(document.revision??0)+1,origin:'layout',status:'queued',mounted:document.status==='loading'?false:document.mounted,replace:document.status==='loading'
 }:null;
 return {...pool,previous:reset(pool.previous,-1),next:reset(pool.next,1)};
}
export function suspendEpubPreviews(pool:EpubPool):EpubPool{return {...pool,previous:null,next:null,suspended:true,preferred:1};}
export function resumeEpubPreviews(pool:EpubPool):EpubPool{return scheduleEpubPreview({...pool,suspended:false,preferred:1});}
