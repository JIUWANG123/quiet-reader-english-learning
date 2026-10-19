// Shared by EPUB and TXT. Validate the quote at its indexed offset; never guess
// another repeated occurrence when a cache or book has changed.
export const searchLocator=String.raw`
window.qrSearchRange=function(doc,hit){
 var nodes=[],offsets=[],text='',walker=doc.createTreeWalker(doc.body,4),node;
 while(node=walker.nextNode()){
  if(node.parentElement.closest('script,style,rt,[data-qr-ui]'))continue;
  offsets.push(text.length);nodes.push(node);text+=node.textContent;
 }
 if(typeof hit.text!=='string'||!hit.text)throw Error('SEARCH_CHANGED');
 if(text.slice(hit.offset,hit.offset+hit.text.length)!==hit.text){
  // The search index is built from XHTML text; epub.js may expose slightly
  // different whitespace/entity offsets in the live document. Keep the saved
  // quote and context, and choose the nearest matching occurrence instead of
  // failing the whole jump.
  var candidates=[],at=-1;
  while((at=text.indexOf(hit.text,at+1))>=0)candidates.push(at);
  if(!candidates.length)throw Error('SEARCH_CHANGED');
  var chosen=candidates[0],before=String(hit.before||''),after=String(hit.after||'');
  if(candidates.length>1){
   var best=-Infinity;
   candidates.forEach(function(candidate){
    var left=text.slice(Math.max(0,candidate-before.length),candidate);
    var right=text.slice(candidate+hit.text.length,candidate+hit.text.length+after.length);
    var score=0,bestLeft=0,bestRight=0;
    for(var n=Math.min(left.length,before.length);n>0;n--)if(left.slice(-n)===before.slice(-n)){bestLeft=n;break;}
    for(var n=Math.min(right.length,after.length);n>0;n--)if(right.slice(0,n)===after.slice(0,n)){bestRight=n;break;}
    score=bestLeft+bestRight-Math.min(1000,Math.abs(candidate-hit.offset))/1000;
    if(score>best){best=score;chosen=candidate;}
   });
  }
  hit={offset:chosen,text:hit.text};
 }
 var from=nodes.findIndex(function(node,i){return offsets[i]+node.length>hit.offset;});
 var to=nodes.findIndex(function(node,i){return offsets[i]+node.length>=hit.offset+hit.text.length;});
 if(from<0||to<0)throw Error('SEARCH_RANGE');
 var range=doc.createRange();range.setStart(nodes[from],hit.offset-offsets[from]);range.setEnd(nodes[to],hit.offset+hit.text.length-offsets[to]);return range;
};true;`;
