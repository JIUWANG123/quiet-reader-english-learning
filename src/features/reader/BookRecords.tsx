import {useEffect,useState} from 'react';
import {ActivityIndicator,FlatList,Pressable,Text,View} from 'react-native';
import {useSQLiteContext} from 'expo-sqlite';
import {useSettings} from '../settings/SettingsProvider';
import {Button,styles} from '../../components/ui';

type Kind='notes'|'sentences'|'words';
type RecordItem={id:string;title:string;detail:string|null};
// Read the original learning tables; no migration or duplicated copies are needed.
const queries:Record<Kind,string>={
 notes:"SELECT section_key||':'||start_offset||':'||end_offset AS id,note AS title,text AS detail FROM sentence_notes WHERE book_id=? ORDER BY updated_at DESC",
 sentences:"SELECT CAST(id AS TEXT) AS id,text AS title,context AS detail FROM saved_sentences WHERE book_id=? ORDER BY created_at DESC",
 words:"SELECT CAST(id AS TEXT) AS id,lemma AS title,contextual_meaning AS detail FROM text_marks WHERE book_id=? ORDER BY created_at DESC",
};
export function BookRecords({bookId}:{bookId:string}){
 const db=useSQLiteContext(),{colors}=useSettings();
 const [kind,setKind]=useState<Kind>('notes'),[items,setItems]=useState<RecordItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[expanded,setExpanded]=useState<string|null>(null);
 useEffect(()=>{let alive=true;setLoading(true);setExpanded(null);setError('');void db.getAllAsync<RecordItem>(queries[kind],bookId).then(rows=>{if(alive)setItems(rows)}).catch(()=>{if(alive)setError('记录读取失败。')}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[db,bookId,kind]);
 return <View style={{gap:12,flexShrink:1}}>
   <View style={styles.row}>{(['notes','sentences','words'] as const).map((key,i)=><Button key={key} label={['笔记','句子','标记词'][i]} primary={kind===key} onPress={()=>setKind(key)}/>)}</View>
   {error?<Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text>:loading?<ActivityIndicator color={colors.accent}/>:<FlatList data={items} keyExtractor={item=>item.id} contentContainerStyle={{gap:10,paddingBottom:12}} ListEmptyComponent={<Text style={{color:colors.muted,padding:20}}>这本书还没有此类记录。</Text>} renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel="展开阅读记录" onPress={()=>setExpanded(expanded===item.id?null:item.id)} style={{padding:16,borderRadius:16,backgroundColor:colors.surface,gap:8}}><Text numberOfLines={expanded===item.id?undefined:3} style={{color:colors.text,fontSize:16,lineHeight:24}}>{item.title}</Text>{item.detail?<Text numberOfLines={2} style={{color:colors.muted,fontSize:12,lineHeight:19}}>{item.detail}</Text>:null}</Pressable>}/>}</View>;
}
