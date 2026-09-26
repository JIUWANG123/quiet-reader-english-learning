import {File} from 'expo-file-system';
import {prepareEpubResources} from '../../features/reader/epubResources';
import {traceReading} from '../../features/reader/diagnostics';

let active:Promise<void>|undefined;
export function warmupEpubAfterImport(bookId:string,source:string){
  if(active)return active;
  const started=Date.now();
  active=(async()=>{
    try{
      const file=new File(source);
      await prepareEpubResources(source);
      traceReading('resource-prepare',{bookId,archiveSize:file.size,duration:Date.now()-started});
    }catch(error){
      traceReading('restore-error',{bookId,code:'WARMUP_RESOURCE'});
    }
  })().finally(()=>{active=undefined;});
  return active;
}
export function cancelEpubWarmup(){
  // Resource preparation is internally bounded by the file operation; clearing
  // the admission slot prevents a background task from blocking the next import.
  active=undefined;
}
