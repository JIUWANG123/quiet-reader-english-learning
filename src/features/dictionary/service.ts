import type { SQLiteDatabase } from 'expo-sqlite';
import type { DictionaryEntry, DictionaryResult } from './types';
import { normalizeLookupWord } from './normalize';

export interface DictionaryProvider {
  forms(lemma: string): Promise<string[]>;
  lookup(word: string): Promise<DictionaryResult | null>;
  suggest(word: string, limit?: number): Promise<string[]>;
}

export class ECDICTProvider implements DictionaryProvider {
  constructor(private readonly db: SQLiteDatabase) {}
  private formsCache=new Map<string,Promise<string[]>>();
  forms(lemma:string){
    const key=lemma.toLowerCase();let value=this.formsCache.get(key);
    if(!value){value=this.loadForms(key).catch(error=>{this.formsCache.delete(key);throw error;});this.formsCache.set(key,value);if(this.formsCache.size>4000)this.formsCache.delete(this.formsCache.keys().next().value!);}
    return value;
  }
  private async loadForms(lemma: string) {
    const rows = await this.db.getAllAsync<{form:string}>('SELECT form FROM lemmas WHERE lemma=? COLLATE NOCASE', lemma);
    return Array.from(new Set([lemma, ...rows.map(row=>row.form)]));
  }

  async lookup(input: string): Promise<DictionaryResult | null> {
    const query = normalizeLookupWord(input);
    if (!query) return null;
    const mapped = await this.db.getFirstAsync<{ lemma: string }>(
      'SELECT lemma FROM lemmas WHERE form = ? COLLATE NOCASE LIMIT 1', query,
    );
    if (mapped?.lemma) {
      const entry = await this.find(mapped.lemma);
      if (entry) return { query, lemma: mapped.lemma, entry };
    }
    const exact = await this.find(query);
    if (exact) return { query, lemma: exact.word.toLowerCase(), entry: exact };
    return null;
  }

  async suggest(input: string, limit = 8) {
    const query = normalizeLookupWord(input);
    if (!query) return [];
    const rows = await this.db.getAllAsync<{ word: string }>(
      'SELECT word FROM entries WHERE word >= ? COLLATE NOCASE ORDER BY word COLLATE NOCASE LIMIT ?', query, limit,
    );
    return rows.map(row => row.word);
  }

  private find(word: string) {
    return this.db.getFirstAsync<DictionaryEntry>(
      `SELECT word, phonetic, definition, translation, pos, bnc, frq, exchange
       FROM entries WHERE word = ? COLLATE NOCASE LIMIT 1`, word,
    );
  }
}
