import {BookSearch} from './BookSearch';
import {Search} from 'lucide-react-native';
import type {SearchHit} from '../../services/books/search';
import {SentenceActions} from './SentenceActions';
import {readRecovery} from './progressRecovery';
import {traceReading} from './diagnostics';
import {ChevronLeft,List,ChevronRight,ArrowLeft,Timer,Type,Languages,MessageSquareText} from 'lucide-react-native';
import {IconButton} from '../../components/IconButton';
import {Bookmarks} from './Bookmarks';
import {useFocusTimer,focusLabel} from '../reading-time/FocusProvider';
import {useReadingTime} from '../reading-time/useReadingTime';
import {ReaderChrome} from './ReaderChrome';
import {ChapterTranslation,type ChapterText} from '../ai/ChapterTranslation';
import {useMeaningVisibility} from './useMeaningVisibility';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { Book, BookPage } from '../../types';
import { getBook, getContents, getPage, getPageWindow } from '../../services/books/repository';
import { clamp, readingProgress } from '../../services/books/text';
import { useSettings } from '../settings/SettingsProvider';
import { Button, styles } from '../../components/ui';
import { useProgress } from './useProgress';
import EpubReader from './EpubReader';
import { tokenizeReadableText } from '../dictionary/normalize';
import { WordCard } from '../dictionary/WordCard';
import { TxtReader } from './TxtReader';
import { InlineAssistance } from '../ai/InlineAssistance';
import type { AIRequest } from '../../services/ai/provider';
import { extractSingleLookupWord } from '../dictionary/normalize';
import {SentenceMarkSheet} from './SentenceMarkSheet';

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{id: string}>();
  return <Reader key={id} id={id} />;
}
function Reader({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const focusTimer=useFocusTimer();
  const db = useSQLiteContext();
  const meanings=useMeaningVisibility(id);
  const [chapter,setChapter]=useState<ChapterText|null>(null);
  const [chapterRequest,setChapterRequest]=useState(0);
  const { settings, colors, update } = useSettings();
  const [book, setBook] = useState<Book | null>(null);
  const [page, setPage] = useState<BookPage | null>(null);
  const [contents, setContents] = useState<Pick<BookPage, 'page_index' | 'heading'>[]>([]);
  const [fraction, setFraction] = useState(0);
  const [jumpRevision,setJumpRevision]=useState(0);
  const [,setWindowRevision]=useState(0);
  const [bookmarksOpen,setBookmarksOpen]=useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [attempt, setAttempt] = useState(0);
  const readingTime=useReadingTime(id,Boolean(book)&&!loading&&!failure&&focusTimer.phase!=='break');
  const [searchOpen,setSearchOpen]=useState(false);
  const [searchHit,setSearchHit]=useState<SearchHit|null>(null);
  const [showContents, setShowContents] = useState(false);
  const [chromeVisible,setChromeVisible]=useState(true);
  const [lookupWord, setLookupWord] = useState<string | null>(null);
  const [epubContext, setEpubContext] = useState('');
  const [sentenceTranslation,setSentenceTranslation]=useState<{text:string;value:string}|null>(null);
  const [aiSelection,setAISelection]=useState<AIRequest|null>(null);
  const [sentenceSelection,setSentenceSelection]=useState<AIRequest|null>(null);
  const [wordSelection,setWordSelection]=useState<AIRequest|undefined>();
  const scroll = useRef<ScrollView>(null);
  const metrics = useRef({ height: 0, viewport: 0 });
  const restoring = useRef(true);
  const restoreFraction = useRef(0);
  const currentFraction = useRef(0);
  const requestId = useRef(0);
  // Keep neighboring TXT pages warm so the next page is already available
  // when the native gesture settles.
  const pageCache = useRef(new Map<number, BookPage>());
  const { schedule, scheduleEpub, flush, error } = useProgress(id);
  const leaving = useRef(false);
  const leave = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    try { if (await flush()) router.back(); } finally { leaving.current = false; }
  }, [flush]);
  useFocusEffect(useCallback(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { void leave(); return true; });
    return () => { back.remove(); void flush(); };
  }, [flush, leave]));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailure('');
    (async () => {
      let loaded = await getBook(db, id);
      if (!loaded) throw new Error('未找到这本书，请返回书库。');
      const recovery=readRecovery(id);
      if(recovery&&recovery.updated>(loaded.position_updated_at??0)&&((loaded.format==='epub'&&recovery.cfi)||(loaded.format==='txt'&&!recovery.cfi&&recovery.page<loaded.page_count)))loaded={...loaded,page_index:recovery.page,scroll_fraction:recovery.fraction,progress:recovery.progress,epub_location:recovery.cfi??null};
      if (!active) return;
        setBook(loaded);
        traceReading('load',{bookId:id,cfi:loaded.epub_location??undefined,progress:loaded.progress});
      if (loaded.format === 'epub') return;
      const index = Math.floor(clamp(loaded.page_index, 0, loaded.page_count - 1));
      const [windowRows, toc] = await Promise.all([getPageWindow(db, id, index), getContents(db, id)]);
      windowRows.forEach(row=>pageCache.current.set(row.page_index,row));
      const text = pageCache.current.get(index) ?? null;
      if (!text) throw new Error('书籍正文缺失，请重新导入原文件。');
      if (!active) return;
      restoring.current = true;
      restoreFraction.current = currentFraction.current = loaded.scroll_fraction;
      setFraction(loaded.scroll_fraction);
      setPage(text);
      setContents(toc);
      schedule(index, loaded.scroll_fraction, loaded.page_count);
    })().catch(e => { if (active) setFailure(e instanceof Error ? e.message : '读取失败，请重试。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; requestId.current++; };
  }, [db, id, attempt, schedule]);

  // Restore relative position after a font-size or viewport change.
  useEffect(() => {
    restoring.current = true;
    restoreFraction.current = currentFraction.current;
  }, [settings.fontSize, settings.lineHeight, settings.margin]);

  function restoreScroll() {
    const { height, viewport } = metrics.current;
    if (!restoring.current || height <= 0 || viewport <= 0) return;
    const y = Math.max(0, height - viewport) * restoreFraction.current;
    scroll.current?.scrollTo({ y, animated: false });
    // Ignore the initial zero-offset event until restoration has been applied.
    requestAnimationFrame(() => { restoring.current = false; });
  }
  async function go(index: number, initial=0, target?:SearchHit) {
    if (!book || loading || index < 0 || index >= book.page_count) return;
    const request = ++requestId.current;
    setLoading(true);
    setShowContents(false);
    if (!await flush()) { setLoading(false); return; }
    try {
      const next = pageCache.current.get(index) ?? await getPage(db, id, index);
      if (request !== requestId.current) return;
      if (!next) throw new Error('这一段读取失败，请重新导入原文件。');
      restoring.current = true;
      restoreFraction.current = currentFraction.current = initial;
      metrics.current.height = 0;
      setSearchHit(target??null);
      setFraction(initial);
      setPage(next);setJumpRevision(value=>value+1);
      void getPageWindow(db,id,index).then(rows=>{
        if(request!==requestId.current)return;
        // Keep only the neighboring sections; a large anthology must not grow
        // into an in-memory copy as the reader advances through it.
        pageCache.current=new Map(rows.map(row=>[row.page_index,row]));
        setWindowRevision(value=>value+1);
      }).catch(()=>{});
      schedule(index, initial, book.page_count);
    } catch (e) { setFailure(e instanceof Error ? e.message : '读取失败'); }
    finally { if (request === requestId.current) setLoading(false); }
  }
  return <SafeAreaView onStartShouldSetResponderCapture={()=>{readingTime.interact();return false;}} style={{ flex: 1, backgroundColor: colors.background }}>
    <ReaderChrome visible={chromeVisible} style={{position:'absolute',top:0,left:0,right:0,zIndex:20,backgroundColor:colors.background,paddingTop:insets.top+5,paddingHorizontal:12,paddingBottom:8}}>
      <View style={{flexDirection:'row',gap:6,alignItems:'center'}}>
        <IconButton icon={ArrowLeft} label="返回书架" onPress={leave}/>
        {readingTime.error?<Text style={{color:colors.muted,fontSize:11}}>{readingTime.error}</Text>:null}
        <Text numberOfLines={1} style={{flex:1,color:colors.muted,fontSize:12}}>{book?.title??'阅读'}</Text>
        {focusTimer.phase==='focus'||focusTimer.phase==='break'?<Button label={focusLabel(focusTimer.remaining)} onPress={()=>router.push('/reading-log')}/>:<IconButton icon={Timer} label="阅读计时与番茄钟" onPress={()=>router.push('/reading-log')}/>}
        {book?.format==='txt'&&page?<Bookmarks onVisibility={setBookmarksOpen} bookId={id} location={JSON.stringify({page:page.page_index,fraction})} label={`${page.heading??'正文'} · ${(readingProgress(page.page_index,fraction,book.page_count)*100).toFixed(2)}%`} onJump={raw=>{try{const target=JSON.parse(raw);if(Number.isInteger(target.page)&&Number.isFinite(target.fraction))void go(target.page,clamp(target.fraction,0,1));}catch{}}}/>:null}
        <IconButton icon={Languages} label={meanings.visible?'隐藏全文释义':'显示全文释义'} selected={meanings.visible} onPress={()=>void meanings.toggle()}/>
        <IconButton icon={Type} label="阅读排版设置" onPress={async()=>{if(await flush())router.push('/settings');}}/>
      </View>
      {meanings.error?<Text accessibilityRole="alert" style={{color:colors.muted}}>{meanings.error}</Text>:null}
    </ReaderChrome>
    {failure ? <View style={{ padding: 30, gap: 20 }}><Text accessibilityRole="alert" style={{ color: colors.text }}>{failure}</Text><Button label="重试" onPress={() => setAttempt(value => value + 1)} /></View>
      : book?.format === 'epub' ? <EpubReader onToggleChrome={()=>setChromeVisible(v=>!v)} chapterRequest={chapterRequest} chromeVisible={chromeVisible} onChapter={data=>setChapter(current=>current?data:null)} keysBlocked={Boolean(chapter||lookupWord||aiSelection||sentenceSelection||showContents)} book={book} onProgress={scheduleEpub} onLeave={leave} onMarkSentence={setSentenceSelection} onLookupWord={(word, context, selection) => { setLookupWord(word); setEpubContext(context ?? '');setWordSelection(selection); }} />
      : loading&&!page ? <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />
      : page ? <TxtReader searchHit={searchHit?.section===page.page_index?searchHit:null} key={`${page.page_index}:${jumpRevision}:${settings.fontSize}:${settings.lineHeight}:${settings.margin}:${settings.readingMode}`} keysBlocked={Boolean(loading||bookmarksOpen||lookupWord||aiSelection||sentenceSelection||showContents)} bookId={id} sectionKey={'txt:'+page.page_index} text={page.text} pageWindow={{previous:pageCache.current.get(page.page_index-1)??null,current:page,next:pageCache.current.get(page.page_index+1)??null}} initialFraction={fraction} onBoundary={direction=>{if(book&&page.page_index+direction>=0&&page.page_index+direction<book.page_count)void go(page.page_index+direction,direction<0?1:0);}}
        onProgress={value=>{currentFraction.current=value;setFraction(value);if(book)schedule(page.page_index,value,book.page_count);}}
        onToggleChrome={()=>{setChromeVisible(v=>!v);}} onSelection={value=>{if(value.action==='mark'){setSentenceSelection(value);return;}if(value.mode==='word'){const word=extractSingleLookupWord(value.targetText);if(word){setLookupWord(word);setWordSelection(value);setEpubContext(value.previousContext+value.targetText+value.followingContext);}}else setAISelection(value);}}/> : null}
    {error ? <View style={[styles.row, { position:'absolute',bottom:insets.bottom+12,left:12,right:12,zIndex:50,backgroundColor:colors.surface,padding:12,borderRadius:12 }]}><Text accessibilityRole="alert" style={{ color: colors.text }}>{error}</Text><Button label="重试保存" onPress={() => { void flush(); }} /></View> : null}
    {book?.format === 'txt' && page && !failure ? <ReaderChrome visible={chromeVisible} style={{ position:"absolute",bottom:0,left:0,right:0,zIndex:20,backgroundColor:colors.background,padding: 14,paddingBottom:insets.bottom+8, gap: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon={ChevronLeft} label="上一段" disabled={loading || page.page_index === 0} onPress={() => go(page.page_index - 1)} />
        <IconButton icon={MessageSquareText} label={settings.paragraphTranslation?'隐藏段落翻译':'显示段落翻译'} selected={settings.paragraphTranslation} onPress={()=>update({paragraphTranslation:!settings.paragraphTranslation})}/>
        <IconButton icon={Search} label="搜索本书" onPress={()=>setSearchOpen(true)}/><IconButton icon={List} label="目录" onPress={() => setShowContents(true)} />
        <IconButton icon={ChevronRight} label="下一段" disabled={loading || page.page_index >= book.page_count - 1} onPress={() => go(page.page_index + 1)} />
      </View>
      <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 11 }}>第 {page.page_index + 1} / {book.page_count} 段 · {(readingProgress(page.page_index, fraction, book.page_count) * 100).toFixed(2)}%</Text>
    </ReaderChrome> : null}
    {searchOpen&&book?<BookSearch book={book} onClose={()=>setSearchOpen(false)} onJump={hit=>{setSearchOpen(false);void go(hit.section,0,hit);}}/>:null}
    {chapter?<ChapterTranslation chapter={chapter} onClose={()=>setChapter(null)}/>:null}
    <WordCard word={lookupWord} sourceBookId={id} sourceText={epubContext} selection={wordSelection} onClose={() => setLookupWord(null)} />
    {sentenceSelection?<SentenceMarkSheet bookId={id} selection={sentenceSelection} onClose={()=>setSentenceSelection(null)}/>:null}
    <Modal visible={Boolean(aiSelection)} transparent animationType="slide" onRequestClose={()=>setAISelection(null)}><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#0006'}}><SafeAreaView edges={['bottom']} style={{padding:22,maxHeight:'80%',backgroundColor:colors.background}}><Button label="关闭" onPress={()=>setAISelection(null)}/>{aiSelection?<ScrollView><Text style={{color:colors.text}}>{aiSelection.targetText}</Text><InlineAssistance autoStart onResult={value=>setSentenceTranslation({text:aiSelection.targetText,value})} request={aiSelection}/><SentenceActions key={JSON.stringify(aiSelection)} bookId={id} selection={aiSelection} translation={sentenceTranslation?.text===aiSelection.targetText?sentenceTranslation.value:undefined} onMore={()=>setSentenceSelection(aiSelection)}/></ScrollView>:null}</SafeAreaView></View></Modal>
    <Modal visible={showContents} transparent animationType="slide" onRequestClose={() => setShowContents(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
        <SafeAreaView edges={['bottom']} style={{ maxHeight: '75%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22 }}>
          <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 16 }]}><Text style={{ fontSize: 22, color: colors.text }}>阅读目录</Text><Button label="关闭" onPress={() => setShowContents(false)} /></View>
          <FlatList data={contents} keyExtractor={item => String(item.page_index)} renderItem={({ item }) => <View style={{ marginBottom: 8 }}><Button label={item.heading ?? `第 ${item.page_index + 1} 段`} primary={page?.page_index === item.page_index} onPress={() => go(item.page_index)} /></View>} />
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaView>;
}
