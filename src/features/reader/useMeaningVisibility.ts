import {useEffect,useState} from 'react';
import {useSQLiteContext} from 'expo-sqlite';
const values=new Map<string,boolean>();
const revisions=new Map<string,number>();
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(fn=>fn());
export function useMeaningVisibility(bookId:string){
 const db=useSQLiteContext();const [visible,setVisible]=useState(values.get(bookId)??true);const [error,setError]=useState('');
 useEffect(()=>{let active=true;const revision=revisions.get(bookId)??0;const changed=()=>setVisible(values.get(bookId)??true);listeners.add(changed);
 if(!values.has(bookId))void db.getFirstAsync<{value:string}>('SELECT value FROM settings WHERE key=?','meanings:'+bookId).then(row=>{if(active&&(revisions.get(bookId)??0)===revision){values.set(bookId,row?.value!=='off');emit();}}).catch(()=>{if(active)setError('释义开关读取失败');});
 return()=>{active=false;listeners.delete(changed);};},[db,bookId]);
 async function toggle(){const before=values.get(bookId)??true,next=!before,revision=(revisions.get(bookId)??0)+1;revisions.set(bookId,revision);values.set(bookId,next);emit();setError('');
 try{await db.runAsync('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)','meanings:'+bookId,next?'on':'off');}
 catch{if(revisions.get(bookId)===revision){values.set(bookId,before);emit();setError('释义开关保存失败，请重试');}}
 }
 return {visible,toggle,error};
}
