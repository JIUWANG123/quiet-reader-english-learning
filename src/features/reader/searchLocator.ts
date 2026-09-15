// Shared by EPUB and TXT. Validate the quote at its indexed offset; never guess
// another repeated occurrence when a cache or book has changed.
export const searchLocator=String.raw`
window.qrSearchRange=function(doc,hit){
 var nodes=[],offsets=[],text='',walker=doc.createTreeWalker(doc.body,4),node;
 while(node=walker.nextNode()){
  if(node.parentElement.closest('script,style,rt,[data-qr-ui]'))continue;
  offsets.push(text.length);nodes.push(node);text+=node.textContent;
 }
 if(text.slice(hit.offset,hit.offset+hit.text.length)!==hit.text)throw Error('SEARCH_CHANGED');
 var from=nodes.findIndex(function(node,i){return offsets[i]+node.length>hit.offset;});
 var to=nodes.findIndex(function(node,i){return offsets[i]+node.length>=hit.offset+hit.text.length;});
 if(from<0||to<0)throw Error('SEARCH_RANGE');
 var range=doc.createRange();range.setStart(nodes[from],hit.offset-offsets[from]);range.setEnd(nodes[to],hit.offset+hit.text.length-offsets[to]);return range;
};true;`;
