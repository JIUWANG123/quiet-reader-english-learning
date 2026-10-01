import type {SQLiteDatabase} from 'expo-sqlite';
import type {VocabularyItem} from './repository';
import {countWordOccurrences} from '../books/wordFrequency';
export type StudySource={lemma:string;word:string;bookId:string|null;text:string;translation:string|null;createdAt:number};
const canonical=(value:string)=>value.trim().toLowerCase();
export async function ensureStudyLexicon(db:SQLiteDatabase){
 await db.execAsync(`CREATE TABLE IF NOT EXISTS study_lexemes (
 lemma TEXT PRIMARY KEY,excluded INTEGER NOT NULL DEFAULT 0,due_at INTEGER NOT NULL DEFAULT 0,
 interval_days INTEGER NOT NULL DEFAULT 0,familiarity INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS study_word_links(word TEXT PRIMARY KEY COLLATE NOCASE,lemma TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS study_sources (
 source_key TEXT PRIMARY KEY,lemma TEXT NOT NULL,word TEXT NOT NULL,book_id TEXT,source_text TEXT NOT NULL,
 translation TEXT,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS study_meanings (lemma TEXT NOT NULL,book_key TEXT NOT NULL,source_text TEXT NOT NULL,meaning TEXT NOT NULL,origin TEXT NOT NULL,PRIMARY KEY(lemma,book_key,source_text));
 CREATE INDEX IF NOT EXISTS study_sources_lemma ON study_sources(lemma,created_at);
 CREATE INDEX IF NOT EXISTS study_links_lemma ON study_word_links(lemma);
 CREATE INDEX IF NOT EXISTS study_due ON study_lexemes(excluded,due_at);`);
}
async function insertSource(db:SQLiteDatabase,source:StudySource){
 const lemma=canonical(source.lemma||source.word);
 const key=JSON.stringify([lemma,source.bookId,source.text.trim()]);
 // Creating a source must not reset an existing word's scheduling baseline.
 // The migration/queue layer creates the lexeme from its preserved old row.
 await db.runAsync('INSERT OR IGNORE INTO study_sources VALUES(?,?,?,?,?,?,?)',key,lemma,source.word,source.bookId,source.text.trim(),source.translation,source.createdAt);
}
export async function addStudySource(db:SQLiteDatabase,source:StudySource){
 await ensureStudyLexicon(db);await insertSource(db,source);
}
export async function setStudyExcluded(db:SQLiteDatabase,lemma:string,excluded:boolean){
 await ensureStudyLexicon(db);
 await db.runAsync('UPDATE study_lexemes SET excluded=? WHERE lemma=?',excluded?1:0,canonical(lemma));
}
 export type StudyWordQuery={limit?:number;offset?:number;search?:string;words?:string[];book?:string;familiarity?:number;tab?:'all'|'new'|'review'|'excluded';due?:'all'|'due'|'new';frequency?:'all'|'high'|'medium'|'low';sort?:'recent'|'frequency_desc'|'frequency_asc';unadmittedDay?:string};
export async function listStudyWords(db:SQLiteDatabase,includeExcluded=false,query:StudyWordQuery={}){
 await migrateStudyLexicon(db);
 const where=['(?=1 OR l.excluded=0)'];const params:(string|number)[]=[includeExcluded?1:0];
 if(query.words){where.push(`l.lemma IN (${query.words.map(()=>'?').join(',')||'NULL'})`);params.push(...query.words);}
 if(query.search?.trim()){where.push("instr(lower(l.lemma||' '||coalesce(v.translation,'')),lower(?))>0");params.push(query.search.trim());}
 if(query.book&&query.book!=='all'){
  where.push(`EXISTS (SELECT 1 FROM study_sources source LEFT JOIN books sourcebook ON sourcebook.id=source.book_id WHERE source.lemma=l.lemma AND ${query.book==='deleted'?'sourcebook.id IS NULL':'sourcebook.id=?'})`);
  if(query.book!=='deleted')params.push(query.book);
 }
 if(query.familiarity!==undefined&&query.familiarity>=0){where.push('l.familiarity=?');params.push(query.familiarity);}
 if(query.tab==='excluded')where.push('l.excluded=1');
 if(query.tab==='new')where.push('l.excluded=0 AND l.due_at=0');
 if(query.tab==='review')where.push('l.excluded=0 AND l.due_at>0');
 if(query.due==='new')where.push('l.due_at=0');
 if(query.due==='due'){where.push('l.due_at<=?');params.push(Date.now());}
 if(query.frequency==='high')where.push('coalesce(freq.occurrence_count,0)>=5');
 if(query.frequency==='medium')where.push('coalesce(freq.occurrence_count,0) BETWEEN 2 AND 4');
 if(query.frequency==='low')where.push('coalesce(freq.occurrence_count,0)=1');
 if(query.unadmittedDay){where.push('NOT EXISTS (SELECT 1 FROM study_admissions a WHERE a.word=l.lemma AND a.day=?)');params.push(query.unadmittedDay);}
 const order=query.unadmittedDay?'CASE WHEN l.due_at>0 THEN 0 ELSE 1 END,l.due_at,v.created_at,l.lemma':query.sort==='frequency_desc'?'coalesce(freq.occurrence_count,0) DESC,v.created_at DESC,l.lemma':query.sort==='frequency_asc'?'coalesce(freq.occurrence_count,0) ASC,v.created_at DESC,l.lemma':'v.created_at DESC,l.lemma';
 // One representative preserves first-source metadata; scheduling comes from
 // the shared lemma rather than whichever inflected row happens to be selected.
 const rows=await db.getAllAsync<VocabularyItem & {excluded:number;source_books_json:string}>(`SELECT
 l.lemma AS word,l.lemma,v.phonetic,coalesce(m.meaning,v.translation) AS translation,coalesce(m.origin,'dictionary') AS meaning_origin,v.definition,
 v.source_book_id,v.source_text,b.title AS source_book_title,v.created_at,
 v.lookup_count,coalesce(freq.occurrence_count,0) AS occurrence_count,l.familiarity,l.due_at,l.interval_days,l.excluded,
 (SELECT json_group_array(json_object('id',sb.id,'title',sb.title)) FROM
 (SELECT DISTINCT b2.id,b2.title FROM study_sources s LEFT JOIN books b2 ON b2.id=s.book_id WHERE s.lemma=l.lemma) sb) AS source_books_json
 FROM study_lexemes l JOIN vocabulary v ON v.word=(
 SELECT v2.word FROM vocabulary v2 JOIN study_word_links link ON link.word=v2.word
 WHERE link.lemma=l.lemma ORDER BY v2.created_at,v2.word LIMIT 1)
 LEFT JOIN books b ON b.id=v.source_book_id
 LEFT JOIN book_word_frequency freq ON freq.book_id=v.source_book_id AND freq.lemma=lower(v.lemma)
 LEFT JOIN study_meanings m ON m.lemma=l.lemma AND m.book_key=coalesce(v.source_book_id,'') AND m.source_text=coalesce(v.source_text,'')
 WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`,...params,query.limit===undefined?-1:Math.max(0,Math.min(500,query.limit)),Math.max(0,query.offset??0));
 return rows.map(({source_books_json,...row})=>({...row,source_books:JSON.parse(source_books_json) as {id:string|null;title:string|null}[]}));
}
export async function setStudyFamiliarity(db:SQLiteDatabase,lemma:string,value:number,now=Date.now()){
 const rating=Math.max(0,Math.min(3,Math.round(value))),days=[0,1,3,7][rating];
 await db.withExclusiveTransactionAsync(async tx=>{
  await tx.runAsync('UPDATE study_lexemes SET familiarity=?,interval_days=?,due_at=? WHERE lemma=?',rating,days,now+days*86400000,lemma);
  await tx.runAsync('UPDATE vocabulary SET familiarity=?,interval_days=?,due_at=? WHERE word IN (SELECT word FROM study_word_links WHERE lemma=?)',rating,days,now+days*86400000,lemma);
 });
}
export async function removeStudyWord(db:SQLiteDatabase,lemma:string){
 await db.withExclusiveTransactionAsync(async tx=>{
  await tx.runAsync('DELETE FROM vocabulary WHERE word IN (SELECT word FROM study_word_links WHERE lemma=?)',lemma);
  await tx.runAsync('DELETE FROM study_word_links WHERE lemma=?',lemma);
  await tx.runAsync('DELETE FROM study_sources WHERE lemma=?',lemma);
  await tx.runAsync('DELETE FROM study_meanings WHERE lemma=?',lemma);
  await tx.runAsync('DELETE FROM study_lexemes WHERE lemma=?',lemma);
 });
}
// Only stored dictionary lemmas are trusted. Never infer roots by stripping suffixes.
// Existing rows and history remain intact; links record which rows were migrated.
export async function migrateStudyLexicon(db:SQLiteDatabase){
 await ensureStudyLexicon(db);
 await backfillTxtFrequency(db);
 await db.withExclusiveTransactionAsync(async tx=>{
  const createdHere=new Set<string>();
  const rows=await tx.getAllAsync<{word:string;lemma:string;source_book_id:string|null;source_text:string|null;translation:string|null;created_at:number;due_at:number;interval_days:number;familiarity:number}>(`SELECT v.* FROM vocabulary v LEFT JOIN study_word_links l ON l.word=v.word WHERE l.word IS NULL ORDER BY v.created_at,v.word`);
  for(const row of rows){
   const lemma=canonical(row.lemma||row.word);
   const old=await tx.getFirstAsync<{due_at:number}>('SELECT due_at FROM study_lexemes WHERE lemma=?',lemma);
   if(!old){await tx.runAsync('INSERT INTO study_lexemes VALUES(?,0,?,?,?)',lemma,row.due_at,row.interval_days,row.familiarity);createdHere.add(lemma);}
   else if(createdHere.has(lemma)&&row.due_at<old.due_at)await tx.runAsync('UPDATE study_lexemes SET due_at=?,interval_days=?,familiarity=? WHERE lemma=?',row.due_at,row.interval_days,row.familiarity,lemma);
   await insertSource(tx,{lemma,word:row.word,bookId:row.source_book_id,text:row.source_text??'',translation:row.translation,createdAt:row.created_at});
   await tx.runAsync('INSERT INTO study_word_links VALUES(?,?)',row.word,lemma);
  }
  await tx.runAsync("INSERT INTO settings(key,value) VALUES('study_schema_version','1') ON CONFLICT(key) DO UPDATE SET value='1'");
 });
}
async function backfillTxtFrequency(db:SQLiteDatabase){
 const books=await db.getAllAsync<{id:string}>("SELECT b.id FROM books b WHERE b.format='txt' AND NOT EXISTS (SELECT 1 FROM book_word_frequency f WHERE f.book_id=b.id)");
 for(const book of books){const pages=await db.getAllAsync<{text:string}>('SELECT text FROM book_pages WHERE book_id=?',book.id);const counts:Record<string,number>={};for(const page of pages){const part=countWordOccurrences(page.text);for(const [word,count] of Object.entries(part))counts[word]=(counts[word]??0)+count;}await db.withExclusiveTransactionAsync(async tx=>{for(const [word,count] of Object.entries(counts))await tx.runAsync('INSERT OR REPLACE INTO book_word_frequency(book_id,lemma,occurrence_count) VALUES(?,?,?)',book.id,word,count);});}
}

export async function studyBookChoices(db:SQLiteDatabase){
 return db.getAllAsync<{id:string;title:string}>('SELECT DISTINCT b.id,b.title FROM study_sources s JOIN books b ON b.id=s.book_id ORDER BY b.title');
}
export async function studySources(db:SQLiteDatabase,lemma:string,offset=0){
 return db.getAllAsync<{word:string;source_text:string;translation:string|null;title:string|null;created_at:number}>(`SELECT s.word,s.source_text,s.translation,b.title,s.created_at FROM study_sources s LEFT JOIN books b ON b.id=s.book_id WHERE s.lemma=? ORDER BY s.created_at,s.source_key LIMIT 20 OFFSET ?`,lemma,offset);
}

export async function setStudyMeaning(db:SQLiteDatabase,lemma:string,bookId:string|null,text:string,meaning:string,origin:'ai'|'dictionary'){
 if(!meaning.trim())throw Error('释义不能为空');
 await ensureStudyLexicon(db);
 await db.runAsync('INSERT OR REPLACE INTO study_meanings VALUES(?,?,?,?,?)',lemma,bookId??'',text,meaning.trim(),origin);
}
