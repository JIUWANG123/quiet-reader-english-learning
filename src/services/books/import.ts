import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { fileFormat, MAX_IMPORT_BYTES, normalizeText, paginateText } from './text';
import { buildEpubIndex, type EpubIndex } from './epubIndex';
import { warmupEpubAfterImport } from './warmup';

export async function importBook(db: SQLiteDatabase) {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const source = new File(asset.uri);
  let destination: File | undefined;
  try {
    const format = fileFormat(asset.name);
    if ((asset.size ?? source.size) > MAX_IMPORT_BYTES) throw new Error('当前支持 128 MB 以内的书籍。');
    const pages = format === 'txt' ? paginateText(normalizeText(await source.text())) : [];
    const title = asset.name.replace(/\.(txt|epub)$/i, '');
    // Re-importing the same filename reuses the existing book identity so learning data survives.
    const existing = await db.getFirstAsync<{id:string;file_name:string;created_at:number}>(
      'SELECT id,file_name,created_at FROM books WHERE title=? AND format=? ORDER BY created_at LIMIT 1', title, format);
    const id = existing?.id ?? randomUUID();
    let epubIndex:EpubIndex|undefined;
    const directory = new Directory(Paths.document, 'books');
    directory.create({ intermediates: true, idempotent: true });
    if(format==='epub') {
      const chapterDir=new Directory(directory,`${id}.chapters`); chapterDir.create({intermediates:true,idempotent:true});
      epubIndex=await buildEpubIndex(source,{file:name=>new File(chapterDir,name)});
    }
    destination = new File(directory, `${id}.${format}`);
    if(existing?.file_name && existing.file_name!==destination.name){const old=new File(directory,existing.file_name);if(old.exists)old.delete();}
    source.copy(destination);
    if(epubIndex){const indexFile=new File(directory,`${id}.epub-index.json`);indexFile.write(JSON.stringify(epubIndex));}
    await db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync(`INSERT INTO books(id,title,format,file_name,created_at,page_count) VALUES(?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET file_name=excluded.file_name,page_count=excluded.page_count`,
        id, title, format, destination!.name, existing?.created_at ?? Date.now(), pages.length);
      // Replace only the imported page rows; learning tables keep the stable book id.
      if (existing && format === 'txt') await tx.runAsync('DELETE FROM book_pages WHERE book_id=?', id);
      const statement = await tx.prepareAsync('INSERT INTO book_pages(book_id,page_index,text,heading) VALUES(?,?,?,?)');
      try {
        for (let i = 0; i < pages.length; i++) await statement.executeAsync([id, i, pages[i].text, pages[i].heading]);
      } finally { await statement.finalizeAsync(); }
    });
    if(format==='epub') void warmupEpubAfterImport(id,destination.uri);
    return { id, format };
  } catch (error) {
    if (destination?.exists) destination.delete();
    throw error;
  } finally {
    // Only remove the temporary copy created by the picker, never the original.
    if (source.uri.startsWith(Paths.cache.uri) && source.exists) {
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

