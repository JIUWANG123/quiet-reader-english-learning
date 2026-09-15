import {useEffect,useState} from 'react';
import {Modal,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSQLiteContext} from 'expo-sqlite';
import {Button,styles} from '../../components/ui';
import {useSettings} from '../settings/SettingsProvider';
import type {AIRequest} from '../../services/ai/provider';
import {marksChanged} from './marks';
import {saveSentence} from '../../services/vocabulary/sentences';
export function SentenceMarkSheet({bookId,selection,onClose}:{bookId:string;selection:AIRequest;onClose:()=>void}) {
  const db=useSQLiteContext();const {colors}=useSettings();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [note,setNote]=useState('');
  useEffect(()=>{let active=true;void db.getFirstAsync<{note:string}>('SELECT note FROM sentence_notes WHERE book_id=? AND section_key=? AND start_offset=? AND end_offset=?',bookId,selection.sectionKey??'',selection.startOffset??-1,selection.endOffset??-1).then(row=>{if(active)setNote(row?.note??'');}).catch(()=>{if(active)setError('笔记读取失败');});return()=>{active=false;};},[db,bookId,selection]);
  async function saveNote(remove=false){
    if(busy)return;setBusy(true);
    try{
      const {sectionKey,startOffset,endOffset,targetText}=selection;
      if(!sectionKey||!Number.isInteger(startOffset)||!Number.isInteger(endOffset)||endOffset!<=startOffset!)throw Error('位置不可用，请重新选择');
      if(remove)await db.runAsync('DELETE FROM sentence_notes WHERE book_id=? AND section_key=? AND start_offset=? AND end_offset=?',bookId,sectionKey,startOffset!,endOffset!);
      else {
        if(!note.trim())throw Error('请填写笔记');
        await db.runAsync('INSERT OR REPLACE INTO sentence_notes(book_id,section_key,start_offset,end_offset,text,note,updated_at) VALUES(?,?,?,?,?,?,?)',bookId,sectionKey,startOffset!,endOffset!,targetText,note.trim(),Date.now());
      }
      marksChanged();setError('已保存');
    }catch(e){setError(e instanceof Error?e.message:'笔记保存失败');}finally{setBusy(false);}
  }
  async function save(style:string,color:string) {
    if(busy)return;setBusy(true);
    try {
      const {sectionKey,startOffset,endOffset,targetText}=selection;
      if(!sectionKey||!Number.isInteger(startOffset)||!Number.isInteger(endOffset)||endOffset!<=startOffset!)throw new Error('选区位置不可用，请重新选择句子');
      await db.runAsync('INSERT OR REPLACE INTO sentence_marks(book_id,section_key,start_offset,end_offset,text,style,color,created_at) VALUES(?,?,?,?,?,?,?,?)',bookId,sectionKey,startOffset!,endOffset!,targetText,style,color,Date.now());
      marksChanged();setError('已保存');
    }catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}
  }
  return <Modal transparent visible animationType="slide" onRequestClose={onClose}><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#0006'}}><SafeAreaView edges={['bottom']} style={{padding:22,maxHeight:'75%',backgroundColor:colors.background,gap:12}}>
    <View style={[styles.row,{justifyContent:'space-between'}]}><Text style={{fontSize:20,color:colors.text}}>句子标记</Text><Button label="关闭" onPress={onClose}/></View>
    <ScrollView><Text style={{color:colors.text,lineHeight:24}}>{selection.targetText}</Text></ScrollView>
    <TextInput accessibilityLabel="句子笔记" placeholder="写下你的理解…" placeholderTextColor={colors.muted} multiline value={note} onChangeText={setNote} maxLength={4000} style={{color:colors.text,backgroundColor:colors.surface,borderRadius:12,padding:12,minHeight:80,maxHeight:160,textAlignVertical:'top'}}/>
    <View style={styles.row}><Button label="保存笔记" disabled={busy||!note.trim()} onPress={()=>void saveNote()}/><Button label="删除笔记" disabled={busy} onPress={()=>void saveNote(true)}/></View>
    <Button label="下划线" disabled={busy} onPress={()=>void save('underline','#b7791f')}/>
    <Button label="收藏句子" disabled={busy} onPress={()=>{setBusy(true);void saveSentence(db,bookId,selection.targetText,selection.paragraphText??selection.targetText).then(()=>{marksChanged();setError('已收藏');}).catch(()=>setError('收藏失败')).finally(()=>setBusy(false));}}/>
    <View style={styles.row}>{['#ffe082','#80cbc4','#90caf9','#f48fb1'].map((color,i)=><Button key={color} disabled={busy} label={['黄','绿','蓝','粉'][i]} onPress={()=>void save('highlight',color)}/>)}</View>
    <Text style={{color:colors.muted}}>仅标记当前这处选区。重新选中与现有标记重叠的文字，可移除该处标记。</Text>
    <Button label="移除这处标记" disabled={busy} onPress={()=>{setBusy(true);void db.runAsync('DELETE FROM sentence_marks WHERE book_id=? AND section_key=? AND start_offset<? AND end_offset>?',bookId,selection.sectionKey??'',selection.endOffset??0,selection.startOffset??0).then(()=>{marksChanged();setError('已保存');}).catch(()=>setError('移除失败')).finally(()=>setBusy(false));}}/>
    {error?<Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text>:null}
  </SafeAreaView></View></Modal>;
}
