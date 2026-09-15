import {BookRecords} from '../../src/features/reader/BookRecords';
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SettingsProvider,useSettings} from '../../src/features/settings/SettingsProvider';
import Library from '../../src/features/library/LibraryScreen';
import Vocabulary from '../../src/features/vocabulary/VocabularyScreen';
import Settings from '../../src/features/settings/SettingsScreen';
import Me from '../../src/app/me';
import AI from '../../src/features/ai/AISettingsScreen';
import Stats from '../../src/app/stats';
function Preview(){const [route,setRoute]=useState(new URLSearchParams(location.search).get('screen')||'/');const {update}=useSettings();useEffect(()=>{update({theme:new URLSearchParams(location.search).get('theme')==='dark'?'dark':'paper',fontSize:new URLSearchParams(location.search).get('large')==='1'?32:21});const fn=(e:any)=>setRoute(e.detail);window.addEventListener('preview-route',fn);return()=>window.removeEventListener('preview-route',fn)},[]);return <><nav><span>实际组件预览 · 示例数据</span><button onClick={()=>setRoute('/')}>书架</button><button onClick={()=>setRoute('/vocabulary')}>单词</button><button onClick={()=>setRoute('/me')}>我的</button><button onClick={()=>update({theme:'paper'})}>米白</button><button onClick={()=>update({theme:'dark'})}>深色</button></nav><main style={{width:new URLSearchParams(location.search).get('width')==='320'?320:390}}>{route==='/records'?<BookRecords bookId="one"/>:route==='/vocabulary'?<Vocabulary/>:route==='/settings'?<Settings/>:route==='/ai-settings'?<AI/>:route==='/stats'?<Stats/>:route==='/me'?<Me/>:<Library/>}</main></>}
createRoot(document.getElementById('root')!).render(<SettingsProvider><Preview/></SettingsProvider>);
