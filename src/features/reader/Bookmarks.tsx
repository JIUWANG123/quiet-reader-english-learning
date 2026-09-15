import {BookRecords} from './BookRecords';
import {useState} from 'react';
import {Modal,View,Text,FlatList} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Bookmark,Plus,X,Trash2} from 'lucide-react-native';
import {useSQLiteContext} from 'expo-sqlite';
import {IconButton} from '../../components/IconButton';
import {Button,styles} from '../../components/ui';
import {useSettings} from '../settings/SettingsProvider';
type Entry={id:number;location:string;label:string};
export function Bookmarks({bookId,location,label,onJump,onVisibility}:{bookId:string;location:string|null|undefined;label:string;onJump:(location:string)=>void;onVisibility?:(open:boolean)=>void}){
 const db=useSQLiteContext(),{colors}=useSettings();const [open,setOpen]=useState(false),[items,setItems]=useState<Entry[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [records,setRecords]=useState(false);
 const close=()=>{setOpen(false);onVisibility?.(false);};
 async function refresh(){try{setItems(await db.getAllAsync<Entry>('SELECT id,location,label FROM bookmarks WHERE book_id=? ORDER BY created_at DESC',bookId));setError('');}catch{setError('书签读取失败');}}
 async function mutate(id?:number){if(busy)return;setBusy(true);try{if(id!==undefined)await db.runAsync('DELETE FROM bookmarks WHERE book_id=? AND id=?',bookId,id);else if(location)await db.runAsync('INSERT INTO bookmarks(book_id,location,label,created_at) VALUES(?,?,?,?) ON CONFLICT(book_id,location) DO UPDATE SET label=excluded.label',bookId,location,label,Date.now());await refresh();}catch{setError('书签保存失败，请重试');}finally{setBusy(false);}}
 return <><IconButton icon={Bookmark} label="书签" onPress={()=>{setOpen(true);onVisibility?.(true);void refresh();}}/><Modal visible={open} transparent animationType="slide" onRequestClose={close}><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#0006'}}><SafeAreaView edges={['bottom']} style={{backgroundColor:colors.background,padding:20,maxHeight:'75%',borderTopLeftRadius:20,borderTopRightRadius:20}}><View style={[styles.row,{justifyContent:'space-between'}]}><Text style={{color:colors.text,fontSize:20}}>阅读记录</Text><IconButton icon={Plus} label="添加当前位置" disabled={!location||busy} onPress={()=>void mutate()}/><IconButton icon={X} label="关闭书签" onPress={close}/></View><View style={[styles.row,{paddingVertical:10}]}><Button label="书签" primary={!records} onPress={()=>setRecords(false)}/><Button label="笔记与收藏" primary={records} onPress={()=>setRecords(true)}/></View>{error?<Text style={{color:colors.text}}>{error}</Text>:null}{records?<BookRecords bookId={bookId}/>:<FlatList data={items} keyExtractor={x=>String(x.id)} ListEmptyComponent={<Text style={{color:colors.muted,padding:20}}>暂无书签，点击 + 保存当前位置</Text>} renderItem={({item})=><View style={[styles.row,{paddingVertical:8}]}><View style={{flex:1}}><Button label={item.label} onPress={()=>{onJump(item.location);close();}}/></View><IconButton icon={Trash2} label="删除书签" disabled={busy} onPress={()=>void mutate(item.id)}/></View>}/>}</SafeAreaView></View></Modal></>;
}
