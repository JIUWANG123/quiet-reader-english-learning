import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '../../components/ui';
import { requestAssistance } from '../../services/ai/service';
import { resultFields, type AIRequest } from '../../services/ai/provider';
import { useSettings } from '../settings/SettingsProvider';

export function InlineAssistance({ request, autoStart=false,onResult }: { request: AIRequest; autoStart?:boolean;onResult?:(translation:string)=>void }) {
  const db = useSQLiteContext(); const { colors } = useSettings();
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const [failed,setFailed]=useState(false);
  const generation = useRef(0);
  const controller=useRef<AbortController|null>(null);const locked=useRef(false);
  const identity = JSON.stringify(request);
  // Only sentence UI opened by an explicit translation action opts into autoStart.
  useEffect(() => { generation.current++;locked.current=false;setText('');setFailed(false); setBusy(false);if(autoStart)void run(); return () => { generation.current++;controller.current?.abort(); }; }, [identity,autoStart]);
  async function run() {
    if(locked.current)return;locked.current=true;controller.current=new AbortController();
    const current = ++generation.current; setBusy(true);setFailed(false);
    try {
      const result = await requestAssistance(db, request,controller.current.signal);
      if (current !== generation.current) return;
      if(typeof result.value.translation==='string')onResult?.(result.value.translation);
      const lines = resultFields(request.mode).map(key => result.value[key]).filter(value => typeof value === 'string');
      setText((result.cached ? '本地缓存\n' : '') + (lines.join('\n\n') || '返回格式不符合预期，请重试。'));
    } catch (e) { if (current === generation.current){setFailed(true);setText(e instanceof Error ? e.message : '网络请求失败，请重试。');} }
    finally { if (current === generation.current){setBusy(false);locked.current=false;} }
  }
  return <View style={{gap: 10, marginTop: 8}}>{(!autoStart||failed)?<Button label={busy ? '正在理解…' : failed?'重试':request.mode==='word' ? '✦ 本文含义' : '✦ 翻译与解释'} disabled={busy} onPress={() => { void run(); }} />:null}{busy ? <Button label="正在理解 · 取消" onPress={()=>controller.current?.abort()} /> : null}{text ? <View style={{padding:14,borderLeftWidth:2,borderLeftColor:colors.accent,backgroundColor:colors.surface,borderRadius:10}}><Text selectable style={{color: colors.text, lineHeight: 23}}>{text}</Text></View> : null}</View>;
}
