import {Directory,File,Paths} from 'expo-file-system';

// Cache the library's CFI index, not user progress. Replacing the source file
// invalidates it; malformed or incomplete caches are safe to regenerate.
export function locationCache(source:string,spacing:number){
 const file=new File(source);
 const fingerprint=JSON.stringify([source,file.size,file.modificationTime,spacing,1]);
 const directory=new Directory(Paths.cache,'epub-locations');
 let key=2166136261;for(const char of source){key=Math.imul(key^char.charCodeAt(0),16777619);}
 const target=new File(directory,(key>>>0).toString(16)+'-'+encodeURIComponent(file.name)+'.json');
 return {
  read():string|undefined{
   try{if(!target.exists)return;const saved=JSON.parse(target.textSync());
    if(saved.fingerprint!==fingerprint||!Array.isArray(saved.locations)||!saved.locations.length||!saved.locations.every((v:unknown)=>typeof v==='string'&&v.startsWith('epubcfi(')))return;
    return JSON.stringify(saved.locations);
   }catch{return;}
  },
  write(value:unknown){
   try{const locations=typeof value==='string'?JSON.parse(value):value;
    if(!Array.isArray(locations)||!locations.length||!locations.every(v=>typeof v==='string'&&v.startsWith('epubcfi(')))return;
    directory.create({intermediates:true,idempotent:true});
    target.write(JSON.stringify({fingerprint,locations}));
   }catch{/* A cache failure never blocks reading or saving the actual CFI. */}
  }
 };
}
