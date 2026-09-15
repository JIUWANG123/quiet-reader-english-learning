import {shortMeaning} from './shortMeaning';
import {useMeaningVisibility} from './useMeaningVisibility';
import { useEffect, useState, useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useDictionary } from '../dictionary/DictionaryContext';
import { readMarks, subscribeMarks, type WordMark, type SentenceMark } from './marks';
import {loadReaderMarks} from './loadMarks';
export function useMarks(bookId:string) {
  const {visible}=useMeaningVisibility(bookId);
  const db=useSQLiteContext(); const {provider}=useDictionary();
  const [marks,setMarks]=useState<WordMark[]>([]); const [error,setError]=useState('');
  const [sentenceMarks,setSentenceMarks]=useState<SentenceMark[]>([]);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true, revision=0;
    const refresh=()=>{const current=++revision;void loadReaderMarks({
      words:()=>readMarks(db,bookId),
      sentences:()=>db.getAllAsync<SentenceMark>("SELECT section_key,start_offset,end_offset,text,style,color,0 AS is_note FROM sentence_marks WHERE book_id=? UNION ALL SELECT section_key,start_offset,end_offset,text,'underline' AS style,'#8899aa' AS color,1 AS is_note FROM sentence_notes WHERE book_id=?",bookId,bookId),
      forms:provider?lemma=>provider.forms(lemma):undefined,
    },{words:setMarks,sentences:setSentenceMarks,error:setError,active:()=>active&&current===revision});};
    refresh(); const unsubscribe=subscribeMarks(refresh); return ()=>{active=false;unsubscribe();};
  },[bookId,db,provider,attempt]);
  const displayed=useMemo(()=>marks.map(row=>({...row,contextual_meaning:shortMeaning(row.contextual_meaning),show_meaning:row.show_meaning})),[marks]);
  return {marks:displayed,sentenceMarks,error,retry:()=>setAttempt(value=>value+1),meaningsVisible:visible};
}
