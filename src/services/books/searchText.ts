import {parseDocument,DomUtils} from 'htmlparser2';

// Same body/text-node ordering as the reader locator. UI and executable content
// never enter the original-text index. Offsets are UTF-16, matching DOM Range.
export function epubSearchText(html:string){
 const document=parseDocument(html,{xmlMode:true,decodeEntities:true});
 const body=DomUtils.findOne(node=>node.name==='body',document.children,true);
 if(!body)return '';
 function text(node:any):string{
  if(node.type==='text')return node.data;
  if(['script','style','rt'].includes(node.name))return '';
  return (node.children??[]).map(text).join('');
 }
 return text(body);
}
export function searchMatches(text:string,query:string,whole:boolean,limit=1000){
 if(!query)return [];
 const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const regex=new RegExp(escaped,'giu'),matches:{offset:number;text:string}[]=[];
 const word=(character:string|undefined)=>Boolean(character&&/[\p{L}\p{N}_’'-]/u.test(character));
 for(const match of text.matchAll(regex)){
  const offset=match.index!;
  if(whole&&(word(text[offset-1])||word(text[offset+match[0].length])))continue;
  matches.push({offset,text:match[0]});
  if(matches.length>=limit)break;
 }
 return matches;
}
