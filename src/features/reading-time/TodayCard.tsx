import {useCallback,useState} from 'react';
import {Pressable,Text} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {useSQLiteContext} from 'expo-sqlite';
import {useSettings} from '../settings/SettingsProvider';
import {readingSummary} from './repository';
import {localDay,readingStreak} from './model';
export function TodayCard(){
 const db=useSQLiteContext(),{colors}=useSettings();const [label,setLabel]=useState('今日阅读 · 开始专注');
 useFocusEffect(useCallback(()=>{let alive=true;void readingSummary(db).then(data=>{if(alive)setLabel(`今日 ${Math.floor((data.days.find(d=>d.day===localDay(Date.now()))?.milliseconds??0)/60000)} 分钟 · 连续 ${readingStreak(data.checkins.map(d=>d.day))} 天`);}).catch(()=>{if(alive)setLabel('阅读记录 · 点击重试');});return()=>{alive=false;};},[db]));
 return <Pressable accessibilityRole="button" accessibilityLabel="今日阅读与番茄钟" onPress={()=>router.push('/reading-log')} style={{padding:12,borderRadius:12,backgroundColor:colors.surface}}><Text style={{color:colors.text,fontSize:13}}>{label}　›</Text></Pressable>;
}
