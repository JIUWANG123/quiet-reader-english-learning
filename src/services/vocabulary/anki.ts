import type {VocabularyItem} from './repository';
const html=(value:string|null|undefined)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\t/g,' ').replace(/\r?\n/g,'<br>');
export function ankiTSV(rows:VocabularyItem[]){
 return '#separator:Tab\n#html:true\n#columns:Front\tBack\n'+rows.map(v=>[html(v.word),[v.phonetic?'/'+html(v.phonetic)+'/':'',html(v.translation),html(v.definition),html(v.source_text),html(v.source_book_title)].filter(Boolean).join('<br><br>')].join('\t')).join('\n');
}
