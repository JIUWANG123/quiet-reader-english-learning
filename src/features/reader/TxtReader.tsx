import type {SearchHit} from '../../services/books/search';
import {searchLocator} from './searchLocator';
import {SentenceActions} from './SentenceActions';
import {MarkStatus} from './MarkStatus';
import {usePaperTurn} from './PaperTurn';
import {useVolumePageTurn} from './useVolumePageTurn';
import {Button,styles} from '../../components/ui';
import {useMemo,useRef,useEffect,useState} from 'react';
import {View} from 'react-native';
import {txtScreenBoot} from './txtScreenBoot';
import {txtParagraphBridge} from './txtParagraphBridge';
import {useSQLiteContext} from 'expo-sqlite';
import {requestAssistance} from '../../services/ai/service';
import WebView from 'react-native-webview';
import {readingBridgeScript} from './readingBridge.generated';
import {useMarks} from './useMarks';
import {useSettings} from '../settings/SettingsProvider';
import {TapEdges} from './PageTurn';
import {NativePageStack,type PageStackHandle} from './NativePageStack';
import type {AIRequest} from '../../services/ai/provider';
import type {BookPage} from '../../types';
const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function TxtReader({searchHit,keysBlocked,bookId,sectionKey,text,initialFraction,onProgress,onSelection,onBoundary,onToggleChrome,pageWindow}:{searchHit?:SearchHit|null;keysBlocked:boolean;bookId:string;sectionKey:string;text:string;initialFraction:number;onProgress:(value:number)=>void;onSelection:(value:AIRequest)=>void;onBoundary:(direction:number)=>void;onToggleChrome?:()=>void;pageWindow?:{previous:BookPage|null;current:BookPage|null;next:BookPage|null}}){
  const ref=useRef<WebView>(null);const stackRef=useRef<PageStackHandle>(null);const interacting=useRef(false);const pageRefs=useRef(new Map<string,WebView>());const [screen,setScreen]=useState({id:sectionKey+':initial',y:0,max:0,step:1});const [ready,setReady]=useState<Record<string,boolean>>({});const db=useSQLiteContext();const {settings,colors}=useSettings();const {marks,sentenceMarks,meaningsVisible,error:marksError,retry:retryMarks}=useMarks(bookId);
  useEffect(()=>{setScreen({id:sectionKey+':initial',y:0,max:0,step:1});setReady({});setSelected(null);},[sectionKey]);
  const paper=usePaperTurn(settings.pageAnimation&&settings.readingMode!=='scroll',colors.background);
  const paragraphs=useMemo(()=>text.split(/\n\s*\n/),[text]);
  const requests=useRef(new Map<number,AbortController>());
  type ParagraphState={open:boolean;pending:boolean;value:string;error:boolean};
  const paragraphStates=useRef(new Map<number,ParagraphState>());
  const syncParagraph=(id:number,state:ParagraphState)=>{
    paragraphStates.current.set(id,state);
    pageRefs.current.forEach(view=>view.injectJavaScript(`window.qrParagraphSync?.(${id},${JSON.stringify(state)});window.qrMeasure?.();true;`));
  };
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current++;requests.current.forEach(c=>c.abort());requests.current.clear();},[text]);
  async function translateParagraph(id:number) {
    if(!Number.isInteger(id)||id<0||id>=paragraphs.length||requests.current.has(id))return;
    const controller=new AbortController(),current=generation.current;
    requests.current.set(id,controller);
    const reply=(message:string,error:boolean)=>{if(current===generation.current&&!controller.signal.aborted)syncParagraph(id,{open:paragraphStates.current.get(id)?.open??true,pending:false,value:message,error});};
    try {
      const result=await requestAssistance(db,{mode:'chapter',targetText:paragraphs[id],previousContext:paragraphs.slice(Math.max(0,id-2),id).join('\n\n').slice(-2200),followingContext:paragraphs.slice(id+1,id+3).join('\n\n').slice(0,2200)},controller.signal);
      if(typeof result.value.translation!=='string'||!result.value.translation.trim())throw new Error('没有收到翻译，请重试');
      reply(result.value.translation,false);
    } catch(error) {reply(error instanceof Error?error.message:'翻译失败，请重试',true);}
    finally {if(requests.current.get(id)===controller)requests.current.delete(id);}
  }

  const [selectionTop,setSelectionTop]=useState(8);
  const [selected,setSelected]=useState<AIRequest|null>(null);
  // A persistent WebView must not reuse the previous section's fraction or
  // accept delayed progress messages from a document that is being replaced.
  const documentSection=useRef(sectionKey);
  const initial=useRef(initialFraction);
  if(documentSection.current!==sectionKey){documentSection.current=sectionKey;initial.current=initialFraction;}
  const progress=useRef(onProgress);progress.current=onProgress;
  const html=useMemo(()=>`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>body{margin:0;padding:24px ${settings.margin}px 40px;background:${colors.background};color:${colors.text};font:${settings.fontSize}px/${settings.lineHeight} Georgia,serif;overflow-wrap:break-word;user-select:text;-webkit-user-select:text;}section{margin:0 0 18px}p{display:inline;margin:0;white-space:pre-wrap}.qr-translation{font:16px/1.7 sans-serif;color:#888;margin:0 0 22px;white-space:pre-wrap}.qr-translation[hidden]{display:none}.qrp{display:none;border:0;background:transparent;color:#999;font-size:12px;margin:-10px 0 18px;padding:0}</style></head><body>${paragraphs.map((p,i)=>'<section><p>'+escape(p)+'</p><span class="qrp" data-qr-ui="" data-i="'+i+'"><span style="display:none">＋ 译</span></span></section>').join('')}</body></html>`,[paragraphs,settings.margin,settings.fontSize,settings.lineHeight,colors.background,colors.text]);
  const annotationScript=()=>`window.qrParagraphVisibility?.(${settings.paragraphTranslation});window.qrReader?.setMeaningsVisible(${meaningsVisible});window.qrReader?.setMarks(${JSON.stringify(marks)});window.qrReader?.setSentenceMarks(${JSON.stringify(sentenceMarks)});${Array.from(paragraphStates.current,([id,state])=>`window.qrParagraphSync?.(${id},${JSON.stringify(state)});`).join('')}window.qrMeasure?.();true;`;
  const apply=()=>pageRefs.current.forEach(view=>view.injectJavaScript(annotationScript()));
  useEffect(apply,[marks,sentenceMarks]);
  useEffect(()=>{pageRefs.current.forEach(view=>view.injectJavaScript(`window.qrReader?.setMeaningsVisible(${meaningsVisible});window.qrMeasure?.();true;`));},[meaningsVisible]);
  useEffect(()=>{pageRefs.current.forEach(view=>view.injectJavaScript(`window.qrParagraphVisibility?.(${settings.paragraphTranslation});window.qrMeasure?.();true;`));},[settings.paragraphTranslation]);
  useEffect(()=>{ref.current?.injectJavaScript(`window.qrInteractionBlocked=${keysBlocked};true;`);},[keysBlocked]);
  const turn=(direction:number)=>{if(keysBlocked||selected||interacting.current)return;
    if(settings.readingMode!=='scroll'){
      const available=direction>0?screen.y<screen.max-2:screen.y>2;
      if(available)stackRef.current?.turn(direction>0?1:-1);
      else if(direction>0?pageWindow?.next:pageWindow?.previous)onBoundary(direction);
      return;
    }
    void paper.turn(direction,()=>{ref.current?.injectJavaScript(`window.qrTurn(${direction});true;`);});};
  useVolumePageTurn(settings.volumePageTurn&&!keysBlocked&&!selected,turn);
  const navigation=`window.qrTurn=function(direction){window.qrReader?.cancelPendingSelection();if(!getSelection().isCollapsed){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-turn-settled'}));return;}var max=Math.max(0,document.documentElement.scrollHeight-innerHeight);if(direction>0&&scrollY>=max-2||direction<0&&scrollY<=2){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-boundary',direction:direction}));return;}window.scrollBy({top:direction*Math.max(1,innerHeight-48),behavior:${JSON.stringify(settings.readingMode==='scroll'&&settings.pageAnimation?'smooth':'instant')}});requestAnimationFrame(function(){requestAnimationFrame(function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-turn-settled'}));});});};
`;
  const positions={previous:Math.max(0,screen.y-screen.step),current:screen.y,next:Math.min(screen.max,screen.y+screen.step)};
  // A live document keeps its identity when fonts, translations or scroll anchoring
  // change its coordinates. Only a committed turn promotes a different document.
  const ids={previous:positions.previous===screen.y?screen.id:sectionKey+':'+positions.previous,current:screen.id,next:positions.next===screen.y?screen.id:sectionKey+':'+positions.next};
  useEffect(()=>{const valid=new Set(Object.values(ids));setReady(old=>Object.fromEntries(Object.entries(old).filter(([key])=>valid.has(key))));},[ids.previous,ids.current,ids.next]);
  const renderScreen=(slot:'previous'|'current'|'next')=>{
    if(slot!=='current'&&(settings.readingMode==='scroll'||positions[slot]===screen.y))return null;
    const identity=ids[slot],active=slot==='current';
    return <WebView scrollEnabled={settings.readingMode==='scroll'} ref={view=>{if(view)pageRefs.current.set(identity,view);else pageRefs.current.delete(identity);if(active)ref.current=view;}} source={{html}} style={{flex:1,backgroundColor:colors.background}} originWhitelist={['about:blank']} onShouldStartLoadWithRequest={r=>r.url==='about:blank'}
    injectedJavaScript={`(function(){var send=window.ReactNativeWebView.postMessage.bind(window.ReactNativeWebView);window.ReactNativeWebView.postMessage=function(raw){try{var value=JSON.parse(raw);value.documentSection=${JSON.stringify(sectionKey)};send(JSON.stringify(value));}catch{}};})();window.qrReadingMode=${JSON.stringify(settings.readingMode==='scroll'?'scroll':'native')};window.qrSectionKey=${JSON.stringify(sectionKey)};`+txtParagraphBridge+readingBridgeScript+navigation+annotationScript()+txtScreenBoot(active&&screen.max===0?{fraction:initial.current}:{y:positions[slot]},active&&screen.max===0?searchHit:undefined)}
    onLoadEnd={()=>pageRefs.current.get(identity)?.injectJavaScript(annotationScript())} menuItems={[{key:'word',label:'查词'},{key:'translate',label:'翻译'},{key:'mark',label:'标记'}]}
    onCustomMenuSelection={e=>ref.current?.injectJavaScript(`window.qrReader.choose(${JSON.stringify(e.nativeEvent.key)});window.getSelection().removeAllRanges();true;`)}
    onMessage={e=>{try{const data=JSON.parse(e.nativeEvent.data);if(data.documentSection!==documentSection.current)return;if(data.type==='qr-screen-ready'){setReady(old=>old[identity]?old:{...old,[identity]:true});if(active&&Number.isFinite(data.y)&&Number.isFinite(data.max)&&Number.isFinite(data.step))setScreen(old=>old.y===data.y&&old.max===data.max&&old.step===data.step?old:{...old,y:data.y,max:data.max,step:data.step});return;}if(!active||interacting.current)return;if(data.type==='qr-turn-settled'){paper.settle();return;}if(data.type==='qr-toggle-ui'){onToggleChrome?.();return;}if(data.type==='qr-paragraph-state'&&Number.isInteger(data.id)&&data.id>=0&&data.id<paragraphs.length&&data.state){syncParagraph(data.id,data.state);return;}if(data.type==='qr-paragraph'){void translateParagraph(data.id);return;}if(data.type==='qr-selection-ready'){setSelectionTop(data.toolbarTop??8);setSelected(data);return;}if(data.type==='qr-selection-state'&&!data.active){setSelected(null);return;}if(data.type==='qr-progress'&&ready[identity]&&Number.isFinite(data.value)){initial.current=Math.max(0,Math.min(1,data.value));progress.current(initial.current);return;}if(data.type==='qr-turn'&&(data.direction===1||data.direction===-1)){turn(data.direction);return;}if(data.type==='qr-boundary'&&(data.direction===1||data.direction===-1)){paper.settle(false);onBoundary(data.direction);return;}if(data.type==='qr-selection'&&typeof data.targetText==='string'&&typeof data.previousContext==='string'&&typeof data.followingContext==='string')onSelection(data);}catch{/* Ignore malformed bridge events. */}}}/>;
  };
  return <View style={{flex:1,overflow:'hidden'}}><NativePageStack onBoundary={d=>{if((d===1&&screen.y>=screen.max-2&&pageWindow?.next)||(d===-1&&screen.y<=2&&pageWindow?.previous))onBoundary(d);}} controllerRef={stackRef} animate={settings.pageAnimation} pageIds={ids} pageKey={ids.current} previousReady={positions.previous!==screen.y&&Boolean(ready[ids.previous])} nextReady={positions.next!==screen.y&&Boolean(ready[ids.next])} enabled={!keysBlocked&&!selected&&settings.readingMode==='swipe'} onTurn={d=>{const y=d===1?positions.next:positions.previous;setScreen({...screen,id:d===1?ids.next:ids.previous,y});initial.current=y/Math.max(1,screen.max);progress.current(initial.current);}} onInteraction={active=>{interacting.current=active;ref.current?.injectJavaScript(`window.qrInteractionBlocked=${active||keysBlocked};window.qrReader?.cancelPendingSelection();true;`);}} renderPage={renderScreen}/>{paper.overlay}<MarkStatus error={marksError} retry={retryMarks}/>{selected?<View style={{position:'absolute',top:selectionTop,left:8,right:8,zIndex:30,backgroundColor:colors.surface,padding:6,borderRadius:12}}><SentenceActions key={JSON.stringify(selected)} bookId={bookId} selection={selected} onTranslate={()=>{onSelection({...selected,mode:'translate'});}} onMore={()=>onSelection({...selected,action:'mark'})} onClose={()=>{ref.current?.injectJavaScript('getSelection().removeAllRanges();true;');setSelected(null);}}/></View>:null}{settings.readingMode==='tap'&&!selected?<TapEdges onTurn={turn}/>:null}</View>;
}
