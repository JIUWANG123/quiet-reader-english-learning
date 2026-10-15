import {installWriteQueue} from './writeQueue';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './migrate';
// Printed once per launch so a logcat capture can prove which JS bundle is
// actually running before anyone spends time interpreting anything else.
//   adb logcat -d -v time | Select-String 'qr-build|qr-import'
console.log('[qr-build] r3-import-probes 2026-10-15');
export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  await migrateDatabase(db);
  installWriteQueue(db);
}
