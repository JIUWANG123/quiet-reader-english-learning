import type { SQLiteDatabase } from 'expo-sqlite';
import type { DictionaryResult } from '../../features/dictionary/types';
import {addStudySource} from './lexicon';

export type VocabularyItem = {
  meaning_origin?:'ai'|'dictionary';
  source_books?:{id:string|null;title:string|null}[];
  word: string;
  lemma: string;
  phonetic: string | null;
  translation: string | null;
  definition: string | null;
  source_book_id: string | null;
  source_text: string | null;
  source_book_title: string | null;
  created_at: number;
  lookup_count: number;
  familiarity: number;
  due_at: number;
  interval_days: number;
};

export async function saveVocabulary(db: SQLiteDatabase, result: DictionaryResult, sourceBookId: string, sourceText: string) {
  const entry = result.entry;
  await db.runAsync(
    `INSERT INTO vocabulary
      (word, lemma, phonetic, translation, definition, source_book_id, source_text, created_at, lookup_count, familiarity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
     ON CONFLICT(word) DO UPDATE SET lookup_count = vocabulary.lookup_count + 1`,
    entry.word, result.lemma, entry.phonetic, entry.translation, entry.definition,
    sourceBookId, sourceText.trim() || null, Date.now(),
  );
  await addStudySource(db,{lemma:result.lemma,word:result.query,bookId:sourceBookId,text:sourceText,translation:entry.translation,createdAt:Date.now()});
}

export async function listVocabulary(db: SQLiteDatabase) {
  return db.getAllAsync<VocabularyItem>(`SELECT v.*, b.title AS source_book_title
    FROM vocabulary v LEFT JOIN books b ON b.id = v.source_book_id
    ORDER BY v.created_at DESC, v.word COLLATE NOCASE`);
}

export async function setVocabularyFamiliarity(db: SQLiteDatabase, word: string, familiarity: number) {
  const safeValue = Math.max(0, Math.min(3, Math.round(familiarity)));
  const intervals = [0, 1, 3, 7];
  const interval = safeValue === 0 ? 0 : intervals[safeValue];
  await db.runAsync('UPDATE vocabulary SET familiarity=?, interval_days=?, due_at=? WHERE word=? COLLATE NOCASE', safeValue, interval, Date.now() + interval * 86400000, word);
}

export async function removeVocabulary(db: SQLiteDatabase, word: string) {
  await db.runAsync('DELETE FROM vocabulary WHERE word=? COLLATE NOCASE', word);
}

export async function ensureVocabulary(db:SQLiteDatabase,result:DictionaryResult,bookId:string,sourceText:string){
 const e=result.entry;
 await db.runAsync(`INSERT INTO vocabulary(word,lemma,phonetic,translation,definition,source_book_id,source_text,created_at)
 VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(word) DO NOTHING`,e.word,result.lemma,e.phonetic,e.translation,e.definition,bookId,sourceText.trim()||null,Date.now());
 await addStudySource(db,{lemma:result.lemma,word:result.query,bookId,text:sourceText,translation:e.translation,createdAt:Date.now()});
}
