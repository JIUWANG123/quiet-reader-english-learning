import type {WordMark,SentenceMark} from './marks';

type RawMark=Omit<WordMark,'forms'>;
type Sources={words:()=>Promise<RawMark[]>;sentences:()=>Promise<SentenceMark[]>;forms?:(lemma:string)=>Promise<string[]>};
type Sink={words:(rows:WordMark[])=>void;sentences:(rows:SentenceMark[])=>void;error:(message:string)=>void;active:()=>boolean};

// Dictionary enrichment is optional. Never make saved notes wait for the
// dictionary, or let one rejected lemma discard every annotation in the book.
export async function loadReaderMarks(source:Sources,sink:Sink){
  const issues:string[]=[];
  const report=(message:string)=>{issues.push(message);if(sink.active())sink.error(issues.join('；'));};
  if(sink.active())sink.error('');
  await Promise.all([
    source.sentences().then(rows=>{if(sink.active())sink.sentences(rows);}).catch(()=>report('笔记与句子标记读取失败，可重试')),
    source.words().then(async rows=>{
      if(!sink.active())return;
      const result=rows.map(row=>({...row,forms:[row.lemma]}));
      sink.words(result);
      if(!source.forms)return;
      let failed=false;
      // Bound simultaneous SQLite queries for large vocabulary collections.
      for(let start=0;start<result.length;start+=4){
        if(!sink.active())return;
        await Promise.all(result.slice(start,start+4).map(async row=>{
          try{row.forms=Array.from(new Set([row.lemma,...await source.forms!(row.lemma)]));}
          catch{failed=true;}
        }));
      }
      if(sink.active()){sink.words([...result]);if(failed)report('部分词形暂不可用，已保留原词标记');}
    }).catch(()=>report('单词标记读取失败，可重试')),
  ]);
}
