const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('C:/Users/Ciel Li/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
require.extensions['.ts']=require.extensions['.js'];require.extensions['.tsx']=require.extensions['.js'];
const root=process.cwd();const sources={},ids=new Map();
const mocks={
 'react-native':`const R=require('react');const wrap=t=>({children,...p})=>R.createElement(t,{},children);exports.View=wrap('div');exports.Text=wrap('span');exports.ScrollView=wrap('div');exports.ActivityIndicator=()=>R.createElement('span',{},'loading');exports.TextInput=({value,onChangeText,accessibilityLabel})=>R.createElement('input',{value,onChange:e=>onChangeText(e.target.value),'aria-label':accessibilityLabel});`,
 'react-native-safe-area-context':`exports.SafeAreaView=require('react-native').View;`,
 'expo-router':`exports.useFocusEffect=fn=>require('react').useEffect(fn,[fn]);`,
 'expo-sqlite':`const db={getFirstAsync:(...a)=>window.sql('get',a),getAllAsync:(...a)=>window.sql('all',a),runAsync:(...a)=>window.sql('run',a),withExclusiveTransactionAsync:async fn=>{await window.sql('exec',['BEGIN']);try{await fn(db);await window.sql('exec',['COMMIT'])}catch(e){await window.sql('exec',['ROLLBACK']);throw e}}};exports.useSQLiteContext=()=>db;`,
 'expo-crypto':`exports.randomUUID=()=>String(Math.random());`,
 'expo-speech':`exports.stop=async()=>{};exports.speak=word=>{window.spoken=word};`,
 settings:`exports.useSettings=()=>({colors:{}});`,
 dictionary:`const provider={forms:async()=>['take','taken','took']};exports.useDictionary=()=>({provider});`,
 ui:`const R=require('react');exports.styles={};exports.Panel=({children})=>R.createElement('section',{},children);exports.Button=({label,onPress,disabled})=>R.createElement('button',{onClick:onPress,disabled},label);`
};
function moduleId(name,parent){
 let key;if(mocks[name])key=name;else if(name.includes('SettingsProvider'))key='settings';else if(name.includes('DictionaryContext'))key='dictionary';else if(name.endsWith('components/ui'))key='ui';else key=require.resolve(name,{paths:[path.dirname(parent||path.join(root,'index.js'))]});
 if(ids.has(key))return ids.get(key);const id=ids.size;ids.set(key,id);
 let code=mocks[key]??fs.readFileSync(key,'utf8');
 if(/\.tsx?$/.test(key))code=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 code=code.replace(/require\(['"]([^'"]+)['"]\)/g,(_,dep)=>`require(${moduleId(dep,key.startsWith(root)?key:parent)})`);
 sources[id]=code;return id;
}

mocks['react-native'] += "exports.Platform={OS:'android'};exports.AppState={currentState:'active',addEventListener:(name,fn)=>{window.onAppState=fn;return {remove:()=>window.onAppState=null}}};";
mocks.expo="const listeners=new Set();window.emitKey=direction=>listeners.forEach(fn=>fn({direction}));exports.requireOptionalNativeModule=()=>({setEnabled:value=>window.keysEnabled=value,addListener:(_,fn)=>{listeners.add(fn);return {remove:()=>listeners.delete(fn)}}});";
mocks.entry="const R=require('react');const {useVolumePageTurn}=require('./src/features/reader/useVolumePageTurn');exports.default=()=>{const [enabled,setEnabled]=R.useState(true);window.setAllowed=setEnabled;useVolumePageTurn(enabled,d=>{window.turns=(window.turns||[]).concat(d)});return R.createElement('div',{},'reader')};";
async function main(){
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const entry=moduleId('entry',root+'/index.js'),react=moduleId('react'),dom=moduleId('react-dom/client');
  const page=await browser.newPage();await page.setContent('<div id="app"></div>');
  const bundle='var process={env:{NODE_ENV:"production"}};var modules={'+Object.entries(sources).map(([id,code])=>id+':function(require,module,exports){'+code+'\n}').join(',')+'};var cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](require,m,m.exports);return m.exports}var root=require('+dom+').createRoot(document.getElementById("app"));root.render(require('+react+').createElement(require('+entry+').default));window.unmount=()=>root.unmount();';
  await page.addScriptTag({content:bundle});await page.waitForFunction(()=>window.keysEnabled===true);
  await page.evaluate(()=>{emitKey(1);emitKey(-1);});assert.deepEqual(await page.evaluate(()=>turns),[1,-1]);
  await page.evaluate(()=>setAllowed(false));await page.waitForFunction(()=>keysEnabled===false);
  await page.evaluate(()=>emitKey(1));assert.deepEqual(await page.evaluate(()=>turns),[1,-1]);
  await page.evaluate(()=>setAllowed(true));await page.waitForFunction(()=>keysEnabled===true);
  await page.evaluate(()=>onAppState('background'));assert.equal(await page.evaluate(()=>keysEnabled),false);
  await page.evaluate(()=>onAppState('active'));assert.equal(await page.evaluate(()=>keysEnabled),true);
  await page.evaluate(()=>unmount());assert.equal(await page.evaluate(()=>keysEnabled),false);
  console.log('PASS: volume key hook enables only allowed foreground reading; blocked overlays reject events; background/unmount release native key interception (native module mocked).');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
