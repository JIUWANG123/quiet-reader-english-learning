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
 let key;if(mocks[name])key=name;else if(name.includes('SettingsProvider'))key='settings';else if(name.includes('DictionaryContext'))key='dictionary';else if(name.endsWith('components/ui'))key='ui';else if(name.endsWith('services/ai/service'))key='ai';else key=require.resolve(name,{paths:[path.dirname(parent||path.join(root,'index.js'))]});
 if(ids.has(key))return ids.get(key);const id=ids.size;ids.set(key,id);
 let code=mocks[key]??fs.readFileSync(key,'utf8');
 if(/\.tsx?$/.test(key))code=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 code=code.replace(/require\(['"]([^'"]+)['"]\)/g,(_,dep)=>`require(${moduleId(dep,key.startsWith(root)?key:parent)})`);
 sources[id]=code;return id;
}

mocks['react-native']+='exports.Modal=exports.View;exports.FlatList=({data,renderItem})=>R.createElement("div",{},data.map((item,index)=>R.createElement("div",{key:index},renderItem({item,index}))));';
mocks.ai='const cache=new Map();window.requests=[];window.pending=[];exports.requestAssistance=async(db,request,signal)=>{if(cache.has(request.targetText))return {value:{translation:cache.get(request.targetText)},cached:true};requests.push(request);return new Promise((resolve,reject)=>{const item={signal,resolve:()=>{cache.set(request.targetText,"译文 "+request.targetText);resolve({value:{translation:"译文 "+request.targetText},cached:false})}};pending.push(item);signal.addEventListener("abort",()=>reject(Error("cancelled")),{once:true});});};';
mocks.entry='const R=require("react"),Chapter=require("./src/features/ai/ChapterTranslation").ChapterTranslation;exports.default=()=>{const [text,setText]=R.useState(null),[open,setOpen]=R.useState(true);window.supply=setText;window.reopen=()=>setOpen(true);return open?R.createElement(Chapter,{chapter:{title:"Test",text},onClose:()=>setOpen(false)}):null};';
async function main(){const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const entry=moduleId('entry',root+'/index.js'),react=moduleId('react'),dom=moduleId('react-dom/client');
 const page=await browser.newPage();page.on('pageerror',e=>console.log(e.message));await page.setContent('<div id="app"></div>');
 const bundle='var process={env:{NODE_ENV:"production"}};var modules={'+Object.entries(sources).map(([id,code])=>id+':function(require,module,exports){'+code+'\n}').join(',')+'};var cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](require,m,m.exports);return m.exports}require('+dom+').createRoot(document.getElementById("app")).render(require('+react+').createElement(require('+entry+').default));';
 await page.addScriptTag({content:bundle});await page.getByRole('button',{name:'关闭译文',exact:true}).waitFor();assert.equal(await page.evaluate(()=>requests.length),0);
 await page.evaluate(()=>supply('He left.\n\nShe stayed.'));await page.waitForFunction(()=>requests.length===1);assert.equal(await page.evaluate(()=>requests[0].followingContext),'She stayed.');
 await page.evaluate(()=>pending[0].resolve());await page.waitForFunction(()=>requests.length===2);
 await page.getByRole('button',{name:'关闭译文',exact:true}).click();assert.equal(await page.evaluate(()=>pending[1].signal.aborted),true);
 await page.evaluate(()=>reopen());await page.waitForFunction(()=>requests.length===3);assert.equal(await page.evaluate(()=>requests[2].targetText),'She stayed.');
 await page.evaluate(()=>pending[2].resolve());await page.getByText('译文 She stayed.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>requests.length),3);
 console.log('PASS: chapter UI waits for text, translates sequentially with context, cancels on close and reuses completed cached passages on reopen (AI/network mocked).');
}finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
