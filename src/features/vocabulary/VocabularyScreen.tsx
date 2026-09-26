import {listStudyWords,studyBookChoices,studySources,setStudyExcluded,setStudyFamiliarity,removeStudyWord} from '../../services/vocabulary/lexicon';
import {Trash2,Share,ChevronDown} from 'lucide-react-native';
import {IconButton} from '../../components/IconButton';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, View, TextInput } from 'react-native';
import {router} from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Panel, styles } from '../../components/ui';
import { listVocabulary, removeVocabulary, setVocabularyFamiliarity, type VocabularyItem } from '../../services/vocabulary/repository';
import { useSettings } from '../settings/SettingsProvider';
import {WordFilters} from './WordFilters';
import {MainNavigation} from '../../components/MainNavigation';
import {defaultFilters,filterWords,type Filters} from '../../services/vocabulary/review';
import { exportAnki } from '../../services/vocabulary/export';

const familiarityLabels = ['不认识', '模糊', '熟悉', '掌握'];

export default function VocabularyScreen() {
  const db = useSQLiteContext();
  const { colors } = useSettings();
  const [items, setItems] = useState<(VocabularyItem & {excluded:number})[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded,setExpanded]=useState<string|null>(null);
  const [filters,setFilters]=useState<Filters>(defaultFilters);
  const [search,setSearch]=useState('');
  const [tab,setTab]=useState<'all'|'new'|'review'|'excluded'>('all');
  const visibleItems=items;
  const [hasMore,setHasMore]=useState(false);
  const [bookChoices,setBookChoices]=useState<{id:string;title:string}[]>([]);
  const [sources,setSources]=useState<Awaited<ReturnType<typeof studySources>>>([]);
  const [exporting,setExporting]=useState(false);
  const refresh = useCallback(async () => {
    try { const rows=await listStudyWords(db,true,{...filters,search,tab,limit:50});setItems(rows);setHasMore(rows.length===50);setBookChoices(await studyBookChoices(db));setError(''); }
    catch { setError('生词本读取失败，请重试。'); }
    finally { setLoading(false); }
  }, [db,filters,search,tab]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  async function exportCards(){if(exporting)return;setExporting(true);try{const rows=await listStudyWords(db,true,{...filters,search,tab});await exportAnki(db,rows);}catch(e){Alert.alert('导出失败',e instanceof Error?e.message:'请重试');}finally{setExporting(false);}}

  async function changeFamiliarity(item: VocabularyItem, next: number) {
    try {
      await setStudyFamiliarity(db, item.word, next);
      await refresh();
    } catch { Alert.alert('保存失败', '熟悉度没有更新，请重试。'); }
  }
  function confirmRemove(item: VocabularyItem) {
    Alert.alert('移出生词本', `移除 ${item.word} 及其词形的学习条目和来源？正文标记与历史答题记录保留。`, [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => { void removeStudyWord(db, item.word).then(refresh).catch(() => Alert.alert('移除失败', '请重试。')); } },
    ]);
  }

  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    {loading ? <ActivityIndicator style={{ flex: 1 }} color={colors.accent} /> : <FlatList
      data={visibleItems}
      ListFooterComponent={hasMore?<Button label="加载更多" onPress={()=>{void listStudyWords(db,true,{...filters,search,tab,limit:50,offset:items.length}).then(rows=>{setItems(previous=>[...new Map([...previous,...rows].map(w=>[w.word,w])).values()]);setHasMore(rows.length===50);}).catch(()=>setError('加载失败，请重试。'));}}/>:null}
      keyExtractor={item => item.word}
      contentContainerStyle={{ padding: 18, gap: 12, flexGrow: items.length ? 0 : 1 }}
      ListHeaderComponent={<View style={{gap:14,marginBottom:12}}>
        <View style={[styles.row,{justifyContent:'space-between'}]}><View style={{gap:4}}><Text style={{color:colors.text,fontSize:26,fontWeight:'600'}}>在阅读中积累</Text><Text style={{color:colors.muted,fontSize:12}}>已显示 {items.length} 个单词</Text></View><IconButton icon={Share} label="导出当前筛选单词到 Anki" disabled={exporting||!visibleItems.length} onPress={()=>void exportCards()}/></View>
        <Button label="开始复习" primary onPress={()=>router.push({pathname:'/study',params:{book:filters.book}})}/>
        <TextInput accessibilityLabel="搜索单词或释义" placeholder="搜索单词或释义" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} style={{minHeight:48,paddingHorizontal:16,borderRadius:14,backgroundColor:colors.surface,color:colors.text}}/>
        <View style={styles.row}>{(['all','new','review','excluded'] as const).map((key,i)=><Button key={key} label={['全部','待学','复习','不复习'][i]} primary={tab===key} onPress={()=>setTab(key)}/>)}</View>
        {error ? <><Text accessibilityRole="alert" style={{ color: colors.text }}>{error}</Text><Button label="重新加载" onPress={refresh} /></> : null}<WordFilters bookChoices={bookChoices} words={items} value={filters} onChange={setFilters}/>
      </View>}
      ListEmptyComponent={<View style={{ flex: 1, justifyContent: 'center', gap: 12, padding: 30 }}><Text style={{ color: colors.text, fontSize: 22, textAlign: 'center' }}>还没有生词</Text><Text style={{ color: colors.muted, lineHeight: 22, textAlign: 'center' }}>阅读时查词并点击“加入生词”，第一次遇见它的原句会保存在这里。</Text></View>}
      renderItem={({ item }) => <Panel>
        <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: colors.text, fontSize: 21, fontWeight: '600' }}>{item.word}</Text>
            {item.phonetic ? <Text style={{ color: colors.muted }}>/{item.phonetic}/</Text> : null}
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>查过 {item.lookup_count} 次</Text>
        </View>
        {item.translation ? <Text numberOfLines={expanded===item.word?undefined:2} style={{ color: colors.text, lineHeight: 22 }}>{item.translation}</Text> : null}
        <Text style={{ color: colors.muted, fontSize: 12 }}>{item.source_book_title??'原书已移除'} · {item.excluded?'不复习 · ':item.due_at===0?'待学 · ':item.due_at<=Date.now()?'已到期 · ':'复习 · '}熟悉度：{familiarityLabels[item.familiarity] ?? familiarityLabels[0]}</Text>
        <IconButton icon={ChevronDown} label="展开单词详情" selected={expanded===item.word} onPress={()=>{setExpanded(expanded===item.word?null:item.word);setSources([]);void studySources(db,item.word).then(setSources).catch(()=>setError('来源读取失败'));}}/>
        {expanded===item.word?<View style={[styles.row, { flexWrap: 'wrap' }]}>{familiarityLabels.map((label, value) => <Button key={label} label={label} primary={item.familiarity === value} onPress={() => { void changeFamiliarity(item, value); }} />)}</View>:null}
        {expanded===item.word?sources.map((source,i)=><View key={i} style={{gap:4}}><Text style={{color:colors.text,lineHeight:24}}>{source.source_text}</Text><Text style={{color:colors.muted,fontSize:12}}>{source.word} · {source.translation??'暂无语境释义'} · {source.title??'原书已移除'}</Text></View>):null}
        {expanded===item.word?<Button label={item.excluded?'恢复复习':'不再复习'} onPress={()=>{void setStudyExcluded(db,item.word,!item.excluded).then(refresh).catch(()=>Alert.alert('设置失败','原状态已保留'));}}/>:null}
        {expanded===item.word?<View style={{ alignItems: 'flex-end' }}><IconButton icon={Trash2} label="移出生词本" onPress={() => confirmRemove(item)} /></View>:null}
      </Panel>}
    />}
    <MainNavigation active="words" />
  </SafeAreaView>;
}
