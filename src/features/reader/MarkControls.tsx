import {Underline,Highlighter,Type,Trash2,RefreshCw} from 'lucide-react-native';
import {IconButton} from '../../components/IconButton';
import {shortMeaning} from './shortMeaning';
import { useEffect, useRef, useState } from 'react';
import { Text, View, Pressable, Switch, ActivityIndicator } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, styles } from '../../components/ui';
import { useSettings } from '../settings/SettingsProvider';
import { requestAssistance } from '../../services/ai/service';
import { marksChanged } from './marks';
import type {DictionaryResult} from '../dictionary/types';
import {sentenceFromSelection,extractSourceSentence} from '../dictionary/normalize';
import {ensureVocabulary} from '../../services/vocabulary/repository';
import type {AIRequest} from '../../services/ai/provider';

export function MarkControls({bookId, lemma, context,selection,result}: {bookId: string; lemma: string; context: string;selection?:AIRequest;result:DictionaryResult}) {
  const db = useSQLiteContext(); const {colors} = useSettings();
  const [style, setStyle] = useState('highlight'); const [color, setColor] = useState('#ffe082');
  const [meaning,setMeaning]=useState('');
  const [expanded,setExpanded]=useState(false);
  const [enabled, setEnabled] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const locked=useRef(false);const controller=useRef<AbortController|null>(null);const active=useRef(true);
  useEffect(()=>{active.current=true;return ()=>{active.current=false;controller.current?.abort();};},[]);
  useEffect(() => { let active=true; void db.getFirstAsync<{style:string;color:string;show_meaning:number;contextual_meaning:string|null}>('SELECT * FROM text_marks WHERE book_id=? AND lemma=?',bookId,lemma).then(row=>{if(active&&row){setStyle(row.style);setColor(row.color);setEnabled(Boolean(row.show_meaning));setMeaning(shortMeaning(row.contextual_meaning));}}).catch(()=>{if(active)setMessage('标记读取失败');}); return ()=>{active=false;}; },[db,bookId,lemma]);
  async function save(nextStyle=style,nextColor=color,meaning?: string,show=enabled) {
    await db.withExclusiveTransactionAsync(async tx=>{
    await ensureVocabulary(tx,result,bookId,selection?sentenceFromSelection(selection):extractSourceSentence(context,result.query));
    await tx.runAsync(`INSERT INTO text_marks(book_id,lemma,style,color,show_meaning,contextual_meaning,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(book_id,lemma) DO UPDATE SET style=excluded.style,color=excluded.color,show_meaning=excluded.show_meaning,contextual_meaning=COALESCE(excluded.contextual_meaning,text_marks.contextual_meaning)`,bookId,lemma,nextStyle,nextColor,show?1:0,meaning??null,Date.now());
    });
    if(meaning!==undefined)setMeaning(meaning);setStyle(nextStyle);setColor(nextColor);setEnabled(show);setMessage('已标记并加入单词书');marksChanged();
  }
  const fallback=shortMeaning(result.entry?.translation);
  async function generate(forceRefresh=false) {
    if(locked.current)return;locked.current=true;controller.current=new AbortController();setBusy(true);
    try {
      const response=await requestAssistance(db,{...(selection??{targetText:lemma,previousContext:context,followingContext:''}),mode:'mark_meaning'},controller.current.signal,forceRefresh);
      if(!active.current||controller.current.signal.aborted)return;
      const value=shortMeaning(typeof response.value.shortMeaning==='string'?response.value.shortMeaning:'');
      if(!value)throw new Error('AI 未返回有效简释');
      await save(style,color,value,true);
    }catch(e){if(active.current){if(fallback){await save(style,color,fallback,true);setMessage('已使用本地简释，可重试 AI 获取语境含义');}else setMessage(e instanceof Error?e.message:'生成失败，请重试');}}
    finally{locked.current=false;if(active.current)setBusy(false);}
  }
  async function toggle() {
    if(busy)return;
    try{if(enabled)await save(style,color,undefined,false);
    else await generate();}
    catch{setMessage('保存失败，请重试');}
  }
  return <View style={{gap:8}}>
    <View style={[styles.row,{justifyContent:'space-between'}]}><View style={styles.row}><IconButton icon={Highlighter} label="标记样式" selected={expanded} onPress={()=>setExpanded(value=>!value)}/><Text style={{color:colors.text,fontSize:13}}>全文释义</Text></View>{busy?<ActivityIndicator color={colors.accent}/>:<Switch accessibilityLabel="全文显示此词释义" value={enabled} onValueChange={()=>void toggle()} trackColor={{false:colors.border,true:colors.accent}}/>}</View>
    {expanded?<View style={{gap:8,padding:12,backgroundColor:colors.surface,borderRadius:16}}>
    <View style={styles.row}>{(['underline','highlight','text'] as const).map((value,i)=><IconButton key={value} icon={[Underline,Highlighter,Type][i]} label={['下划线','荧光笔','文字颜色'][i]} selected={style===value} disabled={busy} onPress={()=>{void save(value).catch(()=>setMessage('标记保存失败'));}}/>)}</View>
    <View style={styles.row}>{['#ffe082','#80cbc4','#90caf9','#f48fb1'].map((value,i)=><Pressable key={value} accessibilityRole="button" accessibilityLabel={['黄色','绿色','蓝色','粉色'][i]} accessibilityState={{selected:color===value,disabled:busy}} disabled={busy} onPress={()=>{void save(style,value).catch(()=>setMessage('标记保存失败'));}} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><View style={{width:24,height:24,borderRadius:12,backgroundColor:value,borderWidth:color===value?2:0,borderColor:colors.text}}/></Pressable>)}</View>
    <Text style={{color:colors.muted}}>{meaning||fallback||'暂无简释'}</Text>
    <View style={[styles.row,{justifyContent:'space-between'}]}><IconButton icon={RefreshCw} label="重新生成语境释义" disabled={busy} onPress={()=>void generate(true).catch(()=>setMessage('保存失败，请重试'))}/>
    <IconButton icon={Trash2} label="清除本书此词标记" disabled={busy} onPress={()=>{void db.runAsync('DELETE FROM text_marks WHERE book_id=? AND lemma=?',bookId,lemma).then(()=>{setEnabled(false);setMessage('已清除本书此词标记');marksChanged();}).catch(()=>setMessage('清除失败，请重试'));}}/>
    </View></View>:null}
    {message?<Text accessibilityLiveRegion="polite" style={{color:colors.muted,fontSize:12}}>{message}</Text>:null}
  </View>;
}
