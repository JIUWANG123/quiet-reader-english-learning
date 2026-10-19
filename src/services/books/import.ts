import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import {traceReading} from '../../features/reader/diagnostics';
import {importAsset,type ImportDirectoryLike,type ImportIo,type ImportTraceDetail} from './importAsset';
import {paginateText} from './text';

const expoIo:ImportIo={
 booksDirectory:()=>new Directory(Paths.document,'books'),
 file:uri=>new File(uri) as unknown as ReturnType<ImportIo['file']>,
 childFile:(parent,name)=>new File(parent as Directory,name) as unknown as ReturnType<ImportIo['childFile']>,
 childDirectory:(parent,name)=>new Directory(parent as Directory,name),
 cacheUri:Paths.cache.uri,
 uuid:randomUUID,
};

export async function importBook(db: SQLiteDatabase) {
  const requestId=randomUUID();let format:'epub'|'txt'|undefined;
  const mark=(event:'import-start'|'import-stage'|'import-index-failure'|'import-failure'|'import-complete',stage:string,detail:ImportTraceDetail={})=>traceReading(event,{requestId,mode:'import',format,stage,...detail});
  mark('import-start','picker',{result:'success'});
  let result:Awaited<ReturnType<typeof DocumentPicker.getDocumentAsync>>;
  try{result=await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });}
  catch(error){mark('import-failure','picker',{result:'failure',code:'PICKER_FAILED'});throw error;}
  if (result.canceled) {mark('import-complete','picker',{result:'cancelled'});return null;}
  const asset = result.assets[0];
  return importAsset({db,asset,io:expoIo,trace:(event,stage,detail)=>{
    format=detail?.format??format;
    mark(event,stage,detail);
  }});
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

