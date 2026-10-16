import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import {Sparkles, ShieldCheck} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Panel } from '../../components/ui';
import { defaultAIConfig, loadAIConfig, saveAIConfig } from '../../services/ai/config';
import {testAIConnection} from '../../services/ai/provider';
import {probeAIHost} from '../../services/ai/networkProbe';
import {clearAIDiagnostics,recordAIDiagnostic,readAIDiagnosticEvents} from '../reader/diagnostics';
import type {AIDiagnosticEvent} from '../../services/ai/diagnosticsModel';
import { useSettings } from '../settings/SettingsProvider';

function diagnosticName(item:AIDiagnosticEvent){
  const mode=item.mode==='network_probe'?'网络探测':item.mode==='connection_test'?'API 请求':item.mode==='mark_meaning'?'词义':item.mode==='chapter'?'段落翻译':item.mode==='word'?'单词翻译':'选句翻译';
  const stage=({dns:'DNS解析',tcp:'TCP连接',tls:'TLS握手',api_request:'等待API响应',response:'收到HTTP响应',parse_response:'解析响应',parse_json:'解析JSON',complete:'完成',cache:'本地缓存'} as Record<string,string>)[item.stage]??item.stage;
  return {mode,stage};
}

export default function AISettingsScreen() {
  const { colors } = useSettings(); const [apiKey,setApiKey]=useState(''); const [baseUrl,setBaseUrl]=useState(defaultAIConfig.baseUrl); const [model,setModel]=useState(defaultAIConfig.model); const [busy,setBusy]=useState(false),[testing,setTesting]=useState(false),[testResult,setTestResult]=useState('');const [aiEvents,setAIEvents]=useState<AIDiagnosticEvent[]>([]);
  const [loading,setLoading]=useState(true),[editing,setEditing]=useState(false),[configured,setConfigured]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;void loadAIConfig().then(v=>{if(!active)return;setApiKey(v.apiKey);setBaseUrl(v.config.baseUrl);setModel(v.config.model);setConfigured(Boolean(v.apiKey));setEditing(!v.apiKey);}).catch(()=>{if(active){setError('无法读取连接设置，请重新打开此页面。');setEditing(true);}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false;};},[]);
  const input={borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,color:colors.text,backgroundColor:colors.background};
  const runConnectionTest=async()=>{setTesting(true);const lines:string[]=[];setTestResult('准备测试连接…');const record=(entry:AIDiagnosticEvent)=>{recordAIDiagnostic(entry);if(entry.mode==='network_probe'){const label=({dns:'DNS 解析',tcp:'TCP 连接',tls:'TLS 握手'} as Record<string,string>)[entry.stage]??entry.stage;lines.push(`${label}${entry.event==='success'?'成功':'失败'} · ${entry.duration}ms${entry.error?` · ${entry.error}`:''}`);setTestResult(lines.join('\n'));}};try{const host=new URL(baseUrl.trim()).hostname;const network=await probeAIHost(host,record,stage=>setTestResult([...lines,stage].join('\n')));setTestResult(`${network}\n正在请求 DeepSeek API…`);const result=await testAIConnection(apiKey.trim(),{baseUrl:baseUrl.trim(),model:model.trim(),temperature:.2},recordAIDiagnostic);setTestResult(`${network}\nAPI 请求成功：${result}`);}catch(error){setTestResult(`${lines.join('\n')}${lines.length?'\n':''}${error instanceof Error?error.message:'连接测试失败。'}`);}finally{setAIEvents(readAIDiagnosticEvents());setTesting(false);}};
  return <SafeAreaView edges={['bottom']} style={{flex:1,backgroundColor:colors.background}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,gap:24}}>
    <View style={{gap:12}}><Sparkles size={30} color={colors.accent}/><Text style={{color:colors.text,fontSize:26,fontWeight:'600'}}>读不懂时，帮你一点</Text><Text style={{color:colors.muted,lineHeight:22}}>只在你主动请求时联网，普通查词免费离线使用。</Text></View>
    {loading?<ActivityIndicator color={colors.accent}/>:<Panel><View style={{flexDirection:'row',alignItems:'center',gap:10}}><ShieldCheck size={20} color={colors.accent}/><Text style={{color:colors.text,fontWeight:'600'}}>{configured?'已配置':'尚未配置'}</Text></View>
    {editing?<>
      <Text style={{color:colors.muted}}>API Key</Text><TextInput accessibilityLabel="API Key" secureTextEntry editable={!busy} value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} style={input}/>
      <Text style={{color:colors.muted}}>Base URL</Text><TextInput accessibilityLabel="Base URL" editable={!busy} value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input}/>
      <Text style={{color:colors.muted}}>模型</Text><TextInput accessibilityLabel="模型名称" editable={!busy} value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} style={input}/>
      <Button primary disabled={busy||!apiKey.trim()||!model.trim()} label={busy?'保存中…':'保存连接'} onPress={()=>{setBusy(true);setError('');void saveAIConfig(apiKey,{baseUrl:baseUrl.trim(),model:model.trim(),temperature:.2}).then(()=>{setConfigured(true);setEditing(false)}).catch(()=>setError('保存失败，请重试。')).finally(()=>setBusy(false));}}/>
      <Button disabled={testing||!apiKey.trim()||!model.trim()} label={testing?'正在测试…':'测试连接'} onPress={()=>void runConnectionTest()}/>
    </>:<><Text style={{color:colors.text,fontSize:20}}>{model}</Text><Text numberOfLines={2} style={{color:colors.muted}}>{baseUrl}</Text><Button label="测试连接" disabled={testing} onPress={()=>void runConnectionTest()}/><Button label="修改配置" onPress={()=>setEditing(true)}/></>}
    {testResult?<Text accessibilityRole="alert" style={{color:colors.text,lineHeight:22}}>{testResult}</Text>:null}
    {error?<Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text>:null}
    </Panel>}
    {!loading?<Panel><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{color:colors.text,fontSize:17}}>最近 AI 诊断</Text><Button label="清除" onPress={()=>{clearAIDiagnostics();setAIEvents([]);}}/></View>{aiEvents.length?aiEvents.slice().reverse().slice(0,10).map((item,index)=>{const name=diagnosticName(item);return <Text key={`${item.time}-${index}`} style={{color:colors.muted,lineHeight:21}}>{new Date(item.time).toLocaleString()} · {item.event==='success'?'成功':item.event==='failure'?'失败':'进行中'} · {name.mode} · {name.stage} · {item.duration}ms{item.status?` · HTTP ${item.status}`:''}{item.error?` · ${item.error}`:''}</Text>}):<Text style={{color:colors.muted}}>暂无 AI 请求记录。</Text>}<Text style={{color:colors.muted,fontSize:12}}>只保留最近 50 条状态；不记录 API Key、正文或响应内容。可在设置中导出 AI 诊断。</Text></Panel>:null}
    <Text style={{color:colors.muted,fontSize:12,lineHeight:20}}>密钥保存在系统安全存储中。已配置表示设置已保存，不代表已验证网络连接。</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
