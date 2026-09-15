import {useEffect,useState} from 'react';
import {ActivityIndicator,FlatList,Modal,Pressable,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSQLiteContext} from 'expo-sqlite';
import {X} from 'lucide-react-native';
import {IconButton} from '../../components/IconButton';
import {Button} from '../../components/ui';
import type {Book} from '../../types';
import {ensureBookIndex,searchBook,type SearchHit} from '../../services/books/search';
import {useSettings} from '../settings/SettingsProvider';
export function BookSearch({book,onClose,onJump}:{book:Book;onClose:()=>void;onJump:(hit:SearchHit)=>void}){
 const db=useSQLiteContext(),{colors}=useSettings();
 const [query,setQuery]=useState(''),[whole,setWhole]=useState(false),[limit,setLimit]=useState(30),[ready,setReady]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[hits,setHits]=useState<SearchHit[]>([]);
 useEffect(()=>{const controller=new AbortController();setReady(false);setError('');setStatus('');void ensureBookIndex(db,book,controller.signal,(done,total)=>{if(!controller.signal.aborted)setStatus(`首次准备搜索 ${done}/${total}`);}).then(()=>{if(!controller.signal.aborted){setReady(true);setStatus('');}}).catch(()=>{if(!controller.signal.aborted)setError('索引建立失败，请重试。');});return()=>controller.abort();},[book.id,db,attempt]);
 useEffect(()=>{const controller=new AbortController();setHits([]);if(!ready||!query.trim())return;setBusy(true);const timer=setTimeout(()=>{void searchBook(book.id,query,whole,limit,controller.signal).then(rows=>{if(!controller.signal.aborted){setHits(rows);setError('');}}).catch(()=>{if(!controller.signal.aborted)setError('搜索失败，请重试');}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});},250);return()=>{clearTimeout(timer);controller.abort();};},[ready,query,whole,limit,book.id]);
 return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:colors.background,padding:18,gap:12}}>
  <View style={{flexDirection:'row',alignItems:'center'}}><TextInput autoFocus accessibilityLabel="搜索本书" placeholder="搜索本书" placeholderTextColor={colors.muted} value={query} maxLength={160} onChangeText={value=>{setQuery(value);setLimit(30);}} style={{flex:1,padding:12,borderRadius:12,color:colors.text,backgroundColor:colors.surface}}/><IconButton icon={X} label="关闭搜索" onPress={onClose}/></View>
  <Pressable accessibilityRole="checkbox" accessibilityState={{checked:whole}} onPress={()=>{setWhole(!whole);setLimit(30);}}><Text style={{color:whole?colors.accent:colors.muted}}>{whole?'☑':'□'} 整词匹配</Text></Pressable>
  {!ready&&status?<Text style={{color:colors.muted}}>{status} · 关闭此窗口后仍会继续</Text>:null}
  {busy&&ready&&query.trim()?<ActivityIndicator color={colors.accent}/>:null}
  {error?<View><Text style={{color:colors.text}}>{error}</Text><Button label="重试" onPress={()=>setAttempt(value=>value+1)}/></View>:null}
  <FlatList keyboardShouldPersistTaps="handled" data={hits} keyExtractor={hit=>`${hit.section}:${hit.offset}`} ListEmptyComponent={ready&&query.trim()&&!busy?<Text style={{color:colors.muted}}>没有找到匹配正文</Text>:null} renderItem={({item})=><Pressable accessibilityRole="button" onPress={()=>onJump(item)} style={{paddingVertical:16,borderBottomWidth:1,borderBottomColor:colors.border}}><Text style={{color:colors.muted,fontSize:12,marginBottom:6}}>{item.title}</Text><Text style={{color:colors.text,lineHeight:24}}>{item.before}<Text style={{color:colors.accent,fontWeight:'bold'}}>{item.text}</Text>{item.after}</Text></Pressable>} ListFooterComponent={hits.length>=limit?<Button label="更多结果" onPress={()=>setLimit(value=>value+30)}/>:null}/>
 </SafeAreaView></Modal>;
}
