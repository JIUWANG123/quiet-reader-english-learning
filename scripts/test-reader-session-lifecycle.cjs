const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),path=require('node:path');
function load(file){const out={};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',source)(out,require);return out;}
const pool=load('src/features/reader/epubPool.ts'),watchdog=load('src/features/reader/previewWatchdog.ts');
const hooks=[];let index=0,pending=[],clock=0;const timers=new Map();let serial=0;
const react={useRef:v=>hooks[index++]??(hooks[index-1]={current:v}),useState:v=>{const i=index++;if(!(i in hooks))hooks[i]=typeof v==='function'?v():v;return[hooks[i],next=>hooks[i]=typeof next==='function'?next(hooks[i]):next];},useMemo:f=>f(),useCallback:f=>f,useEffect:(f,deps)=>{const i=index++,old=hooks[i];if(!old||deps.some((x,j)=>x!==old.deps[j])){pending.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:f()};});}}};
const diagnostics=[],lifecycle=[],recovered=[],saved=[];let appStateCallback;
const settings={readingMode:'swipe',pageAnimation:true,paragraphTranslation:false,fontSize:20,lineHeight:1.8,margin:12};
const fileSystem={File:class{exists=true;uri='fixture';},Directory:class{},Paths:{document:'memory'}};
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
const modules={react,'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text',Modal:'Modal',ScrollView:'ScrollView',FlatList:'FlatList',ActivityIndicator:'ActivityIndicator',Alert:{alert(){}},AppState:{currentState:'active',addEventListener:(_,cb)=>{appStateCallback=cb;return{remove(){}};}},useWindowDimensions:()=>({width:400,height:800,fontScale:1})},'expo-file-system':fileSystem,'expo-sqlite':{useSQLiteContext:()=>({})},'../settings/SettingsProvider':{useSettings:()=>({settings,colors:{background:'#fff',text:'#000'},update(){}})},'./epubPool':pool,'./previewWatchdog':watchdog,'./NativePageStack':{NativePageStack:'Stack'},'./IsolatedEpubPage':{IsolatedEpubPage:'Page'},'./diagnostics':{traceReading:(event,detail)=>diagnostics.push({event,...detail})},'./readerLifecycle':Object.fromEntries(['startReaderSession','readyReaderSession','backgroundReaderSession','foregroundReaderSession','endReaderSession','recoverReaderSession','subscribeReaderMemoryPressure'].map(name=>[name,(...args)=>{lifecycle.push([name,...args]);return name==='startReaderSession'?'session-test':name==='subscribeReaderMemoryPressure'?()=>{}:undefined;}])),'./useMarks':{useMarks:()=>({marks:[],sentenceMarks:[],meaningsVisible:true,retry(){}})},'./PaperTurn':{usePaperTurn:()=>({overlay:null})}};
const source=ts.transpileModule(fs.readFileSync('src/features/reader/EpubReader.tsx','utf8')+'\nexport {EpubReaderSession};',{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const out={};const fallback=new Proxy({},{get:(_,name)=>name==='styles'?{row:{}}:()=>''});
class Clock extends Date{static now(){return clock;}}
new Function('exports','require','setTimeout','clearTimeout','setInterval','clearInterval','Date',source)(out,n=>modules[n]??fallback,(f)=>{timers.set(++serial,f);return serial;},id=>timers.delete(id),(f)=>{timers.set(++serial,f);return serial;},id=>timers.delete(id),Clock);
const props={preparedSource:'fixture',book:{id:'test',epub_location:'committed-cfi',progress:.4,file_name:'fixture'},onRecoverCommitted:(...args)=>recovered.push(args),onProgress:(...args)=>saved.push(args),onToggleChrome(){},onChapter(){},onLeave(){},onLookupWord(){},onMarkSentence(){}};
function find(tree,type){if(!tree)return;if(Array.isArray(tree)){for(const item of tree){const found=find(item,type);if(found)return found;}return;}if(tree.type===type)return tree;return find(tree.props?.children,type);}
let tree,stack;
function render(){index=0;pending=[];tree=out.EpubReaderSession(props);stack=find(tree,'Stack');for(const f of pending)f();return stack;}
const location=cfi=>({start:{cfi},end:{cfi}});
function page(slot){return stack.props.renderPage(slot);}
function paint(slot,cfi){const doc=page(slot);assert.ok(doc);doc.props.onWebViewMessage({type:'qr-page-painted',paintRevision:doc.props.navigationRevision,location:location(cfi),layoutEpoch:0});render();}
render();assert.equal(page('next'),null);paint('current','committed-cfi');assert.ok(page('next'));assert.equal(page('previous'),null);
const firstNext=page('next');firstNext.props.onWebViewMessage({type:'qr-preview-stage',stage:'navigation-start',revision:0});
clock=1814;for(const f of [...timers.values()])f();render();assert.equal(page('next').props.runtimeId,firstNext.props.runtimeId);assert.ok(diagnostics.some(e=>e.event==='preview-slow'));assert.equal(find(tree,'Modal').props.visible,false,'soft timeout cannot fail reader');
clock=2500;paint('next','neighbor');assert.ok(page('previous'));assert.equal(find(tree,'Modal').props.visible,false);
page('previous').props.onRenderProcessGone({nativeEvent:{didCrash:true}});render();assert.equal(find(tree,'Modal').props.visible,false);assert.equal(page('current').props.startupAnchor,'committed-cfi');assert.equal(recovered.length,0);
page('current').props.onRenderProcessGone({nativeEvent:{didCrash:false}});assert.deepEqual(recovered,[['committed-cfi',.4]]);assert.equal(saved.length,0,'unknown crash location must not be saved');
appStateCallback('background');render();assert.equal(page('next'),null);assert.equal(page('previous'),null);assert.ok(page('current'));
appStateCallback('active');render();assert.ok(page('next'));assert.equal(page('previous'),null);
console.log('PASS actual EpubReaderSession: cold serial mount, soft timeout retains instance, hidden renderer failure isolated, current committed recovery, background release and sequential resume');
