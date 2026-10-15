import JSZip from 'jszip';
import type {File} from 'expo-file-system';
import {parseDocument,DomUtils} from 'htmlparser2';
import type {Element} from 'domhandler';
import {countWordOccurrences,mergeWordOccurrences} from './wordFrequency';
export type EpubChapter={index:number;href:string;title:string;size:number};
export type EpubIndex={version:1;createdAt:number;chapters:EpubChapter[];wordFrequency:Record<string,number>};

// This index feeds word frequency and adjacent-chapter warmup only; the reader
// renders through epub.js. An unusual OPF therefore degrades the learning
// extras, it must never reject an otherwise readable book.

type ZipEntry={name:string;text():Promise<string>};
type ZipReader={names:string[];read:(name:string)=>ZipEntry|undefined};
type ManifestItem={href:string;mediaType:string;properties:string};

function normalizePath(value:string):string{
 const out:string[]=[];
 for(const part of value.split('/')){
  if(!part||part==='.')continue;
  if(part==='..'){out.pop();continue;}
  out.push(part);
 }
 return out.join('/');
}
// hrefs are IRIs: %20 and &amp; both appear in real books.
function decodePath(value:string):string{
 try{return decodeURIComponent(value);}catch{return value;}
}
function resolveHref(href:string,base:string):string{
 return normalizePath(base+decodePath(href.split('#')[0]));
}
function isContentDocument(item:ManifestItem):boolean{
 // A nav or NCX entry also declares an XML media type, so it must not pass.
 if(/dtbncx|opf-package|oebps-package/i.test(item.mediaType))return false;
 if(item.mediaType)return /xhtml\+xml|text\/html/i.test(item.mediaType);
 return /\.x?html?$/i.test(item.href);
}
function plainText(markup:string):string{
 return markup
  .replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]*>/g,' ')
  .replace(/&[a-zA-Z#][a-zA-Z0-9]*;/g,' ');
}
// Some archives ship META-INF/Container.xml or disagree with their own href case.
function createReader(zip:JSZip):ZipReader{
 const exact=new Map<string,JSZip.JSZipObject>(),folded=new Map<string,JSZip.JSZipObject>();
 for(const name of Object.keys(zip.files)){
  const entry=zip.files[name];
  if(entry.dir)continue;
  if(!exact.has(name))exact.set(name,entry);
  const key=name.toLowerCase();
  if(!folded.has(key))folded.set(key,entry);
 }
 return {
  names:[...exact.keys()],
  read(name){
   const entry=exact.get(name)??folded.get(name.toLowerCase());
   return entry?{name:entry.name,text:()=>entry.async('string')}:undefined;
  },
 };
}
async function readText(reader:ZipReader,name:string):Promise<string|undefined>{
 try{return await reader.read(name)?.text();}catch{return undefined;}
}
function elements(document:ReturnType<typeof parseDocument>,name:string):Element[]{
 return DomUtils.findAll(node=>node.name.toLowerCase()===name,document.children);
}
// Last resort: every XHTML in the archive, in natural filename order so
// Section0002 precedes Section0010. Only used when the OPF yields no order.
function archiveOrder(reader:ZipReader):string[]{
 return reader.names
  .filter(name=>/\.x?html?$/i.test(name))
  .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
}

export async function buildEpubIndex(file:File, cacheDir?:{file:(name:string)=>File}):Promise<EpubIndex>{
 const unzipStart=Date.now();
 const zip=await JSZip.loadAsync(await file.arrayBuffer());
 console.log(`[qr-index] unzip ${Date.now()-unzipStart}ms`);
 const reader=createReader(zip);
 const container=await readText(reader,'META-INF/container.xml');
 if(!container)throw Error('EPUB 缺少 container.xml');
 const rootMatch=container.match(/<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i);
 if(!rootMatch)throw Error('EPUB 目录结构无效');
 const root=normalizePath(decodePath(rootMatch[1].replace(/&amp;/g,'&')));
 const opf=await readText(reader,root);
 if(!opf)throw Error('EPUB 缺少 OPF');
 const slash=root.lastIndexOf('/');
 const base=slash<0?'':root.slice(0,slash+1);
 const document=parseDocument(opf,{xmlMode:true,decodeEntities:true});
 // Attribute order carries no meaning in XML, so read each <item> by name.
 const items=new Map<string,ManifestItem>();
 for(const node of elements(document,'item')){
  const id=node.attribs.id,href=node.attribs.href;
  if(!id||!href)continue;
  items.set(id,{href:resolveHref(href,base),mediaType:node.attribs['media-type']??'',properties:node.attribs.properties??''});
 }
 const contentDocuments=[...items.values()].filter(isContentDocument);
 const navItem=[...items.values()].find(item=>/\bnav\b/.test(item.properties));
 const spine=elements(document,'spine')[0];
 // EPUB 2 names the NCX by item id; EPUB 3 may point straight at the file.
 const tocRef=spine?.attribs.toc;
 const tocTarget=tocRef?(items.get(tocRef)?.href??resolveHref(tocRef,base)):'';
 // linear="no" items are supplemental; they must not join the reading order.
 const spineOrder=elements(document,'itemref')
  .filter(node=>!/^no$/i.test((node.attribs.linear??'').trim()))
  .map(node=>items.get(node.attribs.idref)?.href)
  .filter((href):href is string=>Boolean(href));
 const resolve=(order:string[]):string[]=>{
  const seen=new Set<string>(),resolved:string[]=[];
  for(const name of order){
   const entry=reader.read(name);
   if(!entry||seen.has(entry.name))continue;
   seen.add(entry.name);resolved.push(entry.name);
  }
  return resolved;
 };
 let order=resolve(spineOrder);
 if(!order.length&&tocTarget){
  const ncx=await readText(reader,tocTarget);
  if(ncx)order=resolve([...ncx.matchAll(/<content\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(match=>resolveHref(match[1],base)));
 }
 if(!order.length&&navItem){
  const nav=await readText(reader,navItem.href);
  if(nav)order=resolve([...nav.matchAll(/href\s*=\s*["']([^"']+\.x?html?[^"']*)["']/gi)].map(match=>resolveHref(match[1],base)));
 }
 // A book with no usable spine is still readable; fall back to manifest order.
 if(!order.length)order=resolve(contentDocuments.map(item=>item.href));
 if(!order.length)order=resolve(archiveOrder(reader));
 const chapters:EpubChapter[]=[],wordFrequency:Record<string,number>={};
 // A stall inside this loop was invisible until these numbers existed. Keep them.
 let readMs=0,countMs=0,writeMs=0;
 for(const href of order){
  let at=Date.now();
  const body=await readText(reader,href);
  readMs+=Date.now()-at;
  // Never advertise a chapter the reader cannot open.
  if(!body?.trim())continue;
  const index=chapters.length;
  at=Date.now();
  const words=countWordOccurrences(plainText(body));
  countMs+=Date.now()-at;
  at=Date.now();
  mergeWordOccurrences(wordFrequency,words);
  if(cacheDir)cacheDir.file(String(index)+'.xhtml').write(body);
  writeMs+=Date.now()-at;
  chapters.push({index,href,title:'第 '+(index+1)+' 章',size:body.length});
  // Yielding keeps the picker spinner alive instead of freezing the whole UI.
  if(chapters.length%8===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 console.log(`[qr-index] chapters=${chapters.length} inflate=${readMs}ms words=${countMs}ms write=${writeMs}ms`);
 if(!chapters.length)throw Error('EPUB 没有可阅读章节');
 return {version:1,createdAt:Date.now(),chapters,wordFrequency};
}
