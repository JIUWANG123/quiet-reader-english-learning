import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

export async function cleanDeletedBookFiles(db: SQLiteDatabase) {
  const items = await db.getAllAsync<{file_name: string}>('SELECT file_name FROM book_file_cleanup');
  let remaining = 0;
  for (const {file_name} of items) {
    try {
      if (!/^[\w-]+\.(epub|txt)$/i.test(file_name)) throw new Error('Invalid imported filename');
      const directory = new Directory(Paths.document, 'books');
      const file = new File(directory, file_name);
      if (!file.uri.startsWith(directory.uri.replace(/\/$/, '') + '/')) throw new Error('Invalid file path');
      if (file.exists) file.delete();
      await db.runAsync('DELETE FROM book_file_cleanup WHERE file_name=?', file_name);
    } catch { remaining++; }
  }
  return remaining;
}
