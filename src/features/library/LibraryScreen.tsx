import {TodayCard} from '../reading-time/TodayCard';
import {Plus, BookOpen} from 'lucide-react-native';
import {IconButton} from '../../components/IconButton';
import {MainNavigation} from '../../components/MainNavigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSettings } from '../settings/SettingsProvider';
import { Button, styles } from '../../components/ui';
import { listBooks, removeBooks } from '../../services/books/repository';
import { cleanDeletedBookFiles } from '../../services/books/cleanup';
import { addSample, importBook } from '../../services/books/import';
import type { Book } from '../../types';

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const { colors } = useSettings();
  const [books, setBooks] = useState<Book[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[] | null>(null);
  const refresh = useCallback(async () => {
    try {
      setBooks(await listBooks(db));
      const remaining = await cleanDeletedBookFiles(db);
      setError(remaining ? '书籍已移出书架，部分文件稍后重试清理。' : '');
    }
    catch { setError('书库读取失败，请重试。'); }
    finally { setLoading(false); }
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useFocusEffect(useCallback(() => {
    if (selected === null) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { if (!busy) setSelected(null); return true; });
    return () => back.remove();
  }, [selected, busy]));
  function toggle(id: string) {
    setSelected(current => (current ?? []).includes(id) ? current!.filter(value => value !== id) : [...(current ?? []), id]);
  }
  function confirmDelete() {
    if (!selected?.length || busy) return;
    const ids = [...selected];
    Alert.alert(`删除 ${ids.length} 本书？`, '将移除 App 内的书籍副本、阅读进度和本书标记。已收藏生词及来源原句保留，手机原文件不会删除。', [
      {text: '取消', style: 'cancel'},
      {text: '删除', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await removeBooks(db, ids); setSelected(null); await refresh(); }
        catch { Alert.alert('删除失败', '请重试，书架会保留未删除的书籍。'); }
        finally { setBusy(false); }
      }},
    ]);
  }
  async function importFile() {
    if (busy) return;
    setBusy(true);
    try {
      const imported = await importBook(db);
      await refresh();
      if (imported?.format === 'epub') Alert.alert('导入成功', 'EPUB 已保存，可以开始阅读。首次打开大文件可能需要稍等。');
    } catch (e) { Alert.alert('未能导入', e instanceof Error ? e.message : '请检查文件和剩余存储空间后重试。'); }
    finally { setBusy(false); }
  }
  async function sample() {
    setBusy(true);
    try { const id = await addSample(db); await refresh(); router.push({ pathname: '/reader/[id]', params: { id } }); }
    catch { Alert.alert('未能打开', '请检查存储空间后重试。'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ padding: 24, gap: 16 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.muted, fontSize: 12, letterSpacing: 3 }}>QUIET READER</Text>
        <IconButton icon={Plus} label="导入书籍" onPress={importFile} disabled={busy || selected !== null} />
      </View>
      <Text style={{ fontSize: 30, fontWeight: '600', color: colors.text }}>我的书架</Text>
      <Text style={{ color: colors.muted, lineHeight: 23 }}>读英文，按自己的节奏。</Text>
      <TodayCard/>
      {selected !== null ? <View style={[styles.row,{justifyContent:'space-between'}]}>
        <Text style={{color:colors.text}}>已选 {selected.length} 本</Text>
        <Button label="全选" disabled={busy} onPress={()=>setSelected(books.map(book=>book.id))}/>
        <Button label="删除" primary disabled={busy||!selected.length} onPress={confirmDelete}/>
        <Button label="取消" disabled={busy} onPress={()=>setSelected(null)}/>
      </View> : busy ? <ActivityIndicator color={colors.accent} /> : null}
      {error ? <><Text accessibilityRole="alert" style={{ color: colors.text }}>{error}</Text><Button label="重新加载" onPress={refresh} /></> : null}
    </View>
    {loading ? <ActivityIndicator style={{flex:1}} color={colors.accent} /> : <FlatList data={books} numColumns={2} columnWrapperStyle={{gap:14}} keyExtractor={book => book.id} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 30, gap: 18 }}
      ListHeaderComponent={selected===null && books.some(book=>book.last_read_at) ? <Pressable accessibilityRole="button" accessibilityLabel="继续阅读最近的书籍" onPress={()=>{const recent=[...books].sort((a,b)=>(b.last_read_at??0)-(a.last_read_at??0))[0];router.push({pathname:'/reader/[id]',params:{id:recent.id}});}} style={{padding:20,backgroundColor:colors.surface,borderRadius:20,gap:12,marginBottom:8}}><View style={styles.row}><BookOpen size={20} color={colors.accent}/><Text style={{color:colors.accent,fontSize:12,fontWeight:'600'}}>继续阅读</Text></View><Text numberOfLines={2} style={{color:colors.text,fontSize:20,fontFamily:'serif'}}>{[...books].sort((a,b)=>(b.last_read_at??0)-(a.last_read_at??0))[0].title}</Text><Text style={{color:colors.muted,fontSize:12}}>从上次停下的地方，继续。</Text></Pressable>:null}
      ListEmptyComponent={<View style={{ paddingVertical: 45, gap: 20 }}>
        <Text style={{ fontSize: 22, color: colors.text }}>留一段时间，给一本书。</Text>
        <Text style={{ color: colors.muted, lineHeight: 24 }}>从手机导入英文 TXT，或先读一小段示例。</Text>
        <Button label="打开阅读示例" onPress={sample} disabled={busy} />
      </View>}
      extraData={selected}
      renderItem={({ item }) => <Pressable disabled={busy} accessibilityRole={selected!==null?'checkbox':'button'} accessibilityState={{checked:selected?.includes(item.id)??false}} accessibilityLabel={`${selected!==null?'选择':'阅读'} ${item.title}`}
        onLongPress={()=>setSelected(current=>current?.includes(item.id)?current:[...(current??[]),item.id])}
        onPress={() => selected!==null ? toggle(item.id) : router.push({ pathname: '/reader/[id]', params: { id: item.id } })}
        style={{ width:'48%', padding: 10, gap: 12, borderRadius: 16, borderWidth:2,borderColor:selected?.includes(item.id)?colors.accent:'transparent' }}>
        {selected!==null?<Text style={{color:colors.accent,fontSize:22,alignSelf:'center'}}>{selected.includes(item.id)?'☑':'☐'}</Text>:null}
        <View style={{ width:'100%', aspectRatio:0.72, padding:16, borderRadius: 8, borderLeftWidth: 5, borderLeftColor: colors.accent, backgroundColor: colors.surface, justifyContent: 'space-between' }}><BookOpen size={24} strokeWidth={1.4} color={colors.accent}/><Text numberOfLines={4} style={{ color: colors.text, fontSize: 18, fontFamily: 'serif' }}>{item.title}</Text><Text style={{ color: colors.muted, fontSize: 10, letterSpacing:2 }}>{item.format.toUpperCase()}</Text></View>
        <View style={{ flex: 1, gap: 8 }}>
          <Text numberOfLines={2} style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>{item.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>已读 {(item.progress * 100).toFixed(2)}%</Text>
          <View style={{ height: 3, backgroundColor: colors.border, borderRadius: 2 }}><View style={{ height: 3, width: `${item.progress * 100}%`, backgroundColor: colors.accent }} /></View>
          <Text style={{ color: colors.muted, fontSize: 11 }}>{item.last_read_at ? `上次阅读 ${new Date(item.last_read_at).toLocaleString()}` : '尚未开始'}</Text>
        </View>
      </Pressable>} />}
    <MainNavigation active="library" />
  </SafeAreaView>;
}
