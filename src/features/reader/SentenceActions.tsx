import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {useSQLiteContext} from 'expo-sqlite';
import * as Clipboard from 'expo-clipboard';
import {Underline,Bookmark,Languages,MoreHorizontal,Copy,X} from 'lucide-react-native';
import {IconButton} from '../../components/IconButton';
import type {AIRequest} from '../../services/ai/provider';
import {saveSentence} from '../../services/vocabulary/sentences';
import {marksChanged,subscribeMarks} from './marks';
import {useSettings} from '../settings/SettingsProvider';

/** Actions retain their selection snapshot; changing the DOM must not lose it. */
export function SentenceActions({bookId,selection,onTranslate,onMore,onClose,translation}:{bookId:string;selection:AIRequest;onTranslate?:()=>void;onMore:()=>void;onClose?:()=>void;translation?:string}){
 const db=useSQLiteContext(),{colors}=useSettings();
 const [marked,setMarked]=useState(false),[saved,setSaved]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false),epoch=useRef(0);
 const [revision,setRevision]=useState(0);
 useEffect(()=>subscribeMarks(()=>setRevision(value=>value+1)),[]);
 const identity=JSON.stringify([bookId,selection.sectionKey,selection.startOffset,selection.endOffset,selection.targetText]);
 useEffect(()=>{if(!translation||!saved)return;void db.runAsync('UPDATE saved_sentences SET translation=? WHERE book_id=? AND text=?',translation,bookId,selection.targetText.trim()).catch(()=>setMessage('译文保存失败'));},[translation,saved,identity,db]);
 useEffect(()=>{const generation=++epoch.current;setMarked(false);setSaved(false);setMessage('');
  void Promise.all([db.getFirstAsync('SELECT 1 FROM sentence_marks WHERE book_id=? AND section_key=? AND start_offset=? AND end_offset=?',bookId,selection.sectionKey??'',selection.startOffset??-1,selection.endOffset??-1),db.getFirstAsync('SELECT 1 FROM saved_sentences WHERE book_id=? AND text=?',bookId,selection.targetText.trim())]).then(([mark,save])=>{if(epoch.current===generation){setMarked(Boolean(mark));setSaved(Boolean(save));}}).catch(()=>{if(epoch.current===generation)setMessage('状态读取失败');});
  return()=>{epoch.current++;};
 },[identity,db,revision]);
 async function act(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);const generation=epoch.current;try{await action();}catch{if(generation===epoch.current)setMessage('操作失败，请重试');}finally{lock.current=false;setBusy(false);}}
 async function mark(){
  const {sectionKey,startOffset,endOffset,targetText}=selection;
  if(!sectionKey||!Number.isInteger(startOffset)||!Number.isInteger(endOffset)){setMessage('请重新选择正文');return;}
  if(marked)await db.runAsync('DELETE FROM sentence_marks WHERE book_id=? AND section_key=? AND start_offset=? AND end_offset=?',bookId,sectionKey,startOffset!,endOffset!);
  else {
   const last=await db.getFirstAsync<{style:string;color:string}>('SELECT style,color FROM sentence_marks ORDER BY created_at DESC LIMIT 1');
   await db.runAsync('INSERT OR REPLACE INTO sentence_marks(book_id,section_key,start_offset,end_offset,text,style,color,created_at) VALUES(?,?,?,?,?,?,?,?)',bookId,sectionKey,startOffset!,endOffset!,targetText,last?.style??'underline',last?.color??'#b7791f',Date.now());
  }
  setMarked(!marked);marksChanged();
 }
 async function collect(){if(saved)await db.runAsync('DELETE FROM saved_sentences WHERE book_id=? AND text=?',bookId,selection.targetText.trim());else await saveSentence(db,bookId,selection.targetText,selection.paragraphText??selection.targetText);setSaved(!saved);}
 return <View><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
  <IconButton icon={Underline} label={marked?'取消划线':'划线'} selected={marked} disabled={busy} onPress={()=>void act(mark)} onLongPress={onMore}/>
  <IconButton icon={Bookmark} label={saved?'取消收藏':'收藏句子'} selected={saved} disabled={busy} onPress={()=>void act(collect)}/>
  {onTranslate?<IconButton icon={Languages} label="翻译句子" onPress={onTranslate}/>:null}
  <IconButton icon={Copy} label="复制原句" onPress={()=>void act(async()=>{await Clipboard.setStringAsync(selection.targetText);setMessage('已复制');})}/>
  <IconButton icon={MoreHorizontal} label="笔记与标记样式" onPress={onMore}/>
  {onClose?<IconButton icon={X} label="关闭选区" onPress={onClose}/>:null}
 </View>{message?<Text accessibilityLiveRegion="polite" style={{color:colors.muted,fontSize:12}}>{message}</Text>:null}</View>;
}
