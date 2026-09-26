import JSZip from 'jszip';
import {Directory,File,Paths} from 'expo-file-system';
import {traceReading} from './diagnostics';

const pending=new Map<string,Promise<string>>();
// Keep OPF/spine order and XHTML untouched so CFI notes and bookmarks remain valid.
// epub.js natively opens OPF files; all three views then read only needed resources.
export function prepareEpubResources(source:string):Promise<string>{
 const active=pending.get(source);if(active)return active;
 const job=prepare(source).finally(()=>pending.delete(source));pending.set(source,job);return job;
}
function safeParts(path:string){
 if(/%2e|%2f|%5c/i.test(path))throw Error('Encoded EPUB traversal path');
 if(!path||path.includes('\\')||path.startsWith('/')||/[\x00-\x1f:]/.test(path))throw Error('Invalid EPUB resource path');
 const parts=path.split('/');if(parts.some(p=>!p||p==='.'||p==='..'))throw Error('Invalid EPUB resource path');return parts;
}
async function prepare(source:string){
 const startedAt=Date.now();
 const archive=new File(source);
 const root=new Directory(Paths.cache,'epub-resources',encodeURIComponent(archive.name));
 const fingerprint=JSON.stringify([archive.size,archive.modificationTime,2]);
 const marker=new File(root,'ready.json');
 try{if(marker.exists){const saved=JSON.parse(await marker.text());const opf=new File(root,...safeParts(saved.opf));if(saved.fingerprint===fingerprint&&opf.exists&&Array.isArray(saved.files)&&saved.files.length&&saved.files.every((entry:{path:string;size:number})=>{const file=new File(root,...safeParts(entry.path));return file.exists&&file.size===entry.size;})){
   traceReading('resource-prepare',{cacheHit:true,archiveSize:archive.size,extractedSize:saved.files.reduce((sum:number,entry:{size:number})=>sum+entry.size,0),duration:Date.now()-startedAt});
   return opf.uri;
  }}}catch{/* An interrupted cache is rebuilt from the original archive. */}
 root.create({intermediates:true,idempotent:true});
 const unzipStartedAt=Date.now();
 const zip=await JSZip.loadAsync(await archive.arrayBuffer());
 const container=await zip.file('META-INF/container.xml')?.async('string');
 const opfPath=container?.match(/<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g,'&');
 if(!opfPath||!zip.file(opfPath))throw Error('EPUB 缺少有效目录');
 safeParts(opfPath);
 const files:{path:string;size:number}[]=[];
 let total=0;
 for(const entry of Object.values(zip.files)){
  if(entry.dir)continue;
  // JSZip sanitizes traversal; reject the original unsafe name as well.
  const original=(entry as typeof entry & {unsafeOriginalName?:string}).unsafeOriginalName;
  if(original)safeParts(original);
  const parts=safeParts(entry.name),data=await entry.async('uint8array');
  total+=data.byteLength;if(total>768*1024*1024)throw Error('EPUB 解压内容过大');
  const parent=new Directory(root,...parts.slice(0,-1));parent.create({intermediates:true,idempotent:true});
  new File(parent,parts[parts.length-1]).write(data);
  files.push({path:entry.name,size:data.byteLength});
 }
 // Commit last: a killed app cannot mistake a partial extraction for a cache hit.
 marker.write(JSON.stringify({fingerprint,opf:opfPath,files}));
 traceReading('resource-prepare',{cacheHit:false,archiveSize:archive.size,extractedSize:total,unzipDuration:Date.now()-unzipStartedAt,duration:Date.now()-startedAt});
 return new File(root,...safeParts(opfPath)).uri;
}
