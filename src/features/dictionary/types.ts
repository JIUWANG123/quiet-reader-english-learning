export interface DictionaryEntry {
  word: string;
  phonetic: string | null;
  definition: string | null;
  translation: string | null;
  pos: string | null;
  bnc: number | null;
  frq: number | null;
  exchange: string | null;
}

export interface DictionaryResult {
  query: string;
  lemma: string;
  entry: DictionaryEntry;
}
