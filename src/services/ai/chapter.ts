export function chapterPassages(text:string,limit=1200){
 const chunks:string[]=[];
 for(const paragraph of text.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean)){
  let remaining=paragraph;
  while(remaining.length>limit){let end=remaining.lastIndexOf(' ',limit);if(end<limit/2)end=limit;if(/[\uD800-\uDBFF]/.test(remaining[end-1]))end--;chunks.push(remaining.slice(0,end).trim());remaining=remaining.slice(end).trim();}
  if(remaining)chunks.push(remaining);
 }
 return chunks;
}
