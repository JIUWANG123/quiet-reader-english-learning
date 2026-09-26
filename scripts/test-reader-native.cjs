const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const requireOriginal=require;
const fakeGesture=new Proxy({},{get:(_t,name)=>name==='Exclusive'?()=>({}):()=>fakeGesture});
for(const format of ['commonjs','module']){
 const exports={};let source=fs.readFileSync(`node_modules/@epubjs-react-native/core/lib/${format}/utils/GestureHandler.js`,'utf8');
 if(format==='module')source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,allowJs:true}}).outputText;
 new Function('require','exports',source)(name=>name==='react'?{createElement:(type,props,...children)=>({type,props,children})}:name==='react-native'?{View:'NativeView',Platform:{OS:'android'},I18nManager:{isRTL:false}}:{Gesture:fakeGesture,Directions:{},GestureHandlerRootView:'GestureRoot',GestureDetector:'GestureDetector'},exports);
 assert.equal(exports.GestureHandler({enabled:false,width:390,height:800,children:'WebView'}).type,'NativeView',format+' must not install Fling when disabled');
 assert.equal(exports.GestureHandler({enabled:true,width:390,height:800,children:'WebView'}).type,'GestureRoot');
}

// Current PaperTurn owns only navigation serialization; native three-page stack
// owns visual motion. Exercise the hook, including delayed/failed navigation.
(async()=>{const refs=[],effects=[];let index=0;const react={useRef:v=>refs[index++]??(refs[index-1]={current:v}),useState:v=>[v,()=>{}],useEffect:fn=>effects.push(fn())};const native={AccessibilityInfo:{isReduceMotionEnabled:async()=>false,addEventListener:()=>({remove(){}})}};const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync('src/features/reader/PaperTurn.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(n=>n==='react'?react:n==='react-native'?native:require(n),out);
const paper=out.usePaperTurn(true,'#fff');let calls=0;const pending=paper.turn(1,()=>{calls++;});assert.equal(calls,1);assert.equal(paper.busy.current,true);await paper.turn(-1,()=>{calls++;});assert.equal(calls,1);assert.equal(paper.overlay,null);paper.settle();await pending;assert.equal(paper.busy.current,false);await paper.turn(-1,()=>{throw Error('navigation failed');});assert.equal(paper.busy.current,false);const reverse=paper.turn(-1,()=>calls++);paper.settle(false);await reverse;assert.equal(calls,2);effects.forEach(fn=>fn?.());console.log('PASS: native gesture bypass and PaperTurn immediate navigation, single-flight, settle/cancel/error release');})().catch(error=>{console.error(error);process.exitCode=1});
