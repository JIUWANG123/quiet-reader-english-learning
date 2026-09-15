import type {BookPage} from '../../types';

export type PageStack = {previous:BookPage|null;current:BookPage|null;next:BookPage|null};
export function makePageStack(rows:BookPage[],index:number):PageStack {
  const by=new Map(rows.map(row=>[row.page_index,row]));
  return {previous:by.get(index-1)??null,current:by.get(index)??null,next:by.get(index+1)??null};
}
export function rotatePageStack(stack:PageStack,direction:1|-1,loaded:BookPage|null):PageStack {
  return direction===1?{previous:stack.current,current:stack.next,next:loaded}:{previous:loaded,current:stack.previous,next:stack.current};
}
