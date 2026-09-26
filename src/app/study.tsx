import {StudyLimits} from '../features/vocabulary/StudyLimits';
import {StudyIntroduction,StudyResult,StudySource} from '../features/vocabulary/StudyCards';
import {requestAssistance} from '../services/ai/service';
import {InlineAssistance} from '../features/ai/InlineAssistance';
import {listStudyWords,studyBookChoices,setStudyMeaning} from '../services/vocabulary/lexicon';
import {createStudySession,loadStudySession,submitStudyAnswer,undoStudyAnswer,saveStudyDraft,nextStudyGroup,reconcileStudySession,markStudyIntroduced,studyCandidates,studyAdmissions,type StoredStudy} from '../services/vocabulary/sessionStore';
import {SlidersHorizontal,Volume2,BookOpen,ArrowLeft} from 'lucide-react-native';
import {IconButton} from '../components/IconButton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect,useLocalSearchParams,router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {randomUUID} from 'expo-crypto';
import {useDictionary} from '../features/dictionary/DictionaryContext';
import {WordFilters} from '../features/vocabulary/WordFilters';
import {defaultFilters,filterWords,readPlan,savePlan,studyQueue,recordReview,todayStats,defaultPlan,localDay,type Filters} from '../services/vocabulary/review';
import * as Speech from 'expo-speech';
import { Button, Panel, styles } from '../components/ui';
import { listVocabulary, type VocabularyItem } from '../services/vocabulary/repository';
import { useSettings } from '../features/settings/SettingsProvider';
import { clozeQuestion, meaningChoices, quizChoices, sameAnswer,studyQuestionKind } from '../features/vocabulary/quiz';

const modes = {cloze:'挖空', spelling:'拼写', choice:'英选中', reverse:'中选英', listening:'听音'};
type Mode = keyof typeof modes;
export default function StudyScreen() {
  const db = useSQLiteContext();
  const route=useLocalSearchParams<{book?:string}>();
  const {provider}=useDictionary();
  const [showOptions,setShowOptions]=useState(false);
  const [details,setDetails]=useState(false);
  const [choicesVisible,setChoicesVisible]=useState(false);
  const [forms,setForms]=useState<string[]>([]);
  const [filters,setFilters]=useState<Filters>({...defaultFilters,book:route.book??'all'});
  const [plan,setPlan]=useState(defaultPlan);
  const [daily,setDaily]=useState({attempts:0,correct:0,words:0,newWords:0,reviewWords:0});
  const attemptId=useRef(randomUUID());
  const returnBook=useRef<string|null|undefined>(undefined);
  const [session,setSession]=useState<StoredStudy|null>(null);
  const [entered,setEntered]=useState(false);
  const {colors} = useSettings();
  const [bookChoices,setBookChoices]=useState<{id:string;title:string}[]>([]);
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
  const draftWrites=useRef<Promise<void>>(Promise.resolve());
  const [formsReady,setFormsReady]=useState('');
  const [draftRetry,setDraftRetry]=useState(0);
  const aiController=useRef<AbortController|null>(null);
  useEffect(()=>()=>aiController.current?.abort(),[]);
  const reset = () => {setChoicesVisible(false);setDetails(false);setInput('');setRevealed(false);setCorrect(null);};
  const load = useCallback(async () => {
    setLoading(true);setError('');
    try {
      if(returnBook.current===undefined){
        returnBook.current=(await db.getFirstAsync<{id:string}>('SELECT id FROM books WHERE last_read_at IS NOT NULL ORDER BY last_read_at DESC LIMIT 1'))?.id??null;
      }
      const previous=await loadStudySession(db,'current');
      const members=await listStudyWords(db,false,{words:Object.keys(previous?.state.words??{})});
      const options=await listStudyWords(db,false,{limit:60});
      const words:VocabularyItem[]=[...new Map([...members,...options].map(w=>[w.word,w])).values()];
      setBookChoices(await studyBookChoices(db));
      setPool(words);
      const savedPlan=await readPlan(db);setPlan(savedPlan);
      setDaily(await todayStats(db));
      const savedMode=await db.getFirstAsync<{value:string}>("SELECT value FROM settings WHERE key='study_mode'");
      if(savedMode&&savedMode.value in modes)setMode(savedMode.value as Mode);
      let current=await reconcileStudySession(db,'current',words.map(w=>w.word));
      
      setSession(current);
      setCards((current?.state.queue??[]).map(word=>words.find(w=>w.word===word)).filter((w):w is VocabularyItem=>Boolean(w)));
      attemptId.current=randomUUID();
      setIndex(0);reset();
      if(current?.state.draft){
        const draft=current.state.draft;
        
        setInput(draft.input);setRevealed(draft.revealed);setCorrect(draft.correct);
      }
    } catch {setError('复习队列读取失败，请重试。');}
    finally {setLoading(false);}
  },[db,filters]);
  useFocusEffect(useCallback(()=>{void load();return ()=>{void Speech.stop();};},[load]));
  const card = cards[index];
  useEffect(()=>{let active=true;setForms([]);setFormsReady('');if(card&&provider)void provider.forms(card.lemma).then(values=>{if(active)setForms(values);}).catch(()=>{}).finally(()=>{if(active)setFormsReady(card?.word??'');});else setFormsReady(card?.word??'');return()=>{active=false;};},[card,provider]);
  async function updatePlan(next:typeof plan){if(saving.current)return;saving.current=true;setBusy(true);try{await savePlan(db,next);setPlan(next);}catch{setError('计划保存失败，请重试。');}finally{saving.current=false;setBusy(false);}}

  const cloze = card ? clozeQuestion(card.source_text??'',[card.word,card.lemma,...forms]) : null;
  const recognitionFirst=Boolean(card&&session?.state.words[card.word]?.introduced&&!session.state.words[card.word].practiceCorrect);
  const currentMode:Mode=session?.state.draft?.mode&&session.state.draft.mode in modes?session.state.draft.mode as Mode:mode;
  const effectiveMode=currentMode==='cloze'&&(!cloze||recognitionFirst)?'choice':currentMode;
  const target = session?.state.draft?.answer ?? (card ? (effectiveMode==='choice' ? card.translation??'' : effectiveMode==='cloze'&&cloze?cloze.answer:card.word) : '');
  const generatedChoices = useMemo(()=>(effectiveMode==='choice'?meaningChoices:quizChoices)(target,pool.map(word=>effectiveMode==='choice'?word.translation??'':word.word)),[target,pool,effectiveMode]);
  const choices=session?.state.draft?.choices??generatedChoices;
  const speak = () => {if(card){void Speech.stop();Speech.speak(card.word,{language:'en-US',rate:0.82,onError:()=>setError('发音失败，请检查系统英文语音包。')});}};
  const prompt=session?.state.draft?.prompt??(effectiveMode==='cloze'?(cloze?.text??card?.translation??'暂无提示'):effectiveMode==='choice'?card?.word??'':card?.translation??'暂无中文释义');
  async function reveal(value:string|null){
    if(revealed||saving.current||!session)return;
    const draft={mode:currentMode,input:value??input,revealed:true,correct:value===null?null:sameAnswer(value,target),answer:target,prompt,choices};
    saving.current=true;setBusy(true);setError('');
    try{
      await draftWrites.current.catch(()=>{});
      await saveStudyDraft(db,'current',session.state.answered,draft,card?.word);
      setSession({...session,state:{...session.state,draft}});
      setCorrect(draft.correct);setRevealed(true);
    }catch{setError('答案未保存，请重试。');}
    finally{saving.current=false;setBusy(false);}
  }
  const check=(value:string)=>{void reveal(value);};
  async function save(rating:number,defer=false) {
    if(!card||saving.current)return;
    saving.current=true;setBusy(true);setError('');
    try {
      await draftWrites.current.catch(()=>{});
      const next=await submitStudyAnswer(db,'current',attemptId.current,defer?'defer':correct===null?'reveal':rating>=2?'correct':'wrong');
      const stats=await todayStats(db);
      setSession(next);
      setCards((next?.state.queue??[]).map(word=>pool.find(w=>w.word===word)).filter((w):w is VocabularyItem=>Boolean(w)));
      setIndex(0);setDaily(stats);attemptId.current=randomUUID();reset();
    }
    catch {setError('结果保存失败，答案已保留，请重试保存。');}
    finally {saving.current=false;setBusy(false);}
  }
  async function nextGroup(){
    if(saving.current)return;saving.current=true;setBusy(true);
    try{
      await studyAdmissions(db);
      const query={...filters,limit:200,unadmittedDay:localDay()};
      const reviews=filters.due==='new'?[]:await listStudyWords(db,false,{...query,tab:'review',due:'due'});
      const fresh=await listStudyWords(db,false,{...query,tab:'new',due:'new'});
      const words=[...reviews,...fresh];
      const candidates=await studyCandidates(db,filterWords(words,filters),plan);
      await nextStudyGroup(db,randomUUID(),candidates.map(w=>w.word));
      setEntered(true);
      await load();
    }catch{setError('未能开始下一组，当前记录保留。');}
    finally{saving.current=false;setBusy(false);}
  }
  async function returnToReading(){
    if(busy)return;
    try{
      const id=returnBook.current;
      const exists=id?await db.getFirstAsync('SELECT id FROM books WHERE id=?',id):null;
      if(exists&&id)router.replace({pathname:'/reader/[id]',params:{id}});
      else router.replace('/');
    }catch{setError('暂时无法返回书籍，学习记录已保留。');}
  }
  async function undo(){
    if(busy)return;setBusy(true);
    try{await undoStudyAnswer(db,'current');await load();}
    catch{setError('撤销失败，原记录保留');}
    finally{setBusy(false);}
  }
  async function fillMeaning(ai=false){
    if(!card||saving.current)return;
    saving.current=true;setBusy(true);setError('');
    try{
      aiController.current?.abort();aiController.current=ai?new AbortController():null;
      const result=ai?await requestAssistance(db,{mode:'mark_meaning',targetText:card.word,previousContext:'',followingContext:card.source_text??'',paragraphText:card.source_text??''},aiController.current?.signal):null;
      const found=ai?null:await provider?.lookup(card.word);
      const meaning=ai?result?.value.shortMeaning:found?.entry.translation;
      if(typeof meaning!=='string'||!meaning.trim())throw Error('暂未找到释义，可稍后再练。');
      await setStudyMeaning(db,card.word,card.source_book_id,card.source_text??'',meaning,ai?'ai':'dictionary');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'释义补全失败');}
    finally{saving.current=false;setBusy(false);}
  }
  const questionKind=studyQuestionKind({translation:card?.translation??null,hasSentence:Boolean(cloze),options:choices.length});
  const needsIntroduction=Boolean(card&&card.due_at===0&&!session?.state.words[card.word]?.introduced);
  async function introduce(){
    if(!card||saving.current)return;saving.current=true;setBusy(true);
    try{setSession(await markStudyIntroduced(db,'current',card.word));}
    catch{setError('学习进度未保存，请重试。');}
    finally{saving.current=false;setBusy(false);}
  }
  // Persist the generated question before accepting answers; input writes use
  // the same chain so a slow keystroke cannot overwrite a revealed answer.
  useEffect(()=>{
    if(!entered||loading||formsReady!==card?.word||!card||!session||session.state.draft||needsIntroduction||questionKind==='missing')return;
    const draft={mode,input:'',revealed:false,correct:null,answer:target,prompt,choices};
    const operation=draftWrites.current.catch(()=>{}).then(()=>saveStudyDraft(db,'current',session.state.answered,draft,card.word));
    draftWrites.current=operation;
    void operation.then(()=>setSession(current=>current&&current.state.answered===session.state.answered&&current.state.queue[0]===card.word?{...current,state:{...current.state,draft}}:current)).catch(()=>setError('题目未保存，请返回后重试。'));
  },[entered,loading,formsReady,card,session,needsIntroduction,questionKind,mode,target,prompt,choices,db,draftRetry]);
  function changeInput(value:string){
    setInput(value);
    if(!session?.state.draft||!card)return;
    const draft={...session.state.draft,input:value};
    draftWrites.current=draftWrites.current.catch(()=>{}).then(()=>saveStudyDraft(db,'current',session.state.answered,draft,card.word));
    void draftWrites.current.catch(()=>setError('输入尚未保存，请重试。'));
  }
  const choiceMode = currentMode==='cloze'||currentMode==='choice'||currentMode==='reverse'||currentMode==='listening';
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16}}>
      {error?<View style={{gap:8}}><Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text>{!card?<Button label="重试" onPress={load}/>:!session?.state.draft?<Button label="重试保存题目" onPress={()=>{setError('');setDraftRetry(v=>v+1);}}/>:null}</View>:null}
      {session&&session.state.answered>0?<Button label="撤销上一题" disabled={busy} onPress={()=>void undo()}/>:null}
      <View style={[styles.row,{justifyContent:'space-between'}]}><IconButton icon={ArrowLeft} label="返回阅读" disabled={busy} onPress={()=>void returnToReading()}/><Text style={{color:colors.muted,fontSize:13}}>{modes[currentMode]} · 今日 {daily.words} 词</Text><IconButton icon={SlidersHorizontal} label="复习设置" disabled={busy||revealed} onPress={()=>setShowOptions(true)}/></View>
      {loading?<ActivityIndicator color={colors.accent}/>:!entered?<>
        <Text style={{fontSize:28,color:colors.text}}>读过的词，慢慢记住</Text>
        <Text style={{color:colors.muted,lineHeight:24}}>每组最多 5 词。可以随时停下，下次接着练。</Text>
        <Button label={session?.state.queue.length?'继续本组':'开始 5 词'} primary disabled={busy} onPress={()=>{if(session?.state.queue.length)setEntered(true);else void nextGroup();}}/>
      </>:card?<>
        <View style={{gap:8}}><View style={{height:4,borderRadius:2,backgroundColor:colors.border,overflow:'hidden'}}><View style={{height:4,width:`${session?Object.values(session.state.words).filter(w=>w.status==='complete').length/Math.max(1,Object.keys(session.state.words).length)*100:0}%`,backgroundColor:colors.accent}}/></View><Text style={{color:colors.muted,fontSize:12}}>{session?Object.values(session.state.words).filter(w=>w.status==='complete').length:0} / {session?Object.keys(session.state.words).length:0} 词</Text></View>
        <Panel>
          {questionKind==='missing'?<>
            <Text style={{fontSize:28,color:colors.text}}>{card.word}</Text>
            <Text style={{color:colors.muted}}>缺少可用释义，暂不出题。</Text>
            <Button label="本地查词" disabled={busy||!provider} onPress={()=>void fillMeaning()}/>
            <Button label="AI 补全" disabled={busy} onPress={()=>void fillMeaning(true)}/>{busy&&aiController.current?<Button label="取消" onPress={()=>aiController.current?.abort()}/>:null}
            <Button label="稍后再练" disabled={busy} onPress={()=>void save(0,true)}/>
          </>:needsIntroduction?<StudyIntroduction card={card} busy={busy} speak={speak} onStart={()=>void introduce()}/>:!revealed?<>
            {currentMode==='listening'?<Button label="播放单词" onPress={speak}/>:<Text style={{fontSize:24,lineHeight:34,color:colors.text}}>{prompt}</Text>}
            {currentMode==='spelling'?<><TextInput accessibilityLabel="英文答案" value={input} onChangeText={changeInput} autoCapitalize="none" autoCorrect={false} style={{color:colors.text,borderColor:colors.border,borderWidth:1,padding:12}}/><Button label="检查答案" disabled={!input.trim()} onPress={()=>check(input)}/></>:null}
            {choiceMode&&questionKind!=='reveal'&&choices.length>=2?effectiveMode==='choice'&&!choicesVisible?<Button label="展开选项" disabled={busy} onPress={()=>setChoicesVisible(true)}/>:choices.map(choice=><Button key={choice} label={choice} disabled={busy||!session?.state.draft} onPress={()=>check(choice)}/>):choiceMode?<Text style={{color:colors.muted}}>可用选项不足，请查看答案后自评。</Text>:null}
            <Button label="稍后再练" disabled={busy} onPress={()=>void save(0,true)}/><Button label="查看答案" disabled={busy} onPress={()=>void reveal(null)}/>
          </>:<>
            {correct!==null?<Text accessibilityRole="alert" style={{color:colors.text}}>{correct?'回答正确':'回答错误，请看正确答案'}</Text>:null}
            <Text style={{fontSize:30,color:colors.text}}>{card.word}</Text>
            <Text style={{color:colors.muted,fontSize:12}}>{card.meaning_origin==='ai'?'AI 语境释义':'词典释义'}</Text>
            <Text style={{color:colors.text}}>{card.translation??'暂无中文释义'}</Text>
            <View style={styles.row}><IconButton icon={Volume2} label="发音" onPress={speak}/><IconButton icon={BookOpen} label="释义与出处" selected={details} onPress={()=>setDetails(v=>!v)}/></View>
            {card.phonetic?<Text style={{color:colors.muted}}>{card.phonetic}</Text>:null}
            <StudySource card={card}/>
            {details?<><Text style={{color:colors.muted,lineHeight:23}}>{card.definition}</Text><InlineAssistance request={{mode:'word',targetText:card.word,previousContext:'',followingContext:card.source_text??'',paragraphText:card.source_text??''}}/></>:null}
            {correct===true?<Button label="其实没记住" disabled={busy} onPress={()=>void save(0)}/>:null}
            {correct!==null?<Button label={busy?'正在保存…':'继续'} disabled={busy} primary onPress={()=>void save(correct?2:0)}/>:<View style={[styles.row,{flexWrap:'wrap'}]}><Button label="再学一次" disabled={busy} onPress={()=>void save(0)}/><Button label="记住了" primary disabled={busy} onPress={()=>void save(2)}/></View>}
          </>}
        </Panel>
      </>:!error?<StudyResult state={session?.state} busy={busy} onNext={()=>void nextGroup()} onReading={()=>void returnToReading()}/>:null}
    </ScrollView>
    <Modal visible={showOptions} transparent animationType="slide" onRequestClose={()=>setShowOptions(false)}><View style={{flex:1,justifyContent:"flex-end",backgroundColor:"#0006"}}><SafeAreaView edges={["bottom"]} style={{maxHeight:"85%",backgroundColor:colors.background,padding:20,borderTopLeftRadius:20,borderTopRightRadius:20}}><Button label="完成" onPress={()=>setShowOptions(false)}/><ScrollView contentContainerStyle={{gap:18,paddingVertical:16}}>        <View style={[styles.row,{flexWrap:'wrap'}]}>{Object.entries(modes).map(([key,label])=><Button key={key} label={label} primary={mode===key} disabled={busy||revealed} onPress={()=>{void Speech.stop();setMode(key as Mode);void db.runAsync("INSERT INTO settings(key,value) VALUES('study_mode',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",key).catch(()=>setError('题型设置未保存'));}}/>)}</View>
      <WordFilters bookChoices={bookChoices} words={pool} value={filters} disabled={busy||revealed} onChange={setFilters}/>
      <StudyLimits plan={plan} busy={busy||loading} onSave={next=>void updatePlan(next)}/>
</ScrollView></SafeAreaView></View></Modal>
  </SafeAreaView>;
}

