import type {Position} from './positionModel';
type Dependencies={save:(position:Position)=>Promise<void>;journal:(position:Position)=>void;onError:(message:string)=>void};
export function createProgressSaver(deps:Dependencies){
 let pending:Position|null=null,running:Promise<boolean>|null=null,timer:ReturnType<typeof setTimeout>|null=null,closed=false,journaled=0;
 function checkpoint(){if(!pending)return;try{deps.journal(pending);journaled=pending.updated;}catch{/* Main database can still succeed. */}}
 function later(delay:number){if(closed||timer)return;timer=setTimeout(()=>{timer=null;void flush();},delay);}
 function stage(value:Position){if(closed)return;pending=value;later(350);}
 function flush():Promise<boolean>{
  if(timer)clearTimeout(timer);timer=null;checkpoint();if(running)return running;
  const work=async()=>{while(pending){const value=pending;checkpoint();try{
   await deps.save(value);if(pending===value)pending=null;if(!closed)deps.onError('');
  }catch(error){checkpoint();const code=/SQLITE_BUSY|SQLITE_LOCKED/.exec(String(error))?.[0]??'WRITE_ERROR';console.warn('[reading-progress]',code);
   if(!closed)deps.onError(pending&&journaled>=pending.updated?'主进度保存失败，已保留恢复位置，正在重试。':'位置未保存，请重试。');later(2000);return false;
  }}return true;};
  running=work().finally(()=>{running=null;});return running;
 }
 function close(){closed=true;return flush();}
 return {stage,flush,close,open:()=>{closed=false;}};
}
