import type {Location} from '@epubjs-react-native/core';
export type EpubDocument={id:string;anchor:string|null;direction:-1|0|1;revision?:number;visualAnchor?:Location;location?:Location;boundary?:boolean};
export type EpubPool={previous:EpubDocument|null;current:EpubDocument;next:EpubDocument|null;serial:number};
export function createEpubPool(anchor:string|null,serial=0):EpubPool{return{current:{id:String(serial),anchor,direction:0},previous:null,next:null,serial:serial+1};}
function neighbors(pool:EpubPool):EpubPool{
 const location=pool.current.location;if(!location)return pool;
 const next={...pool};
 // Probe actual navigation; an unchanged CFI is reported as a boundary.
 if(!next.previous)next.previous={id:String(next.serial++),anchor:location.start.cfi,visualAnchor:location,direction:-1};
 if(!next.next)next.next={id:String(next.serial++),anchor:location.start.cfi,visualAnchor:location,direction:1};
 return next;
}
export function readyEpubDocument(pool:EpubPool,id:string,location:Location):EpubPool{
 const slot=(['current','previous','next'] as const).find(key=>pool[key]?.id===id);if(!slot)return pool;
 const next={...pool,[slot]:{...pool[slot]!,location}};
 return slot==='current'?neighbors(next):next;
}
/** Only a rendered neighbor may become current. Keeping its id retains both
 * native WebView and epub.js rendition across the React slot rotation. */
export function turnEpubPool(pool:EpubPool,direction:-1|1):EpubPool{
 const target=direction===1?pool.next:pool.previous;
 if(!target?.location||target.boundary)return pool;
 // Recycle the farthest document, retaining its native WebView and loaded book.
 // Clear its old location before moving it; revision rejects stale ready events.
 const far=direction===1?pool.previous:pool.next;
 const recycled=far?{id:far.id,anchor:target.location.start.cfi,visualAnchor:target.location,direction,revision:(far.revision??0)+1}:null;
 return neighbors({...pool,current:target,previous:direction===1?pool.current:recycled,next:direction===-1?pool.current:recycled});
}

/** Layout edits preserve the visible document but invalidate both old page edges.
 * A later measured location will prepare neighbors with a fresh revision. */
export function invalidateEpubNeighbors(pool:EpubPool):EpubPool{
 const reset=(document:EpubDocument|null,direction:-1|1):EpubDocument|null=>document?{
   id:document.id,anchor:pool.current.location?.start.cfi??pool.current.anchor,
   visualAnchor:pool.current.location,direction,revision:(document.revision??0)+1
 }:null;
 return {...pool,previous:reset(pool.previous,-1),next:reset(pool.next,1)};
}
