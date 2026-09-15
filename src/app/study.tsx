import {reinforce} from '../features/vocabulary/reinforcement';
import {SlidersHorizontal,Volume2,BookOpen} from 'lucide-react-native';
import {IconButton} from '../components/IconButton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {randomUUID} from 'expo-crypto';
import {useDictionary} from '../features/dictionary/DictionaryContext';
import {WordFilters} from '../features/vocabulary/WordFilters';
import {defaultFilters,filterWords,readPlan,savePlan,studyQueue,recordReview,todayStats,defaultPlan,type Filters} from '../services/vocabulary/review';
import * as Speech from 'expo-speech';
import { Button, Panel, styles } from '../components/ui';
import { listVocabulary, type VocabularyItem } from '../services/vocabulary/repository';
import { useSettings } from '../features/settings/SettingsProvider';
import { clozeSentence, quizChoices, sameAnswer } from '../features/vocabulary/quiz';

const modes = {cloze:'挖空', spelling:'拼写', choice:'英选中', reverse:'中选英', listening:'听音'};
type Mode = keyof typeof modes;
export default function StudyScreen() {
  const db = useSQLiteContext();
  const {provider}=useDictionary();
  const [showOptions,setShowOptions]=useState(false);
  const [details,setDetails]=useState(false);
  const [forms,setForms]=useState<string[]>([]);
  const [filters,setFilters]=useState<Filters>(defaultFilters);
  const [plan,setPlan]=useState(defaultPlan);
  const [daily,setDaily]=useState({attempts:0,correct:0,words:0,newWords:0,reviewWords:0});
  const attemptId=useRef(randomUUID());
  const missed=useRef(new Map<string,number>());
  const {colors} = useSettings();
  const [pool,setPool] = useState<VocabularyItem[]>([]);
  const [cards,setCards] = useState<VocabularyItem[]>([]);
  const [index,setIndex] = useState(0);
  const [mode,setMode] = useState<Mode>('cloze');
  const [input,setInput] = useState('');
  const [revealed,setRevealed] = useState(false);
  const [correct,setCorrect] = useState<boolean|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const saving = useRef(false);
  const reset = () => {setDetails(false);setInput('');setRevealed(false);setCorrect(null);};
  const load = useCallback(async () => {
    setLoading(true);setError('');
    try {
      const words = await listVocabulary(db);
      setPool(words);
      const savedPlan=await readPlan(db);setPlan(savedPlan);
      setDaily(await todayStats(db));
      setCards(await studyQueue(db,filterWords(words,filters),savedPlan));
      attemptId.current=randomUUID();
      missed.current.clear();setIndex(0);reset();
    } catch {setError('复习队列读取失败，请重试。');}
    finally {setLoading(false);}
  },[db,filters]);
  useFocusEffect(useCallback(()=>{void load();return ()=>{void Speech.stop();};},[load]));
  const card = cards[index];
  useEffect(()=>{let active=true;setForms([]);if(card&&provider)void provider.forms(card.lemma).then(values=>{if(active)setForms(values);}).catch(()=>{});return()=>{active=false;};},[card,provider]);
  async function updatePlan(next:typeof plan){if(saving.current)return;saving.current=true;setBusy(true);try{await savePlan(db,next);await load();}catch{setError('计划保存失败，请重试。');}finally{saving.current=false;setBusy(false);}}

  const target = card ? (mode==='choice' ? card.translation??'' : card.word) : '';
  const choices = useMemo(()=>quizChoices(target,pool.map(word=>mode==='choice'?word.translation??'':word.word)),[target,pool,mode]);
  const cloze = card ? clozeSentence(card.source_text??'',[card.word,card.lemma,...forms]) : null;
  const speak = () => {if(card){void Speech.stop();Speech.speak(card.word,{language:'en-US',rate:0.82,onError:()=>setError('发音失败，请检查系统英文语音包。')});}};
  const check = (value:string) => {if(revealed||busy)return;setCorrect(sameAnswer(value,target));setRevealed(true);};
  async function save(rating:number) {
    if(!card||saving.current)return;
    saving.current=true;setBusy(true);setError('');
    try {await recordReview(db,attemptId.current,card.word,mode,rating);setDaily(await todayStats(db));const next=reinforce(missed.current.get(card.word),rating>=2);if(next.streak!==undefined)missed.current.set(card.word,next.streak);if(next.repeat)setCards(queue=>[...queue,card]);setIndex(value=>value+1);attemptId.current=randomUUID();reset();}
    catch {setError('结果保存失败，答案已保留，请重试保存。');}
    finally {saving.current=false;setBusy(false);}
  }
  const choiceMode = mode==='cloze'||mode==='choice'||mode==='reverse'||mode==='listening';
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16}}>
      {error?<View style={{gap:8}}><Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text>{!card?<Button label="重试" onPress={load}/>:null}</View>:null}
      <View style={[styles.row,{justifyContent:'space-between'}]}><Text style={{color:colors.muted,fontSize:13}}>{modes[mode]} · 今日 {daily.words} 词</Text><IconButton icon={SlidersHorizontal} label="复习设置" disabled={busy||revealed} onPress={()=>setShowOptions(true)}/></View>
      {loading?<ActivityIndicator color={colors.accent}/>:card?<>
        <View style={{gap:8}}><View style={{height:4,borderRadius:2,backgroundColor:colors.border,overflow:'hidden'}}><View style={{height:4,width:`${index/cards.length*100}%`,backgroundColor:colors.accent}}/></View><Text style={{color:colors.muted,fontSize:12}}>{index} / {cards.length}</Text></View>
        <Panel>
          {!revealed?<>
            {mode==='listening'?<Button label="播放单词" onPress={speak}/>:<Text style={{fontSize:24,lineHeight:34,color:colors.text}}>{mode==='cloze'?(cloze??card.translation??'暂无提示，可查看答案'):mode==='choice'?card.word:card.translation??'暂无中文释义，可查看答案'}</Text>}
            {mode==='spelling'?<><TextInput accessibilityLabel="英文答案" value={input} onChangeText={setInput} autoCapitalize="none" autoCorrect={false} style={{color:colors.text,borderColor:colors.border,borderWidth:1,padding:12}}/><Button label="检查答案" disabled={!input.trim()} onPress={()=>check(input)}/></>:null}
            {choiceMode&&choices.length>=2?choices.map(choice=><Button key={choice} label={choice} onPress={()=>check(choice)}/>):choiceMode?<Text style={{color:colors.muted}}>可用选项不足，请查看答案后自评。</Text>:null}
            <Button label="查看答案" onPress={()=>{setRevealed(true);setCorrect(null);}}/>
          </>:<>
            {correct!==null?<Text accessibilityRole="alert" style={{color:colors.text}}>{correct?'回答正确':'回答错误，请看正确答案'}</Text>:null}
            <Text style={{fontSize:30,color:colors.text}}>{card.word}</Text>
            <Text style={{color:colors.text}}>{card.translation??'暂无中文释义'}</Text>
            <View style={styles.row}><IconButton icon={Volume2} label="发音" onPress={speak}/><IconButton icon={BookOpen} label="释义与出处" selected={details} onPress={()=>setDetails(v=>!v)}/></View>
            {details?<><Text style={{color:colors.muted,lineHeight:23}}>{card.definition}</Text><Text style={{color:colors.muted,lineHeight:23}}>{card.source_text}</Text></>:null}
            {correct!==null?<Button label={busy?'正在保存…':'继续'} disabled={busy} primary onPress={()=>void save(correct?2:0)}/>:<View style={[styles.row,{flexWrap:'wrap'}]}><Button label="再学一次" disabled={busy} onPress={()=>void save(0)}/><Button label="记住了" primary disabled={busy} onPress={()=>void save(2)}/></View>}
          </>}
        </Panel>
      </>:!error?<><Text style={{fontSize:24,color:colors.text}}>{cards.length?'本轮复习完成':'暂时没有到期单词'}</Text><Button label="检查待复习单词" onPress={load}/></>:null}
    </ScrollView>
    <Modal visible={showOptions} transparent animationType="slide" onRequestClose={()=>setShowOptions(false)}><View style={{flex:1,justifyContent:"flex-end",backgroundColor:"#0006"}}><SafeAreaView edges={["bottom"]} style={{maxHeight:"85%",backgroundColor:colors.background,padding:20,borderTopLeftRadius:20,borderTopRightRadius:20}}><Button label="完成" onPress={()=>setShowOptions(false)}/><ScrollView contentContainerStyle={{gap:18,paddingVertical:16}}>        <View style={[styles.row,{flexWrap:'wrap'}]}>{Object.entries(modes).map(([key,label])=><Button key={key} label={label} primary={mode===key} disabled={busy||revealed} onPress={()=>{void Speech.stop();setMode(key as Mode);reset();}}/>)}</View>
      <WordFilters words={pool} value={filters} disabled={busy||revealed} onChange={setFilters}/>
      <View style={[styles.row,{flexWrap:'wrap'}]}><Text style={{color:colors.text}}>每日新词 {plan.newLimit} / 复习 {plan.reviewLimit}</Text><Button label="新词 −5" disabled={busy||revealed||loading} onPress={()=>void updatePlan({...plan,newLimit:Math.max(0,plan.newLimit-5)})}/><Button label="新词 +5" disabled={busy||revealed||loading} onPress={()=>void updatePlan({...plan,newLimit:Math.min(200,plan.newLimit+5)})}/><Button label="复习 −10" disabled={busy||revealed||loading} onPress={()=>void updatePlan({...plan,reviewLimit:Math.max(0,plan.reviewLimit-10)})}/><Button label="复习 +10" disabled={busy||revealed||loading} onPress={()=>void updatePlan({...plan,reviewLimit:Math.min(200,plan.reviewLimit+10)})}/></View>
</ScrollView></SafeAreaView></View></Modal>
  </SafeAreaView>;
}
