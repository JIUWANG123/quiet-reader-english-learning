export const SCHEMA_VERSION = 12;
export const learningSchema = `CREATE TABLE IF NOT EXISTS sentence_notes (
 book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 section_key TEXT NOT NULL, start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL,
 text TEXT NOT NULL, note TEXT NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(book_id,section_key,start_offset,end_offset)
);
CREATE TABLE IF NOT EXISTS bookmarks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 location TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(book_id,location)
);
CREATE TABLE IF NOT EXISTS review_log (
 id TEXT PRIMARY KEY, word TEXT NOT NULL, mode TEXT NOT NULL, rating INTEGER NOT NULL,
 reviewed_at INTEGER NOT NULL, day TEXT NOT NULL, was_new INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS review_log_day ON review_log(day);
CREATE TABLE IF NOT EXISTS book_file_cleanup (file_name TEXT PRIMARY KEY NOT NULL);
CREATE TABLE IF NOT EXISTS text_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  lemma TEXT NOT NULL, style TEXT NOT NULL, color TEXT NOT NULL, show_meaning INTEGER NOT NULL DEFAULT 0,
  contextual_meaning TEXT, created_at INTEGER NOT NULL, UNIQUE(book_id, lemma)
);
CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY, mode TEXT NOT NULL, target_text TEXT NOT NULL,
  response_json TEXT NOT NULL, model TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS text_marks_book ON text_marks(book_id);
CREATE TABLE IF NOT EXISTS sentence_marks (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL, start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL,
  text TEXT NOT NULL, style TEXT NOT NULL, color TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(book_id, section_key, start_offset, end_offset)
);
CREATE TABLE IF NOT EXISTS saved_sentences (
  id INTEGER PRIMARY KEY AUTOINCREMENT, book_id TEXT REFERENCES books(id) ON DELETE CASCADE,
  text TEXT NOT NULL, context TEXT, created_at INTEGER NOT NULL,
  UNIQUE(book_id, text)
);`;
export const vocabularySchema = `CREATE TABLE IF NOT EXISTS vocabulary (
  word TEXT PRIMARY KEY COLLATE NOCASE,
  lemma TEXT NOT NULL, phonetic TEXT, translation TEXT, definition TEXT,
  source_book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  source_text TEXT, created_at INTEGER NOT NULL,
  lookup_count INTEGER NOT NULL DEFAULT 1,
  familiarity INTEGER NOT NULL DEFAULT 0 CHECK(familiarity BETWEEN 0 AND 3),
  due_at INTEGER NOT NULL DEFAULT 0, interval_days INTEGER NOT NULL DEFAULT 0
);`;
export const schema = `
CREATE TABLE IF NOT EXISTS reading_daily (
 day TEXT NOT NULL, book_id TEXT NOT NULL, milliseconds INTEGER NOT NULL DEFAULT 0 CHECK(milliseconds>=0),
 PRIMARY KEY(day,book_id)
);
CREATE TABLE IF NOT EXISTS reading_checkins (day TEXT PRIMARY KEY NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('txt','epub')),
  file_name TEXT NOT NULL, created_at INTEGER NOT NULL,
  last_read_at INTEGER, page_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS book_pages (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL, text TEXT NOT NULL, heading TEXT,
  PRIMARY KEY(book_id, page_index)
);
CREATE TABLE IF NOT EXISTS reading_progress (
  book_id TEXT PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL DEFAULT 0,
  scroll_fraction REAL NOT NULL DEFAULT 0 CHECK(scroll_fraction BETWEEN 0 AND 1),
  epub_location TEXT,
  progress REAL NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 1),
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
${vocabularySchema}
${learningSchema}
CREATE INDEX IF NOT EXISTS books_last_read ON books(last_read_at DESC);
`;
