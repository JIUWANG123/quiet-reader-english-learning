import type { SQLiteDatabase } from 'expo-sqlite';
import { schema, SCHEMA_VERSION } from './schema';

export async function migrateDatabase(db: SQLiteDatabase) {
  const version = await db.getFirstAsync<{user_version:number}>('PRAGMA user_version');
  if ((version?.user_version ?? 0) > SCHEMA_VERSION) throw new Error('数据库版本较新，请使用新版 App。');
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await db.execAsync(schema);
    // Previously released migrations could label an incomplete database v8.
    // Inspect actual columns rather than trusting that version number.
    for (const [table, column, type] of [
      ['reading_progress', 'epub_location', 'TEXT'],
      ['vocabulary', 'due_at', 'INTEGER NOT NULL DEFAULT 0'],
      ['vocabulary', 'interval_days', 'INTEGER NOT NULL DEFAULT 0'],
      ['saved_sentences', 'translation', 'TEXT'],
    ]) {
      const columns = await db.getAllAsync<{name:string}>(`PRAGMA table_info(${table})`);
      if (!columns.some(item => item.name === column)) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    await db.execAsync('COMMIT');
  } catch (error) { await db.execAsync('ROLLBACK'); throw error; }
}
