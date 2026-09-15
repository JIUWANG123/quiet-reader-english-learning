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
// Exercise the real animation hook with native boundaries simulated. This checks
// waiting, direction, single-flight and image cleanup, not Android frame timing.
(async()=>{
 const refs=[],states=[],effects=[];let index=0,paper,rendering=false,renderAgain=false;
 const released=[],motions=[];let captures=0,navigated=0;
 const React={useRef:value=>{const i=index++;return refs[i]??(refs[i]={current:value})},useState:value=>{const i=index++;if(!(i in states))states[i]=value;return[states[i],next=>{states[i]=next;render()}]},useEffect:(fn)=>{const i=index++;if(!refs[i]){refs[i]={current:true};effects.push(fn())}}};
 const native={View:'View',Image:'Image',Platform:{OS:'android'},AccessibilityInfo:{isReduceMotionEnabled:async()=>false,addEventListener:()=>({remove(){}})},Easing:{out:x=>x,cubic:'cubic'},Animated:{View:'AnimatedView',Value:class{setValue(v){this.value=v}stopAnimation(){}},timing:(value,config)=>({start:done=>{motions.push(config);setTimeout(()=>done({finished:true}),1)}})}};
 const out={};const source=ts.transpileModule(fs.readFileSync('src/features/reader/PaperTurn.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 new Function('require','exports',source)(name=>name==='react'?React:name==='react-native'?native:name==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:name==='react-native-view-shot'?{captureRef:async()=>`file:shot-${++captures}`,releaseCapture:uri=>released.push(uri)}:requireOriginal(name),out);
 function render(){if(rendering){renderAgain=true;return;}rendering=true;index=0;paper=out.usePaperTurn(true,'#191E1C');rendering=false;if(paper.overlay)setImmediate(()=>paper.overlay?.props.children.props.onLoad());if(renderAgain){renderAgain=false;render();}}
 render();paper.onLayout({nativeEvent:{layout:{width:390}}});
 const forward=paper.turn(1,()=>{navigated++});await new Promise(r=>setTimeout(r,20));
 assert.equal(navigated,1);assert.ok(paper.overlay,'old page covers pending layout');assert.equal(motions.length,0);
 await paper.turn(1,()=>{navigated++});assert.equal(navigated,1,'rapid turn is single-flight');
 paper.settle();await forward;assert.equal(motions[0].toValue,-414);assert.equal(motions[0].useNativeDriver,true);assert.equal(paper.overlay,null);assert.equal(released.length,1);
 const reverse=paper.turn(-1,()=>{navigated++});await new Promise(r=>setTimeout(r,20));paper.settle();await reverse;assert.equal(motions[1].toValue,414);
 const boundary=paper.turn(1,()=>{});await new Promise(r=>setTimeout(r,20));paper.settle(false);await boundary;assert.equal(motions.length,2,'boundary does not animate a fake turn');assert.equal(released.length,3);
 effects.forEach(dispose=>dispose?.());console.log('PASS: actual CJS/ESM gesture bypass; native hook waits for layout, serializes, slides both ways, skips boundary and releases snapshots');
})().catch(error=>{console.error(error);process.exitCode=1});
