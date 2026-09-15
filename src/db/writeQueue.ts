import type {SQLiteDatabase} from 'expo-sqlite';
export function writeQueue(){
 let tail:Promise<unknown>=Promise.resolve();
 return function enqueue<T>(operation:()=>Promise<T>):Promise<T>{
  const result=tail.then(async()=>{for(let attempt=0;;attempt++){try{return await operation();}catch(error){
   const locked=/SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(String(error));
   if(!locked||attempt>=3)throw error;
   await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));
  }}});tail=result.catch(()=>{});return result;
 };
}
const installed=new WeakSet<SQLiteDatabase>();
// Only the app connection is wrapped. Transaction handles stay unwrapped so
// statements inside a transaction cannot deadlock waiting on their own queue.
export function installWriteQueue(db:SQLiteDatabase){
 if(installed.has(db))return;installed.add(db);const enqueue=writeQueue();
 const run=db.runAsync.bind(db),transaction=db.withExclusiveTransactionAsync.bind(db);
 db.runAsync=((...args:Parameters<typeof run>)=>enqueue(()=>run(...args))) as typeof db.runAsync;
 db.withExclusiveTransactionAsync=(task)=>enqueue(()=>transaction(task));
}
