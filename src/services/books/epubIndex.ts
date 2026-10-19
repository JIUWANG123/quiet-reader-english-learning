import JSZip from 'jszip';
import {parseDocument,DomUtils} from 'htmlparser2';
import type {Element} from 'domhandler';
import {countWordOccurrences,mergeWordOccurrences} from './wordFrequency';

export type EpubChapter={index:number;href:string;title:string;size:number};
export type EpubIndex={version:1;createdAt:number;chapters:EpubChapter[];wordFrequency:Record<string,number>};

function elements(document:ReturnType<typeof parseDocument>,name:string):Element[]{
 return DomUtils.findAll(node=>node.type==='tag'&&node.name.toLowerCase().split(':').pop()===name,document.children);
}
function normalizePath(value:string){
 const parts:string[]=[];
 for(const part of value.split('/')){
  if(!part||part==='.')continue;
  if(part==='..'){parts.pop();continue;}
  parts.push(part);
 }
 return parts.join('/');
}
function decodeHref(value:string){
 try{return decodeURIComponent(value);}catch{return value;}
}
function resolveHref(href:string,base:string){
 const path=href.split(/[?#]/,1)[0];
 return normalizePath(base+decodeHref(path));
}
function plainText(markup:string){
 return markup.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]*>/g,' ').replace(/&[a-zA-Z#][a-zA-Z0-9]*;/g,' ');
}
function archiveOrder(names:string[]){
 return names.filter(name=>/\.x?html?$/i.test(name))
  .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
}

type EpubArchive={arrayBuffer:()=>Promise<ArrayBuffer>};
type EpubCacheFile={write:(value:string)=>void};
export async function buildEpubIndex(file:EpubArchive,cacheDir?:{file:(name:string)=>EpubCacheFile}):Promise<EpubIndex>{
 const zip=await JSZip.loadAsync(await file.arrayBuffer());
 const names=Object.keys(zip.files).filter(name=>!zip.files[name].dir);
 const exact=new Map(names.map(name=>[name,zip.files[name]]));
 const folded=new Map<string,string>();
 for(const name of names)if(!folded.has(name.toLowerCase()))folded.set(name.toLowerCase(),name);
 const read=async(name:string)=>{
  const actual=exact.has(name)?name:folded.get(name.toLowerCase());
  if(!actual)return undefined;
  try{return await zip.files[actual].async('string');}catch{return undefined;}
 };

 const container=await read('META-INF/container.xml');
 if(!container)throw Error('EPUB 缺少 container.xml');
 const rootDocument=parseDocument(container,{xmlMode:true,decodeEntities:true});
 const rootPath=elements(rootDocument,'rootfile')[0]?.attribs['full-path'];
 if(!rootPath)throw Error('EPUB 目录结构无效');
 const opfPath=normalizePath(decodeHref(rootPath));
 const opf=await read(opfPath);
 if(!opf)throw Error('EPUB 缺少 OPF');
 const slash=opfPath.lastIndexOf('/');
 const base=slash<0?'':opfPath.slice(0,slash+1);
 const document=parseDocument(opf,{xmlMode:true,decodeEntities:true});

 // OPF is XML: manifest attributes are identified by name, never by position.
 const manifest=new Map<string,{href:string;mediaType:string;properties:string}>();
 for(const item of elements(document,'item')){
  const id=item.attribs.id,href=item.attribs.href;
  if(id&&href)manifest.set(id,{href:resolveHref(href,base),mediaType:item.attribs['media-type']??'',properties:item.attribs.properties??''});
 }
 const spine=elements(document,'spine')[0];
 const isContent=(item:{href:string;mediaType:string})=>item.mediaType
  ? /(?:application\/xhtml\+xml|text\/html)/i.test(item.mediaType)
  : /\.x?html?$/i.test(item.href);
 const content=[...manifest.values()].filter(item=>!item.properties.split(/\s+/).includes('nav')&&isContent(item));
 const spineOrder=elements(document,'itemref')
  .filter(item=>!/^no$/i.test((item.attribs.linear??'').trim()))
  .map(item=>manifest.get(item.attribs.idref)?.href)
  .filter((href):href is string=>Boolean(href));
 const resolveEntries=(order:string[])=>{
  const seen=new Set<string>(),result:string[]=[];
  for(const href of order){
   const actual=exact.has(href)?href:folded.get(href.toLowerCase());
   if(actual&&!seen.has(actual)){seen.add(actual);result.push(actual);}
  }
  return result;
 };

 let order=resolveEntries(spineOrder);
 const dirname=(path:string)=>{const index=path.lastIndexOf('/');return index<0?'':path.slice(0,index+1);};
 const tocRef=spine?.attribs.toc;
 const tocHref=tocRef?(manifest.get(tocRef)?.href??resolveHref(tocRef,base)):undefined;
 if(!order.length&&tocHref){
  const ncx=await read(tocHref);
  if(ncx){
   const ncxDocument=parseDocument(ncx,{xmlMode:true,decodeEntities:true});
   const hrefs=elements(ncxDocument,'content').map(item=>item.attribs.src).filter((href):href is string=>Boolean(href)).map(href=>resolveHref(href,dirname(tocHref)));
   order=resolveEntries(hrefs);
  }
 }
 const navItem=[...manifest.values()].find(item=>item.properties.split(/\s+/).includes('nav'));
 if(!order.length&&navItem){
  const nav=await read(navItem.href);
  if(nav){
   const navDocument=parseDocument(nav,{xmlMode:true,decodeEntities:true});
   const hrefs=elements(navDocument,'a').map(item=>item.attribs.href).filter((href):href is string=>Boolean(href)&&/\.x?html?(?:[?#].*)?$/i.test(href)).map(href=>resolveHref(href,dirname(navItem.href)));
   order=resolveEntries(hrefs);
  }
 }
 // Some publishers ship a damaged or empty spine. Keep import usable by falling
 // back to the manifest order, then to packaged XHTML names as a last resort.
 if(!order.length)order=resolveEntries(content.map(item=>item.href));
 if(!order.length)order=resolveEntries(archiveOrder(names));

 const chapters:EpubChapter[]=[],wordFrequency:Record<string,number>={};
 for(const href of order){
  const body=await read(href);
  if(!body?.trim())continue;
  const words=countWordOccurrences(plainText(body));
  mergeWordOccurrences(wordFrequency,words);
  const index=chapters.length;
  if(cacheDir)cacheDir.file(`${index}.xhtml`).write(body);
  chapters.push({index,href,title:`第 ${index+1} 章`,size:body.length});
  if(chapters.length%8===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 if(!chapters.length)throw Error('EPUB 没有可阅读章节');
 return {version:1,createdAt:Date.now(),chapters,wordFrequency};
}
