import {Directory,File,Paths} from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import {RuntimeRegistry} from './epubRuntimeCore';

const registry=new RuntimeRegistry();
const base=()=>new Directory(Paths.cache,'epub-pages');
const marker=(folder:Directory)=>new File(folder,'.runtime-token');
export function activateEpubRuntime(namespace:string){
 if(!/^[a-zA-Z0-9_-]+$/.test(namespace))throw Error('Invalid reader runtime namespace');
 const token=Crypto.randomUUID(),folder=new Directory(base(),namespace);
 folder.create({intermediates:true,idempotent:true});marker(folder).write(token);
 registry.activate(namespace,token);return{folder,token};
}
export function retireEpubRuntime(namespace:string,token:string){registry.retire(namespace,token);}
export function cleanupStaleEpubRuntimes(){
 try{const root=base();if(!root.exists)return;
  for(const item of root.list()){
   if(!(item instanceof Directory)||!/^[a-zA-Z0-9_-]+$/.test(item.name))continue;
   try{const tokenFile=marker(item);if(!tokenFile.exists)continue;const token=tokenFile.textSync();
    if(!/^[0-9a-f-]{36}$/i.test(token)||!registry.canDelete(item.name,token,marker(item).textSync()))continue;
    item.delete();
   }catch{/* Cleanup must not affect reading. */}
  }
 }catch{/* Cache may be unavailable. */}
}
