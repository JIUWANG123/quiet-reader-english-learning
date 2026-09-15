import {X,Volume2,BookmarkPlus,Check,ChevronDown} from 'lucide-react-native';
import {IconButton} from '../../components/IconButton';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, ScrollView, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, styles } from '../../components/ui';
import { useSettings } from '../settings/SettingsProvider';
import { useDictionary } from './DictionaryContext';
import type { DictionaryResult } from './types';
import { extractSourceSentence, sentenceFromSelection } from './normalize';
import { saveVocabulary } from '../../services/vocabulary/repository';
import { InlineAssistance } from '../ai/InlineAssistance';
import { MarkControls } from '../reader/MarkControls';
import type { AIRequest } from '../../services/ai/provider';

export function WordCard({ word, sourceBookId, sourceText, selection, onClose }: { word: string | null; sourceBookId: string; sourceText: string; selection?:AIRequest; onClose: () => void }) {
  const db = useSQLiteContext();
  const { colors } = useSettings();
  const { provider, loading: dictionaryLoading, error: dictionaryError } = useDictionary();
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState('');
  const [saved, setSaved] = useState(false);
  const [details,setDetails]=useState(false);
  useEffect(() => {
    let active = true;
    setResult(null);
    setFailed('');
    setSaved(false);setDetails(false);
    if (!word || !provider) return () => { active = false; };
    setLoading(true);
    provider.lookup(word).then(value => {
      if (!active) return;
      setResult(value);
      if (!value) setFailed('本地词典暂未收录这个词。');
    }).catch(() => { if (active) setFailed('查询失败，请重试。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [provider, word]);

  return <Modal visible={Boolean(word)} transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭单词卡片" style={StyleSheet.absoluteFill} onPress={onClose}/>
      <SafeAreaView edges={['bottom']} style={{ maxHeight: '72%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22 }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>{result?.entry.word ?? word}</Text>
          <IconButton icon={X} label="关闭单词卡片" onPress={onClose} />
        </View>
        {dictionaryLoading || loading ? <ActivityIndicator style={{ margin: 28 }} color={colors.accent} /> : null}
        {dictionaryError ? <Text style={{ color: colors.text, marginTop: 18 }}>词典载入失败：{dictionaryError}</Text> : null}
        {failed ? <Text style={{ color: colors.muted, marginTop: 18 }}>{failed}</Text> : null}
        {word && !result && !loading && !dictionaryLoading ? <ScrollView><InlineAssistance request={{...(selection ?? {targetText: word, previousContext: sourceText, followingContext: ''}), mode: 'word'}} /></ScrollView> : null}
        {result ? <ScrollView contentContainerStyle={{ gap: 14, paddingTop: 12, paddingBottom: 8 }}>
          {result.query !== result.lemma ? <Text style={{ color: colors.muted }}>原词：{result.query}　→　原形：{result.lemma}</Text> : null}
          {result.entry.phonetic ? <Text style={{ color: colors.muted, fontSize: 17 }}>/ {result.entry.phonetic} /</Text> : null}
          {result.entry.pos ? <Text style={{ color: colors.accent, fontWeight: '600' }}>{result.entry.pos}</Text> : null}
          {result.entry.translation ? <Text numberOfLines={details?undefined:3} style={{ color: colors.text, fontSize: 18, lineHeight: 27 }}>{result.entry.translation}</Text> : null}
          {result.entry.definition ? <Text numberOfLines={details?undefined:2} style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>{result.entry.definition}</Text> : null}
          <View style={[styles.row, { marginTop: 4 }]}>
            <IconButton icon={Volume2} label="发音" onPress={() => Speech.speak(result.entry.word, { language: 'en-US', rate: 0.85 })} />
            <IconButton icon={saved?Check:BookmarkPlus} label={saved ? '已收藏' : '加入生词'} disabled={saved} onPress={() => {
              void saveVocabulary(db, result, sourceBookId, selection ? sentenceFromSelection(selection) : extractSourceSentence(sourceText, word ?? result.query))
                .then(() => setSaved(true))
                .catch(() => setFailed('收藏失败，请重试。'));
            }} />
            <IconButton icon={ChevronDown} label="展开英文释义" selected={details} onPress={()=>setDetails(value=>!value)}/>
          </View>
          <InlineAssistance request={selection??{mode: 'word', targetText: word ?? result.query, previousContext: sourceText, followingContext: ''}} />
          <MarkControls result={result} key={result.lemma} bookId={sourceBookId} lemma={result.lemma} context={sourceText} selection={selection} />
        </ScrollView> : null}
      </SafeAreaView>
    </View>
  </Modal>;
}
