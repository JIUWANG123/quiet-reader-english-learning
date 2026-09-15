import type { SQLiteDatabase } from 'expo-sqlite';
export type WordMark = {lemma:string; style:string; color:string; show_meaning:number; contextual_meaning:string|null; forms:string[]};
export type SentenceMark = {section_key:string;start_offset:number;end_offset:number;text:string;style:string;color:string};
const listeners = new Set<() => void>();
export function marksChanged() { listeners.forEach(fn=>fn()); }
export function subscribeMarks(fn:()=>void) { listeners.add(fn); return ()=>{listeners.delete(fn);}; }
export async function readMarks(db: SQLiteDatabase, bookId:string) {
  return db.getAllAsync<Omit<WordMark,'forms'>>('SELECT lemma,style,color,show_meaning,contextual_meaning FROM text_marks WHERE book_id=?',bookId);
}
