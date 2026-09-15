import {Directory,File,Paths} from 'expo-file-system';
import {latestPosition,parsePosition,type Position} from './positionModel';
export type {Position} from './positionModel';
let lastStamp=0;
export const positionStamp=()=>lastStamp=Math.max(Date.now(),lastStamp+1);
function slots(id:string){const dir=new Directory(Paths.document,'reading-recovery');dir.create({intermediates:true,idempotent:true});const name=encodeURIComponent(id);return [new File(dir,name+'.0.json'),new File(dir,name+'.1.json')];}
export function readRecovery(id:string):Position|null{
 try{return latestPosition(slots(id).map(file=>{try{return file.exists?file.textSync():'';}catch{return '';}}));}catch{return null;}
}
// Alternate slots; a partial write leaves the previous recovery record intact.
export function writeRecovery(id:string,value:Position){const files=slots(id);let older=0;try{const times=files.map(f=>{try{return parsePosition(f.textSync())?.updated??0;}catch{return 0;}});if(Math.max(...times)>=value.updated)return;older=times[0]<=times[1]?0:1;}catch{}files[older].write(JSON.stringify(value));}
