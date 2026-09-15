import type { SQLiteDatabase } from 'expo-sqlite';
export type SavedSentence = {id:number;book_id:string;text:string;context:string|null;translation?:string|null;created_at:number;book_title:string|null};
export const saveSentence = (db: SQLiteDatabase, bookId:string, text:string, context='') => db.runAsync('INSERT OR IGNORE INTO saved_sentences(book_id,text,context,created_at) VALUES(?,?,?,?)',bookId,text.trim(),context.trim()||null,Date.now());
export const listSavedSentences = (db: SQLiteDatabase) => db.getAllAsync<SavedSentence>('SELECT s.*,b.title AS book_title FROM saved_sentences s LEFT JOIN books b ON b.id=s.book_id ORDER BY s.created_at DESC');
export const removeSavedSentence = (db: SQLiteDatabase,id:number) => db.runAsync('DELETE FROM saved_sentences WHERE id=?',id);
