import {BookSearch} from './BookSearch';
import {Search} from 'lucide-react-native';
import {searchLocator} from './searchLocator';
import {SentenceActions} from './SentenceActions';
import {epubVisualPosition} from './epubVisualPosition';
import {prepareEpubResources} from './epubResources';
import {NativePageStack,type PageStackHandle} from './NativePageStack';
import {createEpubPool,readyEpubDocument,turnEpubPool,invalidateEpubNeighbors} from './epubPool';
import {epubPreviewBoot} from './epubPreviewBoot';
import {IsolatedEpubPage,type EpubPageController} from './IsolatedEpubPage';
import {MarkStatus} from './MarkStatus';
import {usePaperTurn} from './PaperTurn';
import {ChevronLeft,ChevronRight,List,MessageSquareText} from 'lucide-react-native';
import {IconButton} from '../../components/IconButton';
import {Bookmarks} from './Bookmarks';
import {ReaderChrome} from './ReaderChrome';
import type {ChapterText} from '../ai/ChapterTranslation';
import {useVolumePageTurn} from './useVolumePageTurn';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Directory, File, Paths } from 'expo-file-system';
import { type Location, type Section, type Toc } from '@epubjs-react-native/core';
import type { Book } from '../../types';
import { restoreEpubPosition } from './epubPosition';
import {traceReading,exportReadingDiagnostics} from './diagnostics';
import { useSettings } from '../settings/SettingsProvider';
import { Button, styles } from '../../components/ui';
import { extractSingleLookupWord } from '../dictionary/normalize';
import { InlineAssistance } from '../ai/InlineAssistance';
import type { AIRequest } from '../../services/ai/provider';
import { readingBridgeScript } from './readingBridge.generated';
import { useMarks } from './useMarks';
import {TapEdges} from './PageTurn';
import {epubPageMotion} from './epubPageMotion';
import {epubProgressBridge} from './epubProgressBridge';

import {epubParagraphBridge} from './epubParagraphBridge';
import {useSQLiteContext} from 'expo-sqlite';
import {requestAssistance} from '../../services/ai/service';

function EpubReaderSession({ preparedSource,onToggleChrome,chapterRequest,onChapter,keysBlocked, book, onLeave, onLookupWord, onMarkSentence, onProgress, chromeVisible=true }: { preparedSource?:string;onToggleChrome:()=>void;chapterRequest:number;onChapter:(chapter:ChapterText)=>void;keysBlocked:boolean; book: Book; onProgress: (cfi: string, progress: number) => void; chromeVisible?: boolean; onLeave: () => void; onLookupWord: (word: string, context?: string, selection?: AIRequest) => void; onMarkSentence:(selection:AIRequest)=>void }) {
  const handledChapter=useRef(0);
  const db=useSQLiteContext();
  const paragraphStates=useRef<Record<string,{open:boolean;value:string;error:boolean}>>({});
  const paragraphRequests=useRef(new Map<string,AbortController>());
  useEffect(()=>()=>{paragraphRequests.current.forEach(controller=>controller.abort());paragraphRequests.current.clear();},[book.id]);
  async function translateParagraph(data:AIRequest & {id:string}){
    if(paragraphRequests.current.has(data.id))return;
    // Responses belong to a stable paragraph, never to a recycled WebView id.
    const reply=(text:string,error:boolean)=>{
      const pending=paragraphRequests.current.get(data.id);
      if(pending?.signal.aborted)return;
      const state={open:paragraphStates.current[data.id]?.open??true,value:text,error};
      paragraphStates.current[data.id]=state;
      // A response may arrive mid-swipe. Keep moving pages immutable until the
      // native stack has committed its new owner, then synchronize all copies.
      if(interaction.current){pendingParagraphSync.current=true;return;}
      injectAll(`window.qrEpubParagraphs?.sync(${JSON.stringify({[data.id]:state})});true;`);
    };
    if(data.targetText.length>12000){reply('本段太长，请长按选择需要翻译的句子。',true);return;}
    const controller=new AbortController();paragraphRequests.current.set(data.id,controller);
    try{const result=await requestAssistance(db,{mode:'chapter',targetText:data.targetText,previousContext:data.previousContext,followingContext:data.followingContext},controller.signal);const translation=result.value.translation;if(typeof translation!=='string'||!translation.trim())throw Error('未收到译文，请重试。');reply(translation,false);}
    catch(error){reply(error instanceof Error?error.message:'翻译失败，请重试。',true);}
    finally{paragraphRequests.current.delete(data.id);}
  }
  const restored = useRef(false);
  const lastLocation = useRef(book.epub_location);
  const lastProgress = useRef(book.progress);
  const [bookmarksOpen,setBookmarksOpen]=useState(false);
  const [selectionActive,setSelectionActive]=useState(false);
  const [selectionTop,setSelectionTop]=useState(8);
  const [selectedSentence,setSelectedSentence]=useState<AIRequest|null>(null);
  const {marks,sentenceMarks,meaningsVisible,error:marksError,retry:retryMarks}=useMarks(book.id);
  const [ready,setReady]=useState(false);
  const [sentenceTranslation,setSentenceTranslation]=useState<{text:string;value:string}|null>(null);
  const [aiSelection, setAISelection] = useState<AIRequest | null>(null);
  const [searchOpen,setSearchOpen]=useState(false);
  const [searchError,setSearchError]=useState('');
  const searchTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const searchHighlight=useRef<string|null>(null);
  useEffect(()=>()=>{if(searchTimer.current)clearTimeout(searchTimer.current);},[]);
  const [showContents, setShowContents] = useState(false);
  const { settings, colors, update } = useSettings();
  const paper=usePaperTurn(settings.pageAnimation&&settings.readingMode!=='scroll',colors.background);
  const controller=useRef<EpubPageController>(null);
  const controllers=useRef(new Map<string,EpubPageController>());
  const stack=useRef<PageStackHandle>(null);
  const interaction=useRef(false);
  const pendingParagraphSync=useRef(false);
  const pendingParagraphLayout=useRef<{id:string;location:Location}|null>(null);
  const [pool,setPool]=useState(()=>createEpubPool(book.epub_location));
  const poolRef=useRef(pool);poolRef.current=pool;
  const previewJobs=useRef(new Map<string,{started:number;timer:ReturnType<typeof setTimeout>}>());
  const finishPreview=(id:string,revision:number)=>{const key=id+':'+revision,job=previewJobs.current.get(key);if(job){clearTimeout(job.timer);previewJobs.current.delete(key);}return job?Date.now()-job.started:undefined;};
  const recoverPreview=(id:string,revision:number,code:string)=>{
    if(settings.readingMode==='scroll')return;
    const live=[poolRef.current.previous,poolRef.current.next].find(item=>item?.id===id&&(item.revision??0)===revision);
    if(!live||live.location||live.boundary)return;
    const duration=finishPreview(id,revision);
    traceReading('preview-error',{bookId:book.id,cfi:live.anchor??undefined,direction:live.direction,requestId:id+':'+revision,generation:revision,duration,code});
    if(live.retries){setFailure('相邻页加载失败，当前位置已保留。请重试恢复。');return;}
    // A timed-out Promise may still mutate its rendition. Replace that hidden
    // WebView instead of issuing concurrent navigation into the same instance.
    setPool(value=>{const slot=value.previous?.id===id?'previous':value.next?.id===id?'next':null;if(!slot||(value[slot]!.revision??0)!==revision)return value;return {...value,serial:value.serial+1,[slot]:{...value[slot]!,id:String(value.serial),revision:revision+1,retries:1}};});
  };
  useEffect(()=>{
    const documents=settings.readingMode==='scroll'?[]:[pool.previous,pool.next].filter(item=>item&&!item.location&&!item.boundary);
    const keys=new Set(documents.map(item=>item!.id+':'+(item!.revision??0)));
    for(const [key,job] of previewJobs.current){if(!keys.has(key)){clearTimeout(job.timer);previewJobs.current.delete(key);}}
    for(const document of documents){if(!document)continue;const revision=document.revision??0,key=document.id+':'+revision;if(previewJobs.current.has(key))continue;
      traceReading('preview-request',{bookId:book.id,cfi:document.anchor??undefined,direction:document.direction,requestId:key,generation:revision});
      const timer=setTimeout(()=>recoverPreview(document.id,revision,'PREVIEW_TIMEOUT'),revision>0&&!document.retries?1800:8000);
      previewJobs.current.set(key,{started:Date.now(),timer});
    }
  },[pool,book.id,settings.readingMode]);
  useEffect(()=>()=>{for(const job of previewJobs.current.values())clearTimeout(job.timer);previewJobs.current.clear();},[]);
  const activeId=useRef(pool.current.id);activeId.current=pool.current.id;
  const [runtimeId]=useState(()=>`reader-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const injectJavascript=useCallback((script:string)=>controller.current?.injectJavascript(script),[]);
  const injectAll=useCallback((script:string)=>controllers.current.forEach(page=>page.injectJavascript(script)),[]);
  const goPrevious=useCallback((options?:Parameters<EpubPageController['goPrevious']>[0])=>controller.current?.goPrevious(options),[]);
  const goNext=useCallback((options?:Parameters<EpubPageController['goNext']>[0])=>controller.current?.goNext(options),[]);
  const goToLocation=useCallback((cfi:string)=>{
    restored.current=false;setReady(false);lastLocation.current=cfi;
    setPool(value=>createEpubPool(cfi,value.serial));
  },[]);
  const removeSelection=useCallback(()=>controller.current?.removeSelection(),[]);
  const changeTheme=useCallback((value:Parameters<EpubPageController['changeTheme']>[0])=>controller.current?.changeTheme(value),[]);
  const leaving=useRef(false);
  const leave=useCallback(()=>{if(leaving.current)return;leaving.current=true;injectJavascript('window.qrProgress?.capture(0);true;');setTimeout(()=>{if(leaving.current){leaving.current=false;onLeave();}},1800);},[injectJavascript,onLeave]);
  useEffect(()=>{if(ready)injectJavascript(epubPageMotion);},[ready,settings.pageAnimation,injectJavascript]);
  useEffect(()=>{if(ready)injectJavascript(`window.qrReader?.setReadingMode(${JSON.stringify(settings.readingMode==='scroll'?'scroll':'native')});window.qrInteractionBlocked=${Boolean(keysBlocked||bookmarksOpen||aiSelection||showContents)};true;`);},[ready,settings.readingMode,keysBlocked,bookmarksOpen,aiSelection,showContents,injectJavascript]);
  const turn=(direction:number)=>{if(!ready||interaction.current||selectionActive||bookmarksOpen||keysBlocked||aiSelection||showContents)return;if(settings.readingMode!=='scroll'){stack.current?.turn(direction>0?1:-1);return;}injectJavascript('window.qrReader?.cancelPendingSelection();true;');void paper.turn(direction,()=>{if(direction>0)goNext({keepScrollOffset:true});else goPrevious({keepScrollOffset:true});});};
  const flow = settings.readingMode === 'scroll' ? 'scrolled-doc' : 'paginated';
  useEffect(()=>{if(ready)injectAll(`window.qrReader?.setMeaningsVisible(${meaningsVisible});true;`);},[ready,meaningsVisible,injectAll]);
  useEffect(()=>{if(ready)injectJavascript(`window.qrEpubParagraphs?.setVisible(${settings.paragraphTranslation});true;`);},[ready,settings.paragraphTranslation,injectJavascript]);
  const applyMarks=useCallback(()=>{injectAll(`${readingBridgeScript} rendition.getContents().forEach(function(content){window.qrReader.attach(content.document,'epub:'+content.sectionIndex);});window.qrReader.setMarks(${JSON.stringify(marks)});window.qrReader.setSentenceMarks(${JSON.stringify(sentenceMarks)});true;`);},[injectAll,marks,sentenceMarks]);
  useEffect(()=>{if(ready)applyMarks();},[ready,applyMarks]);
  const [toc, setToc] = useState<Toc>([]);
  const [progress, setProgress] = useState(book.progress);
  const [section, setSection] = useState<Section | null>(null);
  const [failure, setFailure] = useState('');
  // Native watchdog covers failures before the WebView restore script starts.
  useEffect(()=>{
    if(ready||failure)return;
    const timer=setTimeout(()=>{traceReading('restore-error',{bookId:book.id,code:'STARTUP_TIMEOUT'});setFailure('打开书籍超时，原进度已保留。请重试恢复。');},25000);
    return ()=>clearTimeout(timer);
  },[ready,failure,pool.current.id,book.id]);

  useVolumePageTurn(settings.volumePageTurn&&!keysBlocked&&ready&&!selectionActive&&!aiSelection&&!showContents&&!failure,turn);
  const uri = useMemo(() => preparedSource??new File(new Directory(Paths.document, 'books'), book.file_name).uri, [book.file_name,preparedSource]);
  const theme = useMemo(() => ({
    body: {
      color: `${colors.text} !important`,
      background: colors.background,
      'font-family': 'serif !important',
      'font-size': `${settings.fontSize}px !important`,
      'line-height': `${settings.lineHeight} !important`,
      'padding-left': `${settings.margin}px !important`,
      'padding-right': `${settings.margin}px !important`,
    },
  }), [colors.background, colors.text, settings.fontSize, settings.lineHeight, settings.margin]);
  useEffect(()=>{if(!ready||!chapterRequest||handledChapter.current===chapterRequest)return;handledChapter.current=chapterRequest;
    injectJavascript(`(function(){try{var index=rendition.currentLocation().start.index;var content=rendition.getContents().find(function(c){return c.sectionIndex===index;});if(!content)throw Error();var body=content.document.body.cloneNode(true);body.querySelectorAll('script,style,rt').forEach(function(e){e.remove();});body.querySelectorAll('p,div,li,h1,h2,h3,blockquote').forEach(function(e){e.appendChild(content.document.createTextNode('\\n\\n'));});window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-chapter',text:body.textContent}));}catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-chapter',text:''}));}})();true;`);
  },[ready,chapterRequest,injectJavascript]);
  const readSelection = useCallback((cfi: string, mode: string) => {
    injectJavascript(`book.getRange(${JSON.stringify(cfi)}).then(function(range) {
      if (!range) return;
      var doc=range.startContainer.ownerDocument;
      var body=doc.querySelector('body')||doc.documentElement;
      var before=doc.createRange(); before.selectNodeContents(body); before.setEnd(range.startContainer,range.startOffset);
      var after=doc.createRange(); after.selectNodeContents(body); after.setStart(range.endContainer,range.endOffset);
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'quiet-selection',mode:${JSON.stringify(mode==='mark'?'translate':mode)},action:${JSON.stringify(mode==='mark'?'mark':null)},targetText:range.toString(),previousContext:before.toString().slice(-2500),followingContext:after.toString().slice(0,2500),sectionKey:'epub:'+book.spine.get(${JSON.stringify(cfi)}).index,startOffset:before.toString().length,endOffset:before.toString().length+range.toString().length}));
    }); true;`);
    return false;
  }, [injectJavascript]);
  const selectionMenu = useMemo(() => [{
    key: 'lookup',
    label: '查词',
    action: (cfiRange: string) => readSelection(cfiRange, 'word'),
  }, {label: '翻译 / 解释', action: (cfiRange: string) => readSelection(cfiRange, 'translate')},
  {label: '标记', action: (cfiRange: string) => readSelection(cfiRange, 'mark')}], [readSelection]);

  const initialTheme = useRef(theme);
  const appliedTheme = useRef(theme);
  useEffect(() => {
    if (ready && appliedTheme.current !== theme) { appliedTheme.current = theme; changeTheme(theme); }
  }, [ready, theme, changeTheme]);
  const remember = useCallback((location: Location, fraction?: number) => {
    const cfi = location?.start?.cfi;
    if (!restored.current || !cfi) return;
    // Large books generate percentage locations asynchronously. Preserve the
    // previous percentage until the index is ready; always persist the CFI.
    const safeProgress = fraction === undefined ? lastProgress.current : Math.max(0, Math.min(1, fraction || 0));
    if(lastLocation.current===cfi&&lastProgress.current===safeProgress)return;
    lastLocation.current = cfi;
    traceReading('progress',{bookId:book.id,cfi,progress:safeProgress});
    lastProgress.current = safeProgress;
    setProgress(safeProgress);
    onProgress(cfi, safeProgress);
    // The live WebViews preload adjacent pages. Do not reread unrelated XHTML
    // caches on each progress event: this renderer does not consume them.
  }, [onProgress,book.id]);

  const annotationScript=`${readingBridgeScript} rendition.getContents().forEach(function(content){window.qrReader.attach(content.document,'epub:'+content.sectionIndex);});window.qrReader.setMeaningsVisible(${meaningsVisible});window.qrReader.setMarks(${JSON.stringify(marks)});window.qrReader.setSentenceMarks(${JSON.stringify(sentenceMarks)});true;`;
  const paintScript=`window.qrPaintPage=function(location,revision){
    if(window.qrPreviewRevision!==revision)return;
    try{window.qrDecoratePage?.();}catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-preview-error',code:'DECORATION_FAILED',revision:revision}));return;}
    requestAnimationFrame(function(){requestAnimationFrame(function(){if(window.qrPreviewRevision!==revision)return;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-page-painted',paintRevision:revision,cacheHit:Boolean(window.qrRestoreCacheHit),location:window.qrVisualPosition.capture(location)}));
    });});
  };window.qrDecoratePage=function(){${annotationScript}${epubPageMotion}${epubParagraphBridge}window.qrEpubParagraphs?.setVisible(${settings.paragraphTranslation});};true;`;
  useEffect(()=>{if(ready)injectAll(paintScript);},[ready,paintScript,injectAll]);
  if (!new File(uri).exists) return <View style={{ padding: 30, gap: 18 }}><Text style={{ color: colors.text }}>EPUB 文件缺失，请返回书架重新导入。</Text><Button label="返回书架" onPress={leave} /></View>;
  const renderPage=(slot:'previous'|'current'|'next')=>{
    const document=pool[slot];if(!document||(settings.readingMode==='scroll'&&slot!=='current'))return null;
    const active=slot==='current';
    return <IsolatedEpubPage controllerRef={value=>{if(value)controllers.current.set(document.id,value);else controllers.current.delete(document.id);if(active)controller.current=value;}} runtimeId={runtimeId+'-'+document.id}
        key={document.id+flow} navigationRevision={document.revision??0}
        navigationJavascript={epubPreviewBoot(document.direction,document.revision??0,document.visualAnchor)+restoreEpubPosition(document.anchor,document.visualAnchor,settings.readingMode==='scroll'?'scroll':'paginated')}
        src={uri} startupAnchor={document.anchor} generateLocations={active}
        keepScrollOffsetOnLocationChange
        defaultTheme={initialTheme.current}
        flow={settings.readingMode==='scroll'?'scrolled-doc':'paginated'}
        spread="none"
        enableSwipe={false}
        enableSelection
        menuItems={selectionMenu}
        injectedJavascript={paintScript+epubVisualPosition+epubPreviewBoot(document.direction,document.revision??0,document.visualAnchor)+`window.qrInteractionBlocked=false;window.qrSelectionGuard&&(window.qrSelectionGuard.locked=false);window.qrReadingMode=${JSON.stringify(settings.readingMode==='scroll'?'scroll':'native')};`+epubProgressBridge+readingBridgeScript+`if(!window.qrContentHook){window.qrContentHook=true;rendition.hooks.content.register(function(content){window.qrReader.attach(content.document,'epub:'+content.sectionIndex);});}rendition.getContents().forEach(function(content){window.qrReader.attach(content.document,'epub:'+content.sectionIndex);});true;`+epubParagraphBridge+`window.qrEpubParagraphs?.sync(${JSON.stringify(paragraphStates.current)});window.qrEpubParagraphs?.setVisible(${settings.paragraphTranslation});true;`+restoreEpubPosition(document.anchor,document.visualAnchor,settings.readingMode==='scroll'?'scroll':'paginated')}
        onStarted={()=>{if(!active)return;traceReading('started',{bookId:book.id,cfi:lastLocation.current??undefined,mode:settings.readingMode});restored.current=false;setReady(false);setSelectionActive(false);setSelectedSentence(null);appliedTheme.current=initialTheme.current;}}
        onRendered={()=>{controllers.current.get(document.id)?.injectJavascript('window.qrDecoratePage?.();true;');}}
        onWebViewMessage={(event: unknown) => {
          const data = event as AIRequest & {type?: string; location?: Location; code?: string;revision?:number};
          const live=([poolRef.current.current,poolRef.current.previous,poolRef.current.next]).find(item=>item?.id===document.id);
          if(!live||(data?.revision!==undefined&&data.revision!==(live.revision??0)))return;
          if((data?.type==='qr-preview-ready'||data?.type==='qr-position-ready')&&data.location?.start?.cfi){
            // Prepare annotations and paragraph controls before exposing a page.
            // Promotion must only change ownership, never redraw visible content.
            controllers.current.get(document.id)?.injectJavascript(`try{${annotationScript}${epubPageMotion}${epubParagraphBridge}window.qrEpubParagraphs?.setVisible(${settings.paragraphTranslation});}catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-decoration-error'}));}requestAnimationFrame(function(){requestAnimationFrame(function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-page-painted',paintRevision:${live.revision??0},cacheHit:Boolean(window.qrRestoreCacheHit),location:window.qrVisualPosition.capture(${JSON.stringify(data.location)})}));});});true;`);
            return;
          }
          if(data?.type==='qr-decoration-error'){traceReading('restore-error',{bookId:book.id,code:'DECORATION_FAILED'});return;}
          if(data?.type==='qr-page-painted'&&data.location?.start?.cfi){
            if((data as any).paintRevision!==(live.revision??0))return;
            const nextPool=readyEpubDocument(poolRef.current,document.id,data.location!,(data as any).paintRevision);
            poolRef.current=nextPool;
            stack.current?.setReadiness(nextPool.current.id,Boolean(nextPool.previous?.location),Boolean(nextPool.next?.location));
            setPool(nextPool);
            traceReading('preview-ready',{bookId:book.id,cfi:live.anchor??undefined,target:data.location.start.cfi,direction:live.direction,requestId:document.id+':'+(live.revision??0),generation:live.revision??0,duration:finishPreview(document.id,live.revision??0),cacheHit:(data as any).cacheHit});
            if(document.id===activeId.current){restored.current=true;setFailure('');setReady(true);traceReading('restore-ready',{bookId:book.id,cfi:data.location.start.cfi});
              if(searchHighlight.current){const cfi=searchHighlight.current;searchHighlight.current=null;injectJavascript(`try{rendition.annotations.highlight(${JSON.stringify(cfi)},{},null,'qr-search',{'fill':'#ffe082','fill-opacity':'0.5'});setTimeout(function(){rendition.annotations.remove(${JSON.stringify(cfi)},'highlight');},5000);}catch{}true;`);}
            }
            return;
          }
          if(data?.type==='qr-preview-boundary'||data?.type==='qr-preview-error'){
            if(data.type==='qr-preview-error')recoverPreview(document.id,live.revision??0,data.code||'PREVIEW_FAILED');
            else {finishPreview(document.id,live.revision??0);setPool(value=>{const slot=value.previous?.id===document.id?'previous':value.next?.id===document.id?'next':null;return slot&&(value[slot]!.revision??0)===(live.revision??0)?{...value,[slot]:{...value[slot]!,boundary:true}}:value;});}return;
          }
          // Delayed events from a previous owner must never save or open cards.
          if(document.id!==activeId.current)return;
          if(data?.type==='qr-search-result'){if(!searchTimer.current)return;clearTimeout(searchTimer.current);searchTimer.current=null;setSearchOpen(false);setSearchError('');searchHighlight.current=(data as any).cfi;goToLocation((data as any).cfi);return;}
          if(data?.type==='qr-search-error'){if(searchTimer.current)clearTimeout(searchTimer.current);searchTimer.current=null;Alert.alert('无法定位','原文位置未能核对，请重新搜索。');return;}
          if(data?.type==='qr-paragraph-layout'&&data.location?.start?.cfi&&interaction.current){pendingParagraphLayout.current={id:document.id,location:data.location};return;}
          if(interaction.current&&!['qr-position-ready','qr-exact-progress'].includes(data?.type??''))return;
          if(data?.type==='qr-paragraph-layout'&&data.location?.start?.cfi){
            if(!restored.current)return;
            setPool(value=>invalidateEpubNeighbors({...value,current:{...value.current,location:data.location}}));
            return;
          }
          if(data?.type==='qr-paragraph-state'){
            const event=data as unknown as {id:string;state:{open:boolean;value:string;error:boolean}};
            if(!/^\d+:\d+$/.test(event.id)||!event.state||typeof event.state.value!=='string'||event.state.value.length>100000)return;
            const state={open:Boolean(event.state.open),value:event.state.value,error:Boolean(event.state.error)};
            paragraphStates.current[event.id]=state;
            injectAll(`window.qrEpubParagraphs?.sync(${JSON.stringify({[event.id]:state})});true;`);
            return;
          }
          if(data?.type==='qr-epub-paragraph'){const paragraph=data as typeof data & {id:string};if(typeof paragraph.id==='string'&&typeof paragraph.targetText==='string'&&typeof paragraph.previousContext==='string'&&typeof paragraph.followingContext==='string')void translateParagraph(paragraph);return;}
          if(data?.type==='qr-exact-progress'||data?.type==='qr-progress'){remember(data.location!,Number.isFinite((data as any).fraction)?(data as any).fraction:undefined);return;} if(data?.type==='qr-position-snapshot'){if(data.location?.start?.cfi)remember(data.location,Number.isFinite((data as any).fraction)?(data as any).fraction:undefined);if((data as any).requestId===0&&leaving.current){leaving.current=false;onLeave();}return;}
          if(data?.type==='qr-chapter'){onChapter({title:section?.label??book.title,text:typeof (data as unknown as {text:string}).text==='string'?(data as unknown as {text:string}).text:''});return;}
          if(data?.type==='qr-turn-settled'){paper.settle((data as any).moved!==false);return;}
          if (data?.type === 'qr-turn') {turn((data as any).direction);return;}
          if (data?.type === 'qr-toggle-ui') {onToggleChrome();return;}
          if (data?.type === 'qr-selection-state') {const active=Boolean((data as unknown as {active:boolean}).active);setSelectionActive(active);if(!active)setSelectedSentence(null);return;}
          if (data?.type === 'qr-selection-ready') {setSelectionTop((data as any).toolbarTop??8);setSelectedSentence(data);return;}
          if (data?.type === 'qr-turn-error') { setFailure('翻页失败，阅读位置已保留。请返回书架重试。'); return; }
          if (data?.type === 'qr-position-error') { traceReading('restore-error',{bookId:book.id,code:data.code});restored.current=false;setReady(false);setFailure('暂时无法确认上次位置。原进度未覆盖。\n诊断：'+(/^RESTORE_[A-Z]+$/.test(data.code??'')?data.code:'RESTORE_UNKNOWN')); return; }
          if (!data || !['quiet-selection','qr-selection'].includes(data.type??'') || typeof data.targetText !== 'string' || typeof data.previousContext !== 'string' || typeof data.followingContext !== 'string') return;
          if(data.action==='mark'){removeSelection();onMarkSentence(data);return;}
          if (data.mode === 'word') {
            const word = extractSingleLookupWord(data.targetText);
            if (word) onLookupWord(word, data.previousContext + data.targetText + data.followingContext, data);
          } else if (data.mode === 'translate') {removeSelection();setAISelection(data);}
        }}
        onLocationsReady={(_key,locations)=>{injectAll(`book.locations.load(${JSON.stringify(locations)});true;`);if(!active)return;controllers.current.get(document.id)?.injectJavascript(`var loc=rendition.currentLocation();window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-exact-progress',location:loc,fraction:book.locations.percentageFromCfi(loc.start.cfi)}));true;`);}}
        charactersPerLocation={2400}
        onDisplayError={message=>{if(!active)return;traceReading('restore-error',{bookId:book.id,code:'EPUB_DISPLAY'});restored.current=false;setReady(false);setFailure(message||'EPUB 打开失败');}}
        onNavigationLoaded={({ toc: loaded }) => {if(active)setToc(loaded);}}
        onLocationChange={(_total, location, nextProgress, currentSection) => {
          if(document.id!==activeId.current||interaction.current)return;
          setSection(currentSection);
          remember(location, _total > 0 ? (Number.isFinite(location.start.percentage) ? location.start.percentage : nextProgress / 100) : undefined);
        }}
        renderLoadingFileComponent={() => <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}><ActivityIndicator color={colors.accent} /><Text style={{ color: colors.muted }}>正在打开 EPUB，大文件首次加载可能需要稍等…</Text></View>}
        renderOpeningBookComponent={() => <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />}
      />;
  };
  const commitPage=(direction:-1|1)=>{
    const next=turnEpubPool(poolRef.current,direction);if(next===poolRef.current)return;
    activeId.current=next.current.id;
    controller.current=controllers.current.get(next.current.id)??null;
    poolRef.current=next;setPool(next);setSelectedSentence(null);setSelectionActive(false);
    const location=next.current.location!;
    controller.current?.injectJavascript(`window.qrPreviewPromoted=true;window.qrProgress?.start(${JSON.stringify(location)});window.qrInteractionBlocked=false;window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-exact-progress',location:${JSON.stringify(location)},fraction:book.locations.total>0?book.locations.percentageFromCfi(${JSON.stringify(location.start.cfi)}):undefined}));true;`);
    remember(location);setSection(controller.current?.section??null);
  };
  return <View style={{flex:1,backgroundColor:colors.background}}><View style={{flex:1,overflow:'hidden',backgroundColor:colors.background}}>
    <NativePageStack controllerRef={stack} pageKey={pool.current.id} pageIds={{previous:pool.previous?.id??'empty-previous',current:pool.current.id,next:pool.next?.id??'empty-next'}}
      animate={settings.pageAnimation} previousReady={Boolean(pool.previous?.location)} nextReady={Boolean(pool.next?.location)}
      enabled={ready&&!keysBlocked&&!bookmarksOpen&&!selectionActive&&!aiSelection&&!showContents&&settings.readingMode==='swipe'}
      onDiagnostic={(event,detail)=>traceReading(event,{...detail,bookId:book.id,cfi:lastLocation.current??undefined,target:(detail.direction===1?poolRef.current.next:poolRef.current.previous)?.location?.start.cfi})}
      onTurn={commitPage} onInteraction={value=>{
        interaction.current=value;
        controller.current?.injectJavascript(`window.qrInteractionBlocked=${value||keysBlocked};window.qrReader?.cancelPendingSelection();true;`);
        if(value)return;
        const layout=pendingParagraphLayout.current;pendingParagraphLayout.current=null;
        if(layout&&layout.id===activeId.current)setPool(current=>invalidateEpubNeighbors({...current,current:{...current.current,location:layout.location}}));
        if(pendingParagraphSync.current){pendingParagraphSync.current=false;injectAll(`window.qrEpubParagraphs?.sync(${JSON.stringify(paragraphStates.current)});true;`);}
      }}
      renderPage={renderPage}/>
{!ready&&!failure?<View pointerEvents="none" style={{position:'absolute',inset:0,backgroundColor:colors.background,justifyContent:'center',alignItems:'center'}}><ActivityIndicator color={colors.accent}/><Text style={{color:colors.muted,marginTop:12}}>正在恢复阅读位置…</Text></View>:null}{paper.overlay}<MarkStatus error={marksError} retry={retryMarks}/>{settings.readingMode==='tap'&&!selectionActive&&ready?<TapEdges onTurn={turn}/>:null}</View>
    <Modal visible={Boolean(failure)} transparent animationType="fade" onRequestClose={onLeave}>
      <View style={{flex:1,justifyContent:'center',backgroundColor:'#0006',padding:24}}>
        <View style={{backgroundColor:colors.background,padding:24,borderRadius:18,gap:16}}>
          <Text accessibilityRole="alert" style={{color:colors.text}}>{failure}</Text>
          <Button label="重试恢复" onPress={()=>{restored.current=false;setReady(false);setFailure('');if(lastLocation.current)goToLocation(lastLocation.current);}}/>
          <Button label="返回书架" onPress={leave}/>
          <Button label="导出诊断" onPress={()=>{void exportReadingDiagnostics().catch(()=>setFailure(value=>value+'\n导出失败，请稍后重试。'));}}/>
        </View>
      </View>
    </Modal>
    {searchOpen?<BookSearch book={book} onClose={()=>{setSearchOpen(false);if(searchTimer.current)clearTimeout(searchTimer.current);searchTimer.current=null;}} onJump={hit=>{if(searchTimer.current)return;searchTimer.current=setTimeout(()=>{searchTimer.current=null;Alert.alert('定位超时','当前位置未改变，请重试。');},12000);injectJavascript(searchLocator+`(async function(){try{var section=book.spine.get(${hit.section});await section.load(book.load.bind(book));var range=window.qrSearchRange(section.document,${JSON.stringify(hit)});window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-search-result',cfi:section.cfiFromRange(range)}));}catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-search-error'}));}})();true;`);}}/>:null}
    {searchError?<Text style={{color:colors.text}}>{searchError}</Text>:null}
    {selectedSentence?<View style={{position:'absolute',top:selectionTop,left:8,right:8,zIndex:30,padding:6,backgroundColor:colors.surface,borderRadius:12}}><SentenceActions key={JSON.stringify(selectedSentence)} bookId={book.id} selection={selectedSentence} onTranslate={()=>{setAISelection({...selectedSentence,mode:'translate'});removeSelection();}} onMore={()=>onMarkSentence(selectedSentence)} onClose={()=>{removeSelection();setSelectedSentence(null);}}/></View>:null}
    {!failure ? <ReaderChrome visible={chromeVisible} style={{ position:"absolute",bottom:0,left:0,right:0,zIndex:20,backgroundColor:colors.background,padding: 12,paddingBottom:18, gap: 7, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Bookmarks bookId={book.id} location={lastLocation.current} label={`${section?.label??'正文'} · ${(progress*100).toFixed(2)}%`} onVisibility={setBookmarksOpen} onJump={goToLocation}/><IconButton icon={ChevronLeft} label="上一页" onPress={() => turn(-1)} />
        <IconButton icon={MessageSquareText} label={settings.paragraphTranslation?'隐藏段落翻译':'显示段落翻译'} selected={settings.paragraphTranslation} onPress={()=>update({paragraphTranslation:!settings.paragraphTranslation})}/>
        <IconButton icon={Search} label="搜索本书" onPress={()=>setSearchOpen(true)}/><IconButton icon={List} label="目录" onPress={() => setShowContents(true)} />
        <IconButton icon={ChevronRight} label="下一页" onPress={() => turn(1)} />
      </View>
      <Text numberOfLines={1} style={{ color: colors.muted, textAlign: 'center', fontSize: 11 }}>{section?.label ?? '正文'} · {(progress * 100).toFixed(2)}%</Text>
    </ReaderChrome> : null}
    <Modal visible={Boolean(aiSelection)} transparent animationType="slide" onRequestClose={() => setAISelection(null)}>
      <View style={{flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006'}}><SafeAreaView edges={['bottom']} style={{padding: 22, backgroundColor: colors.background, maxHeight: '80%'}}>
        <Button label="关闭" onPress={() => setAISelection(null)} />
        <ScrollView>{aiSelection ? <><Text style={{color: colors.text}} numberOfLines={5}>{aiSelection.targetText}</Text><InlineAssistance autoStart onResult={value=>setSentenceTranslation({text:aiSelection.targetText,value})} request={aiSelection} /><SentenceActions key={JSON.stringify(aiSelection)} bookId={book.id} selection={aiSelection} translation={sentenceTranslation?.text===aiSelection.targetText?sentenceTranslation.value:undefined} onMore={()=>onMarkSentence(aiSelection)}/></> : null}</ScrollView>
      </SafeAreaView></View>
    </Modal>
    <Modal visible={showContents} transparent animationType="slide" onRequestClose={() => setShowContents(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
        <SafeAreaView edges={['bottom']} style={{ maxHeight: '75%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22 }}>
          <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 16 }]}><Text style={{ fontSize: 22, color: colors.text }}>章节目录</Text><Button label="关闭" onPress={() => setShowContents(false)} /></View>
          <FlatList data={toc} keyExtractor={(item, index) => `${item.href}-${index}`} renderItem={({ item }) => <View style={{ marginBottom: 8 }}><Button label={item.label || '未命名章节'} onPress={() => { setShowContents(false); goToLocation(item.href); }} /></View>} />
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}






// Mode/layout changes create a fresh session at the last committed CFI. A
// promoted preview must never bootstrap again from its original neighbor anchor.
export default function EpubReader(props:Parameters<typeof EpubReaderSession>[0]){
  const dimensions=useWindowDimensions();
  const {settings,colors}=useSettings();
  const [resource,setResource]=useState<{bookId:string;uri:string}|null>(null);
  useEffect(()=>{
    let cancelled=false;
    const original=new File(Paths.document,'books',props.book.file_name).uri;
    const timer=setTimeout(()=>{if(cancelled)return;cancelled=true;traceReading('restore-error',{bookId:props.book.id,code:'RESOURCE_TIMEOUT'});setResource({bookId:props.book.id,uri:original});},30000);
    prepareEpubResources(original).then(uri=>{clearTimeout(timer);if(!cancelled)setResource({bookId:props.book.id,uri});}).catch(()=>{
      clearTimeout(timer);
      // The original EPUB remains a functional fallback if unpacking fails.
      if(!cancelled)setResource({bookId:props.book.id,uri:original});
    });
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[props.book.id,props.book.file_name]);
  const committed=useRef({cfi:props.book.epub_location,progress:props.book.progress});
  const layout=[dimensions.width,dimensions.height,dimensions.fontScale,props.book.id,settings.readingMode,settings.fontSize,settings.lineHeight,settings.margin,colors.background,colors.text].join(':');
  if(!resource||resource.bookId!==props.book.id)return <View style={{flex:1,backgroundColor:colors.background,alignItems:'center',justifyContent:'center'}}><ActivityIndicator color={colors.accent}/><Text style={{color:colors.muted,marginTop:12}}>正在准备阅读…</Text></View>;
  return <EpubReaderSession key={layout} {...props} preparedSource={resource.uri}
    book={{...props.book,epub_location:committed.current.cfi,progress:committed.current.progress}}
    onProgress={(cfi,progress)=>{committed.current={cfi,progress};props.onProgress(cfi,progress);}}/>;
}




