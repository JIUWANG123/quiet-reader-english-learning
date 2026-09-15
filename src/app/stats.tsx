import {useCallback,useState} from 'react';
import {ActivityIndicator,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from 'expo-router';
import {useSQLiteContext} from 'expo-sqlite';
import {Button,Panel} from '../components/ui';
import {useSettings} from '../features/settings/SettingsProvider';
import {todayStats} from '../services/vocabulary/review';
export default function Stats(){
 const db=useSQLiteContext();const {colors}=useSettings();
 const [data,setData]=useState<(number|null)[]|null>(null);const [error,setError]=useState('');
 const [daily,setDaily]=useState<Awaited<ReturnType<typeof todayStats>>|null>(null);
 const load=useCallback(async()=>{
  setError('');
  const query=async(sql:string,...args:number[])=>{try{return (await db.getFirstAsync<{n:number}>(sql,...args))?.n??0}catch{setError('部分统计读取失败，请重试。');return null}};
  const results=await Promise.all([query('SELECT count(*) n FROM vocabulary'),query('SELECT count(*) n FROM vocabulary WHERE due_at<=?',Date.now()),query('SELECT count(*) n FROM vocabulary WHERE familiarity=3'),query('SELECT count(*) n FROM saved_sentences')]);
  setData(results);
  try{setDaily(await todayStats(db));}catch{setDaily(null);setError('复习记录读取失败，请重试。');}
 },[db]);
 useFocusEffect(useCallback(()=>{void load()},[load]));
 const rows:[string,number|string][]=[['生词总数',data?.[0]??'暂不可用'],['今日到期（含新词）',data?.[1]??'暂不可用'],['已掌握',data?.[2]??'暂不可用'],['收藏句子',data?.[3]??'暂不可用'],['今日学习词数',daily?.words??'暂不可用'],['今日答题次数',daily?.attempts??'暂不可用'],['今日正确率',daily?`${daily.attempts?Math.round(daily.correct/daily.attempts*100):0}%`:'暂不可用']];
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>{data===null?<ActivityIndicator color={colors.accent}/>:<ScrollView contentContainerStyle={{padding:22,gap:14}}><Text style={{fontSize:30,color:colors.text}}>学习统计</Text><Text style={{color:colors.muted}}>全部数据来自本机，不上传网络。正确率包含自评“熟悉 / 掌握”。</Text>{error?<><Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text><Button label="重新加载" onPress={()=>void load()}/></>:null}<View style={{flexDirection:"row",flexWrap:"wrap",gap:12}}>{rows.map(([label,value])=><Panel key={label} style={{width:"48%",minHeight:120}}><Text style={{color:colors.muted}}>{label}</Text><Text style={{fontSize:34,color:colors.text}}>{value}</Text></Panel>)}</View></ScrollView>}</SafeAreaView>;
}
