type Journal={sessionId:string;bookId:string;startedAt:number;ended?:boolean};
type Storage={read:()=>string;write:(value:string)=>void};
export class ReaderSessionJournal{
 constructor(private storage:Storage){}
 private read():Journal|null{try{const item=JSON.parse(this.storage.read());return item&&typeof item.sessionId==='string'&&typeof item.bookId==='string'&&Number.isFinite(item.startedAt)?item:null;}catch{return null;}}
 start(sessionId:string,bookId:string,startedAt=Date.now()){this.storage.write(JSON.stringify({sessionId,bookId,startedAt}));}
 end(sessionId:string){const item=this.read();if(item?.sessionId===sessionId)this.storage.write(JSON.stringify({...item,ended:true}));}
 recoverPrevious(){const item=this.read();if(!item||item.ended)return null;this.storage.write(JSON.stringify({...item,ended:true}));return{sessionId:item.sessionId,bookId:item.bookId,startedAt:item.startedAt};}
}
