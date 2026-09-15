import {useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,FlatList,Modal,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSQLiteContext} from 'expo-sqlite';
import {Button,styles} from '../../components/ui';
import {useSettings} from '../settings/SettingsProvider';
import {requestAssistance} from '../../services/ai/service';
import {chapterPassages} from '../../services/ai/chapter';
export type ChapterText={title:string;text:string|null};
export function ChapterTranslation({chapter,onClose}:{chapter:ChapterText;onClose:()=>void}){
 const db=useSQLiteContext();const {colors}=useSettings();
 const chunks=useMemo(()=>chapterPassages(chapter.text??''),[chapter.text]);
 const [translated,setTranslated]=useState<Record<number,string>>({});const results=useRef<Record<number,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[cached,setCached]=useState(0);
 const controller=useRef<AbortController|null>(null),running=useRef(false),mounted=useRef(true);
 async function run(){
  if(running.current||!chunks.length)return;
  running.current=true;const abort=new AbortController();controller.current=abort;setBusy(true);setError('');
  try{for(let i=0;i<chunks.length;i++){
   if(abort.signal.aborted||!mounted.current)return;if(results.current[i])continue;
   const result=await requestAssistance(db,{mode:'chapter',targetText:chunks[i],previousContext:(chunks[i-1]??'').slice(-500),followingContext:(chunks[i+1]??'').slice(0,500)},abort.signal);
   if(abort.signal.aborted||!mounted.current)return;
   const translation=result.value.translation;if(typeof translation!=='string'||!translation.trim())throw Error('AI 未返回完整译文，请重试此段。');
   results.current={...results.current,[i]:translation};setTranslated(results.current);if(result.cached)setCached(n=>n+1);
  }}catch(e){if(mounted.current)setError(abort.signal.aborted?'已暂停，已完成的译文和缓存会保留。':e instanceof Error?e.message:'翻译失败，请重试');}
  finally{running.current=false;if(mounted.current)setBusy(false);}
 }
 useEffect(()=>{mounted.current=true;if(chapter.text!==null)void run();return()=>{mounted.current=false;controller.current?.abort();};},[chapter.text]);
 useEffect(()=>{if(chapter.text!==null)return;const timer=setTimeout(()=>setError('本章尚未读取完成，可关闭后重试。'),15000);return()=>clearTimeout(timer);},[chapter.text]);
 return <Modal visible transparent animationType="slide" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:colors.background}}><View style={{padding:18,gap:10}}><View style={[styles.row,{justifyContent:'space-between'}]}><Text style={{fontSize:21,color:colors.text}}>本章 AI 译文</Text><Button label="关闭译文" onPress={onClose}/></View><Text numberOfLines={2} style={{color:colors.muted}}>{chapter.title}</Text><Text style={{color:colors.muted}}>已完成 {Object.keys(translated).length}/{chunks.length} 段 · 缓存 {cached} 段。仅翻译本次打开的章节。</Text>{busy?<Button label="暂停翻译" onPress={()=>controller.current?.abort()}/>:chunks.length>Object.keys(translated).length?<Button label="继续 / 重试" onPress={()=>void run()}/>:null}{error?<Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text>:null}</View>{chapter.text===null?<ActivityIndicator color={colors.accent}/>:!chunks.length?<Text style={{color:colors.muted,padding:18}}>本章没有可翻译的正文。</Text>:<FlatList data={chunks} keyExtractor={(_,i)=>String(i)} contentContainerStyle={{padding:18,gap:22}} renderItem={({item,index})=><View style={{gap:10}}><Text selectable style={{color:colors.text,fontFamily:'serif',fontSize:18,lineHeight:28}}>{item}</Text><Text selectable style={{color:colors.muted,lineHeight:26}}>{translated[index]??(busy?'等待翻译…':'尚未翻译')}</Text></View>}/>}</SafeAreaView></Modal>;
}
