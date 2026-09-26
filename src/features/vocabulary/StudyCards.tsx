import {Text,View} from 'react-native';
import {Volume2} from 'lucide-react-native';
import {IconButton} from '../../components/IconButton';
import {Button} from '../../components/ui';
import {useSettings} from '../settings/SettingsProvider';
import type {VocabularyItem} from '../../services/vocabulary/repository';
import type {StudySession} from './sessionModel';

export function StudyIntroduction({card,busy,speak,onStart}:{card:VocabularyItem;busy:boolean;speak:()=>void;onStart:()=>void}){
 const {colors}=useSettings();
 return <>
  <Text style={{color:colors.muted,fontSize:12}}>先认识这个词</Text>
  <Text style={{fontSize:30,color:colors.text}}>{card.word}</Text>
  {card.phonetic?<Text style={{color:colors.muted}}>{card.phonetic}</Text>:null}
  <Text style={{color:colors.muted,fontSize:12}}>{card.meaning_origin==='ai'?'AI 语境释义':'词典释义'}</Text>
  <Text style={{color:colors.text,lineHeight:24}}>{card.translation??'暂无释义'}</Text>
  <StudySource card={card}/>
  <IconButton icon={Volume2} label="发音" onPress={speak}/>
  <Button label="开始练习" primary disabled={busy} onPress={onStart}/>
 </>;
}
export function StudySource({card}:{card:VocabularyItem}){
 const {colors}=useSettings();
 return <View style={{gap:8}}>
  {card.source_text?<Text style={{color:colors.text,lineHeight:26}}>{card.source_text}</Text>:null}
  <Text style={{color:colors.muted,fontSize:12}}>{card.source_book_title??'原书已移除'}</Text>
 </View>;
}
export function StudyResult({state,busy,onNext,onReading}:{state?:StudySession;busy:boolean;onNext:()=>void;onReading:()=>void}){
 const {colors}=useSettings(),words=Object.values(state?.words??{});
 return <>
  <Text style={{fontSize:24,color:colors.text}}>{words.length?`完成 ${words.filter(w=>w.status==='complete').length} / ${words.length} 词`:'没有到期单词或今日额度已用完'}</Text>
  <Text style={{color:colors.muted}}>仍需练习 {words.filter(w=>w.status==='deferred').length} 词</Text>
  <Button label="再来一组" primary disabled={busy} onPress={onNext}/>
  <Button label="返回阅读" disabled={busy} onPress={onReading}/>
 </>;
}
