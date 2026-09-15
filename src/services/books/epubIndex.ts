import JSZip from 'jszip';
import type {File} from 'expo-file-system';

export type EpubChapter={index:number;href:string;title:string;size:number};
export type EpubIndex={version:1;createdAt:number;chapters:EpubChapter[]};
// Read only EPUB metadata at import time; the original archive remains the reader fallback.
export async function buildEpubIndex(file:File, cacheDir?:{file:(name:string)=>File}):Promise<EpubIndex>{
 const zip=await JSZip.loadAsync(await file.arrayBuffer());
 const container=await zip.file('META-INF/container.xml')?.async('string');
 if(!container)throw Error('EPUB 缺少 container.xml');
 const root=container.match(/rootfile[^>]+full-path=["']([^"']+)["']/i)?.[1];
 if(!root)throw Error('EPUB 目录结构无效');
 const opf=await zip.file(root)?.async('string');if(!opf)throw Error('EPUB 缺少 OPF');
 const base=root.includes('/')?root.slice(0,root.lastIndexOf('/')+1):'';
 const items=new Map<string,{href:string;title:string;size:number}>();
 for(const m of opf.matchAll(/<item\b[^>]*id=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi)){const fileName=decodeURIComponent(base+m[2]);items.set(m[1],{href:fileName,title:'',size:0});}
 const chapters:EpubChapter[]=[];for(const m of opf.matchAll(/<itemref\b[^>]*idref=["']([^"']+)["'][^>]*>/gi)){const item=items.get(m[1]);if(item){if(cacheDir){const body=await zip.file(item.href)?.async('string');if(body)cacheDir.file(`${chapters.length}.xhtml`).write(body);}chapters.push({index:chapters.length,href:item.href,title:item.title||`第 ${chapters.length+1} 章`,size:item.size});}}
 if(!chapters.length)throw Error('EPUB 没有可阅读章节');
 return {version:1,createdAt:Date.now(),chapters};
}

