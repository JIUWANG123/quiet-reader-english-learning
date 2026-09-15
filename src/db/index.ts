import {installWriteQueue} from './writeQueue';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './migrate';
export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  await migrateDatabase(db);
  installWriteQueue(db);
}
