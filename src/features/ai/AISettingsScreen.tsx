import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import {Sparkles, ShieldCheck} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Panel } from '../../components/ui';
import { defaultAIConfig, loadAIConfig, saveAIConfig } from '../../services/ai/config';
import { useSettings } from '../settings/SettingsProvider';

export default function AISettingsScreen() {
  const { colors } = useSettings(); const [apiKey,setApiKey]=useState(''); const [baseUrl,setBaseUrl]=useState(defaultAIConfig.baseUrl); const [model,setModel]=useState(defaultAIConfig.model); const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true),[editing,setEditing]=useState(false),[configured,setConfigured]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;void loadAIConfig().then(v=>{if(!active)return;setApiKey(v.apiKey);setBaseUrl(v.config.baseUrl);setModel(v.config.model);setConfigured(Boolean(v.apiKey));setEditing(!v.apiKey);}).catch(()=>{if(active){setError('无法读取连接设置，请重新打开此页面。');setEditing(true);}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false;};},[]);
  const input={borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,color:colors.text,backgroundColor:colors.background};
  return <SafeAreaView edges={['bottom']} style={{flex:1,backgroundColor:colors.background}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,gap:24}}>
    <View style={{gap:12}}><Sparkles size={30} color={colors.accent}/><Text style={{color:colors.text,fontSize:26,fontWeight:'600'}}>读不懂时，帮你一点</Text><Text style={{color:colors.muted,lineHeight:22}}>只在你主动请求时联网，普通查词免费离线使用。</Text></View>
    {loading?<ActivityIndicator color={colors.accent}/>:<Panel><View style={{flexDirection:'row',alignItems:'center',gap:10}}><ShieldCheck size={20} color={colors.accent}/><Text style={{color:colors.text,fontWeight:'600'}}>{configured?'已配置':'尚未配置'}</Text></View>
    {editing?<>
      <Text style={{color:colors.muted}}>API Key</Text><TextInput accessibilityLabel="API Key" secureTextEntry editable={!busy} value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} style={input}/>
      <Text style={{color:colors.muted}}>Base URL</Text><TextInput accessibilityLabel="Base URL" editable={!busy} value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input}/>
      <Text style={{color:colors.muted}}>模型</Text><TextInput accessibilityLabel="模型名称" editable={!busy} value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} style={input}/>
      <Button primary disabled={busy||!apiKey.trim()||!model.trim()} label={busy?'保存中…':'保存连接'} onPress={()=>{setBusy(true);setError('');void saveAIConfig(apiKey,{baseUrl:baseUrl.trim(),model:model.trim(),temperature:.2}).then(()=>{setConfigured(true);setEditing(false)}).catch(()=>setError('保存失败，请重试。')).finally(()=>setBusy(false));}}/>
    </>:<><Text style={{color:colors.text,fontSize:20}}>{model}</Text><Text numberOfLines={2} style={{color:colors.muted}}>{baseUrl}</Text><Button label="修改配置" onPress={()=>setEditing(true)}/></>}
    {error?<Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text>:null}
    </Panel>}
    <Text style={{color:colors.muted,fontSize:12,lineHeight:20}}>密钥保存在系统安全存储中。已配置表示设置已保存，不代表已验证网络连接。</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
