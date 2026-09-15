import {useCallback,useState} from 'react';
import {ScrollView,Text,View,Switch,TextInput} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useSQLiteContext} from 'expo-sqlite';
import {Button,Panel,styles} from '../components/ui';
import {useSettings} from '../features/settings/SettingsProvider';
import {useFocusTimer,focusLabel} from '../features/reading-time/FocusProvider';
import {readingSummary} from '../features/reading-time/repository';
import {localDay,focusPreferences} from '../features/reading-time/model';
export default function ReadingLog(){
 const db=useSQLiteContext(),{colors}=useSettings(),timer=useFocusTimer();const [data,setData]=useState<Awaited<ReturnType<typeof readingSummary>>|null>(null),[error,setError]=useState('');
 const load=useCallback(()=>{void readingSummary(db).then(setData).catch(()=>setError('记录读取失败'));},[db]);useFocusEffect(load);
 const minutes=(ms:number)=>Math.floor(ms/60000);const today=data?.days.find(d=>d.day===localDay(Date.now()))?.milliseconds??0;
 return <ScrollView contentContainerStyle={{padding:20,gap:16}}>
 <Panel><Text style={{color:colors.text,fontSize:26}}>今日 {minutes(today)} 分钟</Text><Text style={{color:colors.muted}}>{data?.checkins.some(d=>d.day===localDay(Date.now()))?'今日已打卡':`阅读 ${timer.preferences.checkInMinutes} 分钟自动打卡`} · 累计 {minutes(data?.days.reduce((n,d)=>n+d.milliseconds,0)??0)} 分钟</Text></Panel>
 <Panel><Text style={{color:colors.text,fontSize:18}}>专注阅读</Text><Text style={{color:colors.text,fontSize:30}}>{timer.phase==='idle'?'准备开始':timer.phase==='done'?'本轮完成':focusLabel(timer.remaining)}</Text><View style={styles.row}><Button label="开始专注" onPress={()=>timer.start('focus')}/><Button label="休息" onPress={()=>timer.start('break')}/><Button label="结束" onPress={timer.stop}/></View>
 {(['minutes','breakMinutes','checkInMinutes'] as const).map((key,i)=><View key={key} style={styles.row}><Text style={{color:colors.muted,flex:1}}>{['专注分钟','休息分钟','打卡门槛'][i]}</Text><TextInput key={String(timer.preferences[key])+key} defaultValue={String(timer.preferences[key])} keyboardType="number-pad" accessibilityLabel={key} style={{color:colors.text,minWidth:60,padding:8}} onEndEditing={e=>{const n=Number(e.nativeEvent.text);if(n>0)void timer.update(focusPreferences({...timer.preferences,[key]:n}));}}/></View>)}
 <View style={styles.row}><Text style={{color:colors.text,flex:1}}>到时震动</Text><Switch value={timer.preferences.vibrate} onValueChange={v=>void timer.update({...timer.preferences,vibrate:v})}/></View><Text style={{color:colors.muted}}>到时不弹窗、不播放声音。后台不保证即时提醒，回到 App 后更新倒计时；休息不计阅读时长。</Text></Panel>
 <Panel><Text style={{color:colors.text}}>最近七天</Text>{Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);const day=localDay(d.getTime());return <Text key={day} style={{color:colors.muted}}>{day}　{minutes(data?.days.find(r=>r.day===day)?.milliseconds??0)} 分钟 {data?.checkins.some(r=>r.day===day)?'✓':''}</Text>;})}</Panel>
 <Panel><Text style={{color:colors.text}}>本月打卡</Text><View style={{flexDirection:'row',flexWrap:'wrap'}}>{Array.from({length:new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()},(_,i)=>{const d=new Date();d.setDate(i+1);const day=localDay(d.getTime()),done=data?.checkins.some(r=>r.day===day);return <Text key={day} accessibilityLabel={`${day}${done?'已打卡':'未打卡'}`} style={{width:'14.28%',textAlign:'center',paddingVertical:10,color:done?colors.accent:colors.muted}}>{i+1}{done?'✓':''}</Text>;})}</View></Panel>
 <Panel><Text style={{color:colors.text}}>按书统计</Text>{data?.books.map(b=><Text key={b.book_id} style={{color:colors.muted}}>{b.title} · {minutes(b.milliseconds)} 分钟</Text>)}</Panel>
 {error||timer.error?<><Text style={{color:colors.text}}>{error||timer.error}</Text><Button label="重试" onPress={load}/></>:null}
 </ScrollView>;
}
