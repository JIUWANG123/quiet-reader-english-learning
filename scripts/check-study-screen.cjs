const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require('C:/Users/Ciel Li/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
require.extensions['.ts']=require.extensions['.js'];require.extensions['.tsx']=require.extensions['.js'];
const root=process.cwd();const sources={},ids=new Map();
const mocks={
 'react-native':`const R=require('react');const wrap=t=>({children,...p})=>R.createElement(t,{},children);exports.View=wrap('div');exports.Text=wrap('span');exports.ScrollView=wrap('div');exports.Modal=({visible,children})=>visible?R.createElement('div',{},children):null;exports.Pressable=({children,onPress,accessibilityLabel,disabled})=>R.createElement('button',{onClick:onPress,'aria-label':accessibilityLabel,disabled},children);exports.ActivityIndicator=()=>R.createElement('span',{},'loading');exports.TextInput=({value,onChangeText,accessibilityLabel})=>R.createElement('input',{value,onChange:e=>onChangeText(e.target.value),'aria-label':accessibilityLabel});`,
 'react-native-safe-area-context':`exports.SafeAreaView=require('react-native').View;`,
 'expo-router':`exports.useLocalSearchParams=()=>({});exports.useFocusEffect=fn=>require('react').useEffect(fn,[fn]);`,
 'expo-sqlite':`const db={execAsync:(sql)=>window.sql('exec',[sql]),getFirstAsync:(...a)=>window.sql('get',a),getAllAsync:(...a)=>window.sql('all',a),runAsync:(...a)=>window.sql('run',a),withExclusiveTransactionAsync:async fn=>{await window.sql('exec',['BEGIN']);try{await fn(db);await window.sql('exec',['COMMIT'])}catch(e){await window.sql('exec',['ROLLBACK']);throw e}}};exports.useSQLiteContext=()=>db;`,
 'expo-crypto':`exports.randomUUID=()=>String(Math.random());`,
 'expo-speech':`exports.stop=async()=>{};exports.speak=word=>{window.spoken=word};`,
 'lucide-react-native':`module.exports=new Proxy({},{get:()=>()=>null});`,
 ai:`exports.requestAssistance=async()=>{window.aiRequests=(window.aiRequests||0)+1;throw Error('No API configured')};`,
 settings:`exports.useSettings=()=>({colors:{}});`,
 dictionary:`const provider={forms:async()=>['take','taken','took']};exports.useDictionary=()=>({provider});`,
 ui:`const R=require('react');exports.styles={};exports.Panel=({children})=>R.createElement('section',{},children);exports.Button=({label,onPress,disabled})=>R.createElement('button',{onClick:onPress,disabled},label);`
};
function moduleId(name,parent){
 let key;if(mocks[name])key=name;else if(name.endsWith('services/ai/service'))key='ai';else if(name.includes('SettingsProvider'))key='settings';else if(name.includes('DictionaryContext'))key='dictionary';else if(name.endsWith('components/ui'))key='ui';else key=require.resolve(name,{paths:[path.dirname(parent||path.join(root,'index.js'))]});
 if(ids.has(key))return ids.get(key);const id=ids.size;ids.set(key,id);
 let code=mocks[key]??fs.readFileSync(key,'utf8');
 if(/\.tsx?$/.test(key))code=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 code=code.replace(/require\(['"]([^'"]+)['"]\)/g,(_,dep)=>`require(${moduleId(dep,key.startsWith(root)?key:parent)})`);
 sources[id]=code;return id;
}
async function main(){
 const browser=await chromium.launch({headless:true,channel:'msedge'});const db=new DatabaseSync(':memory:');
 try{
 const schemaCode=ts.transpileModule(fs.readFileSync('src/db/schema.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const output={};new Function('exports',schemaCode)(output);db.exec(output.schema);
 for(const [word,meaning,sentence] of [['take','拿','She had taken it.'],['tooth','牙齿','A tooth hurt.'],['apple','苹果','An apple fell.']])db.prepare('INSERT INTO vocabulary(word,lemma,translation,source_text,created_at) VALUES(?,?,?,?,?)').run(word,word,meaning,sentence,word==='take'?1:2);
 let failStats=false,failDraft=true;
 const page=await browser.newPage();page.on('pageerror',e=>console.error('PAGE:',e.message));await page.exposeFunction('sql',(method,args)=>{const [sql,...params]=args;if(failDraft&&sql.startsWith('UPDATE study_sessions SET state=')&&JSON.parse(params[0]).draft){failDraft=false;throw Error('temporary draft failure');}if(failStats&&sql.includes('count(*) attempts')){failStats=false;throw Error('stats failed');}if(method==='exec')return db.exec(sql);const stmt=db.prepare(sql);if(method==='run'){stmt.run(...params);return null;}return stmt[method](...params)??null;});
 const study=moduleId(path.join(root,'src/app/study.tsx'));const react=moduleId('react');const dom=moduleId('react-dom/client');
 const bundle=`var process={env:{NODE_ENV:'production'}};var modules={${Object.entries(sources).map(([id,code])=>`${id}:function(require,module,exports){${code}\n}`).join(',')}};var cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](require,m,m.exports);return m.exports}var root=require(${dom}).createRoot(document.getElementById('app'));window.mount=()=>root.render(require(${react}).createElement(require(${study}).default));window.unmount=()=>root.render(null);mount();`;
 await page.setContent('<div id="app"></div>');await page.addScriptTag({content:bundle});
 await page.getByRole('button',{name:'开始 5 词',exact:true}).click();
 await page.getByText('先认识这个词',{exact:true}).waitFor();
 assert.equal(db.prepare('SELECT count(*) n FROM study_admissions').get().n,3);
 await page.getByRole('button',{name:'开始练习',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'拿',exact:true}).count(),0);
 await page.getByRole('button',{name:'重试保存题目',exact:true}).click();
 for(let i=0;i<100;i++){
  if(JSON.parse(db.prepare("SELECT state FROM study_sessions WHERE id='current'").get().state).draft)break;
  await new Promise(resolve=>setTimeout(resolve,30));
 }
 const initialDraft=JSON.parse(db.prepare("SELECT state FROM study_sessions WHERE id='current'").get().state).draft;
 assert.ok(initialDraft,'unrevealed question must be persisted');
 await page.evaluate(()=>window.unmount());await page.waitForFunction(()=>document.getElementById('app').textContent==='');
 await page.evaluate(()=>window.mount());await page.getByRole('button',{name:'继续本组',exact:true}).click();
 assert.deepEqual(JSON.parse(db.prepare("SELECT state FROM study_sessions WHERE id='current'").get().state).draft,initialDraft);
 await page.getByRole('button',{name:'展开选项',exact:true}).click();
 await page.getByRole('button',{name:'拿',exact:true}).click();
 await page.getByText('回答正确',{exact:true}).waitFor();
 assert.equal(db.prepare('SELECT count(*) n FROM review_log').get().n,0);
 await page.evaluate(()=>window.unmount());await page.waitForFunction(()=>document.getElementById('app').textContent==='');
 await page.evaluate(()=>window.mount());
 await page.getByRole('button',{name:'继续本组',exact:true}).click();
 await page.getByText('回答正确',{exact:true}).waitFor();
 failStats=true;
 await page.getByRole('button',{name:'继续',exact:true}).click();
 await page.getByText('结果保存失败，答案已保留，请重试保存。',{exact:true}).waitFor();
 assert.ok((await page.locator('section').innerText()).includes('take'));
 await page.getByRole('button',{name:'继续',exact:true}).click();
 await page.getByText('先认识这个词',{exact:true}).waitFor();
 assert.equal(db.prepare('SELECT count(*) n FROM review_log').get().n,0);
 assert.equal(JSON.parse(db.prepare("SELECT state FROM study_sessions WHERE id='current'").get().state).words.take.practiceCorrect,1);
 await page.getByRole('button',{name:'撤销上一题',exact:true}).click();
 await page.getByText('回答正确',{exact:true}).waitFor();
 assert.equal(db.prepare('SELECT count(*) n FROM review_log').get().n,0);
 assert.equal(await page.evaluate(()=>window.aiRequests||0),0);
 // Inject a transient keystroke failure on a restored spelling question.
 await page.evaluate(()=>window.unmount());
 const spelling=JSON.parse(db.prepare("SELECT state FROM study_sessions WHERE id='current'").get().state);
 spelling.draft={mode:'spelling',input:'',revealed:false,correct:null,answer:'take',prompt:'拿',choices:[]};
 db.prepare("UPDATE study_sessions SET state=? WHERE id='current'").run(JSON.stringify(spelling));
 await page.evaluate(()=>window.mount());await page.getByRole('button',{name:'继续本组',exact:true}).click();
 failDraft=true;
 await page.getByRole('textbox',{name:'英文答案'}).fill('take');
 await page.getByText('输入尚未保存，请重试。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'检查答案',exact:true}).click();
 await page.getByText('回答正确',{exact:true}).waitFor();
 assert.equal(JSON.parse(db.prepare("SELECT state FROM study_sessions WHERE id='current'").get().state).draft.input,'take');
 console.log('PASS: explicit start, new-word recognition, unrevealed/revealed restore, draft failure retry, spelling failure retry, no premature settlement, failed-statistics retry, undo; no automatic AI (native UI mocked, real SQLite).');
 }finally{await browser.close();db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
