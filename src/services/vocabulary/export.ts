import {Directory,File,Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type {SQLiteDatabase} from 'expo-sqlite';
import {listVocabulary,type VocabularyItem} from './repository';
import {ankiTSV} from './anki';
export async function exportAnki(db:SQLiteDatabase,selected?:VocabularyItem[]){
 const rows=selected??await listVocabulary(db);
 if(!rows.length)throw Error('当前没有可导出的单词。');
 if(!await Sharing.isAvailableAsync())throw Error('此设备无法打开文件分享菜单。');
 const dir=new Directory(Paths.cache,'exports');dir.create({intermediates:true,idempotent:true});
 const file=new File(dir,'quiet-reader-anki.tsv');file.write(ankiTSV(rows));
 await Sharing.shareAsync(file.uri,{mimeType:'text/tab-separated-values',UTI:'public.tab-separated-values-text',dialogTitle:'保存或分享 Anki 词卡'});
}
