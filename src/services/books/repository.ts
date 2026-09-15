import type { SQLiteDatabase } from 'expo-sqlite';
import type { Book, BookPage } from '../../types';
import { clamp, readingProgress } from './text';

const selectBooks = `SELECT b.*, COALESCE(p.progress,0) AS progress,
  COALESCE(p.page_index,0) AS page_index, COALESCE(p.scroll_fraction,0) AS scroll_fraction,
  p.updated_at AS position_updated_at, p.epub_location
  FROM books b LEFT JOIN reading_progress p ON p.book_id=b.id`;
export const listBooks = (db: SQLiteDatabase) => db.getAllAsync<Book>(`${selectBooks} ORDER BY COALESCE(b.last_read_at,b.created_at) DESC`);
export const getBook = (db: SQLiteDatabase, id: string) => db.getFirstAsync<Book & {position_updated_at:number|null}>(`${selectBooks} WHERE b.id=?`, id);
export const getPage = (db: SQLiteDatabase, id: string, page: number) => db.getFirstAsync<BookPage>('SELECT page_index,text,heading FROM book_pages WHERE book_id=? AND page_index=?', id, page);
// Read the three-page window used by the native page stack. SQLite returns
// neighboring pages in one round trip, so a turn never waits on a new query.
export const getPageWindow = (db: SQLiteDatabase, id: string, page: number) =>
  db.getAllAsync<BookPage>('SELECT page_index,text,heading FROM book_pages WHERE book_id=? AND page_index BETWEEN ? AND ? ORDER BY page_index', id, Math.max(0,page-1), page+1);
export const getContents = (db: SQLiteDatabase, id: string) => db.getAllAsync<Pick<BookPage, 'page_index' | 'heading'>>('SELECT page_index,heading FROM book_pages WHERE book_id=? ORDER BY page_index', id);

export async function removeBooks(db: SQLiteDatabase, ids: string[]) {
  await db.withExclusiveTransactionAsync(async tx => {
    for (const id of new Set(ids)) {
      // Keep a durable cleanup queue: a failed file deletion can be retried
      // without restoring a deleted book or losing the original source file.
      await tx.runAsync(`INSERT OR IGNORE INTO book_file_cleanup(file_name)
        SELECT file_name FROM books WHERE id=? AND file_name<>''`, id);
      // Expo exclusive transactions use a new connection. Do not depend on
      // connection-local foreign_keys settings for the user's learning data.
      await tx.runAsync('UPDATE vocabulary SET source_book_id=NULL WHERE source_book_id=?', id);
      await tx.runAsync('UPDATE saved_sentences SET book_id=NULL WHERE book_id=?', id);
      for (const table of ['book_pages', 'reading_progress', 'text_marks', 'sentence_marks']) {
        await tx.runAsync(`DELETE FROM ${table} WHERE book_id=?`, id);
      }
      await tx.runAsync('DELETE FROM books WHERE id=?', id);
    }
  });
}

export async function saveProgress(db: SQLiteDatabase, id: string, page: number, fraction: number, count: number, updated=Date.now()) {
  const safePage = Math.floor(clamp(page, 0, Math.max(0, count - 1)));
  const now = updated;
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync(`INSERT INTO reading_progress(book_id,page_index,scroll_fraction,progress,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(book_id) DO UPDATE SET page_index=excluded.page_index,
      scroll_fraction=excluded.scroll_fraction,progress=excluded.progress,updated_at=excluded.updated_at WHERE excluded.updated_at>=reading_progress.updated_at`,
    id, safePage, clamp(fraction, 0, 1), readingProgress(safePage, fraction, count), now);
    await tx.runAsync('UPDATE books SET last_read_at=MAX(COALESCE(last_read_at,0),?) WHERE id=?', now, id);
  });
}

export async function saveEpubProgress(db: SQLiteDatabase, id: string, location: string, progress: number, updated=Date.now()) {
  const now = updated;
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync(`INSERT INTO reading_progress(book_id,page_index,scroll_fraction,epub_location,progress,updated_at)
      VALUES(?,0,0,?,?,?) ON CONFLICT(book_id) DO UPDATE SET epub_location=excluded.epub_location,
      progress=excluded.progress,updated_at=excluded.updated_at WHERE excluded.updated_at>=reading_progress.updated_at`, id, location, clamp(progress, 0, 1), now);
    await tx.runAsync('UPDATE books SET last_read_at=MAX(COALESCE(last_read_at,0),?) WHERE id=?', now, id);
  });
}
