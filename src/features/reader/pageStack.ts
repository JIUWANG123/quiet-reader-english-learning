import type {BookPage} from '../../types';

export type PageStack = {previous:BookPage|null;current:BookPage|null;next:BookPage|null};
export function makePageStack(rows:BookPage[],index:number):PageStack {
  const by=new Map(rows.map(row=>[row.page_index,row]));
  return {previous:by.get(index-1)??null,current:by.get(index)??null,next:by.get(index+1)??null};
}
export function rotatePageStack(stack:PageStack,direction:1|-1,loaded:BookPage|null):PageStack {
  return direction===1?{previous:stack.current,current:stack.next,next:loaded}:{previous:loaded,current:stack.previous,next:stack.current};
}
export type PageSlot='previous'|'current'|'next';
/** Which surfaces to mount for a slot-to-document id map.
 * Two slots sharing one document must mount a single surface: at boot every slot
 * resolves to the same page, and duplicate React keys break child identity.
 * The current slot always wins a shared id, otherwise the visible page would not
 * render at all. Ordering by the rendered key keeps surfaces stable across rotation. */
export function pageSlotsFor(ids:Record<PageSlot,string>):PageSlot[]{
 const claimed=new Map<string,PageSlot>();
 for(const slot of ['current','previous','next'] as const){
  if(!claimed.has(ids[slot]))claimed.set(ids[slot],slot);
 }
 const key=(slot:PageSlot)=>slot+':'+ids[slot];
 return [...claimed.values()].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
}
