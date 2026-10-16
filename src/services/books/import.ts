import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { fileFormat, MAX_IMPORT_BYTES, normalizeText, paginateText } from './text';
import { buildEpubIndex, type EpubIndex } from './epubIndex';
import {countWordOccurrences} from './wordFrequency';
import {classifyImportError} from '../ai/diagnosticsModel';
import {traceReading} from '../../features/reader/diagnostics';

function sizeBucket(bytes:number):'lt1mb'|'1to10mb'|'10to50mb'|'50to128mb'|'over128mb'{
 return bytes<1_000_000?'lt1mb':bytes<10_000_000?'1to10mb':bytes<50_000_000?'10to50mb':bytes<=MAX_IMPORT_BYTES?'50to128mb':'over128mb';
}

export async function importBook(db: SQLiteDatabase) {
  const requestId=randomUUID();let stage='picker';const started=Date.now();let format:'epub'|'txt'|undefined;
  const mark=(event:'import-start'|'import-stage'|'import-index-failure'|'import-failure'|'import-complete',next:string,detail:{duration?:number;code?:string;result?:'success'|'failure'|'cancelled';sizeBucket?:'lt1mb'|'1to10mb'|'10to50mb'|'50to128mb'|'over128mb'}={})=>traceReading(event,{requestId,mode:'import',format,stage:next,...detail});
  mark('import-start',stage,{result:'success'});
  let result:Awaited<ReturnType<typeof DocumentPicker.getDocumentAsync>>;
  try{result=await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });}
  catch(error){mark('import-failure',stage,{duration:Date.now()-started,result:'failure',code:'PICKER_FAILED'});throw error;}
  if (result.canceled) {mark('import-complete',stage,{duration:Date.now()-started,result:'cancelled'});return null;}
  const asset = result.assets[0];
  let source:File|undefined;
  let bytes=asset.size??0;
  let destination: File | undefined;
  try {
    const pickedFile=new File(asset.uri);source=pickedFile;
    bytes=asset.size??pickedFile.size;
    stage='validate-file';format=fileFormat(asset.name);mark('import-stage',stage,{sizeBucket:sizeBucket(bytes)});
    if (bytes > MAX_IMPORT_BYTES) throw new Error('当前支持 128 MB 以内的书籍。');
    stage='read-text';
    const pages = format === 'txt' ? paginateText(normalizeText(await pickedFile.text())) : [];
    const txtFrequency = format === 'txt' ? countWordOccurrences(pages.map(page=>page.text).join('\n')) : undefined;
    mark('import-stage',stage,{duration:Date.now()-started});
    const title = asset.name.replace(/\.(txt|epub)$/i, '');
    const bookFormat=format;
    // Re-importing the same filename reuses the existing book identity so learning data survives.
    stage='lookup-existing';
    const existing = await db.getFirstAsync<{id:string;file_name:string;created_at:number}>(
      'SELECT id,file_name,created_at FROM books WHERE title=? AND format=? ORDER BY created_at LIMIT 1', title, format);
    const id = existing?.id ?? randomUUID();
    let epubIndex:EpubIndex|undefined;
    const directory = new Directory(Paths.document, 'books');
    stage='create-storage-directory';
    directory.create({ intermediates: true, idempotent: true });
    if(format==='epub') {
      stage='epub-index';mark('import-stage',stage);
      const chapterDir=new Directory(directory,`${id}.chapters`); chapterDir.create({intermediates:true,idempotent:true});
      try {
        epubIndex=await buildEpubIndex(pickedFile,{file:name=>new File(chapterDir,name)});
        mark('import-stage','epub-index',{duration:Date.now()-started,result:'success'});
      } catch(error) {
        // The index only supports word-frequency and warmup extras. epub.js
        // reads the original archive, so an indexing edge case must not reject
        // an otherwise importable EPUB or leave an index from an older copy.
        try { if(chapterDir.exists)chapterDir.delete(); } catch { /* Cache cleanup is best effort. */ }
        try { const oldIndex=new File(directory,`${id}.epub-index.json`);if(oldIndex.exists)oldIndex.delete(); } catch { /* Cache cleanup is best effort. */ }
        mark('import-index-failure','epub-index',{duration:Date.now()-started,result:'failure',code:classifyImportError(error)});
      }
    }
    stage='copy-source';
    destination = new File(directory, `${id}.${format}`);
    if(existing?.file_name && existing.file_name!==destination.name){const old=new File(directory,existing.file_name);if(old.exists)old.delete();}
    pickedFile.copy(destination);
    if(epubIndex){const indexFile=new File(directory,`${id}.epub-index.json`);indexFile.write(JSON.stringify(epubIndex));}
    mark('import-stage',stage,{duration:Date.now()-started,result:'success'});
    stage='database-transaction';mark('import-stage',stage);
    await db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync(`INSERT INTO books(id,title,format,file_name,created_at,page_count) VALUES(?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET file_name=excluded.file_name,page_count=excluded.page_count`,
        id, title, bookFormat, destination!.name, existing?.created_at ?? Date.now(), pages.length);
      // Replace only the imported page rows; learning tables keep the stable book id.
      if (existing && format === 'txt') await tx.runAsync('DELETE FROM book_pages WHERE book_id=?', id);
      await tx.runAsync('DELETE FROM book_word_frequency WHERE book_id=?',id);
      const statement = await tx.prepareAsync('INSERT INTO book_pages(book_id,page_index,text,heading) VALUES(?,?,?,?)');
      try {
        for (let i = 0; i < pages.length; i++) await statement.executeAsync([id, i, pages[i].text, pages[i].heading]);
      } finally { await statement.finalizeAsync(); }
      const frequencies=Object.entries(txtFrequency??epubIndex?.wordFrequency??{});
      // Keep the bind count below SQLite's historical 999 variable limit while
      // reducing one prepare/execute/finalize bridge round-trip per word to one
      // round-trip per chunk.
      for(let start=0;start<frequencies.length;start+=200){
        const chunk=frequencies.slice(start,start+200);
        const values=chunk.map(()=>'(?,?,?)').join(',');
        await tx.runAsync(`INSERT INTO book_word_frequency(book_id,lemma,occurrence_count) VALUES ${values}`,...chunk.flatMap(([lemma,count])=>[id,lemma,count]));
      }
    });
    mark('import-stage',stage,{duration:Date.now()-started,result:'success'});
    if (format === 'epub') {
      stage='warmup-schedule';
      const { startEpubWarmup } = await import('./warmup');
      startEpubWarmup(id, destination.uri);
    }
    mark('import-complete','complete',{duration:Date.now()-started,result:'success'});
    return { id, format };
  } catch (error) {
    mark('import-failure',stage,{duration:Date.now()-started,result:'failure',code:classifyImportError(error)});
    if (destination?.exists) destination.delete();
    throw error;
  } finally {
    // Only remove the temporary copy created by the picker, never the original.
    if (source?.uri.startsWith(Paths.cache.uri) && source.exists) {
      try { source.delete(); } catch { /* Cache cleanup can wait for the OS. */ }
    }
  }
}

export async function addSample(db: SQLiteDatabase) {
  const id = 'quiet-reader-original-sample-v1';
  if (await db.getFirstAsync('SELECT id FROM books WHERE id=?', id)) return id;
  const text = `Chapter 1 — The Letter\n\nShe found herself strangely reluctant to leave. The little station was almost empty, and rain tapped softly against the windows.\n\nAnna held the letter in both hands. “I couldn't bring myself to tell her,” she said. The message had arrived that morning, but her sister still knew nothing about it.\n\nThe stationmaster looked at the envelope. He regarded her with suspicion. Someone had opened the office before dawn, and Anna was the only person with a spare key.\n\n“You knew,” he said quietly. He was looking at the date on the letter. Anna lowered her eyes. She had known about the closure for a week.\n\nOutside, a train moved slowly through the rain. Anna put the letter into her coat pocket and walked towards the platform. There was still time to speak to her sister.\n\nChapter 2 — A Small Beginning\n\nThe children were waiting by the gate. One of them had given Anna a paper flower. She was taking it home, careful not to bend the petals.\n\n“Will you give it to your sister?” the youngest child asked. Anna smiled, showing her teeth, and nodded.\n\nA man near the ticket office made a contemptuous remark about the old station. Anna did not answer. For her, the place was full of beginnings.\n\nShe gave the children a wave and stepped onto the train.\n`;
  const pages = paginateText(text, 1000);
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync('INSERT OR IGNORE INTO books(id,title,format,file_name,created_at,page_count) VALUES(?,?,?,?,?,?)', id, 'The Letter · 阅读体验', 'txt', '', Date.now(), pages.length);
    for (let i = 0; i < pages.length; i++) await tx.runAsync('INSERT OR IGNORE INTO book_pages(book_id,page_index,text,heading) VALUES(?,?,?,?)', id, i, pages[i].text, pages[i].heading);
  });
  return id;
}

