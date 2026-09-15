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
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded,setExpanded]=useState<string|null>(null);
  const [filters,setFilters]=useState<Filters>(defaultFilters);
  const [search,setSearch]=useState('');
  const visibleItems=filterWords(items,filters).filter(item=>!search.trim() || `${item.word} ${item.translation??''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const [exporting,setExporting]=useState(false);
  const refresh = useCallback(async () => {
    try { setItems(await listVocabulary(db)); setError(''); }
    catch { setError('生词本读取失败，请重试。'); }
    finally { setLoading(false); }
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  async function exportCards(){if(exporting)return;setExporting(true);try{await exportAnki(db,visibleItems);}catch(e){Alert.alert('导出失败',e instanceof Error?e.message:'请重试');}finally{setExporting(false);}}

  async function changeFamiliarity(item: VocabularyItem, next: number) {
    try {
      await setVocabularyFamiliarity(db, item.word, next);
      await refresh();
    } catch { Alert.alert('保存失败', '熟悉度没有更新，请重试。'); }
  }
  function confirmRemove(item: VocabularyItem) {
    Alert.alert('移出生词本', `确定移除 ${item.word}？`, [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => { void removeVocabulary(db, item.word).then(refresh).catch(() => Alert.alert('移除失败', '请重试。')); } },
    ]);
  }

  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
    {loading ? <ActivityIndicator style={{ flex: 1 }} color={colors.accent} /> : <FlatList
      data={visibleItems}
      keyExtractor={item => item.word}
      contentContainerStyle={{ padding: 18, gap: 12, flexGrow: items.length ? 0 : 1 }}
      ListHeaderComponent={<View style={{gap:14,marginBottom:12}}>
        <View style={[styles.row,{justifyContent:'space-between'}]}><View style={{gap:4}}><Text style={{color:colors.text,fontSize:26,fontWeight:'600'}}>在阅读中积累</Text><Text style={{color:colors.muted,fontSize:12}}>{items.length} 个单词</Text></View><IconButton icon={Share} label="导出当前筛选单词到 Anki" disabled={exporting||!visibleItems.length} onPress={()=>void exportCards()}/></View>
        <Button label="开始复习" primary onPress={()=>router.push('/study')}/>
        <TextInput accessibilityLabel="搜索单词或释义" placeholder="搜索单词或释义" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} style={{minHeight:48,paddingHorizontal:16,borderRadius:14,backgroundColor:colors.surface,color:colors.text}}/>
        <View style={styles.row}>{([{label:'全部',due:'all',familiarity:-1},{label:'待复习',due:'due',familiarity:-1},{label:'已掌握',due:'all',familiarity:3}] as const).map(option=><Button key={option.label} label={option.label} primary={filters.due===option.due&&filters.familiarity===option.familiarity} onPress={()=>setFilters({...filters,due:option.due,familiarity:option.familiarity})}/>)}</View>
        {error ? <><Text accessibilityRole="alert" style={{ color: colors.text }}>{error}</Text><Button label="重新加载" onPress={refresh} /></> : null}<WordFilters words={items} value={filters} onChange={setFilters}/>
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
        {expanded===item.word&&item.source_text ? <View style={{ borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 11, gap: 5 }}><Text style={{ color: colors.text, fontFamily: 'serif', lineHeight: 22 }}>{item.source_text}</Text>{item.source_book_title ? <Text style={{ color: colors.muted, fontSize: 11 }}>来自《{item.source_book_title}》</Text> : null}</View> : null}
        <Text style={{ color: colors.muted, fontSize: 12 }}>熟悉度：{familiarityLabels[item.familiarity] ?? familiarityLabels[0]}</Text>
        <IconButton icon={ChevronDown} label="展开单词详情" selected={expanded===item.word} onPress={()=>setExpanded(expanded===item.word?null:item.word)}/>
        {expanded===item.word?<View style={[styles.row, { flexWrap: 'wrap' }]}>{familiarityLabels.map((label, value) => <Button key={label} label={label} primary={item.familiarity === value} onPress={() => { void changeFamiliarity(item, value); }} />)}</View>:null}
        {expanded===item.word?<View style={{ alignItems: 'flex-end' }}><IconButton icon={Trash2} label="移出生词本" onPress={() => confirmRemove(item)} /></View>:null}
      </Panel>}
    />}
    <MainNavigation active="words" />
  </SafeAreaView>;
}
