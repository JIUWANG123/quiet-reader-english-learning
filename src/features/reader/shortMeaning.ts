export function shortMeaning(raw:string|null|undefined){
 const value=(raw??'').replace(/[*`#【】\[\]]/g,'').trim();
 const match=value.match(/^(n(?:oun)?|v(?:erb)?|adj(?:ective)?|adv(?:erb)?|pron(?:oun)?|prep(?:osition)?|conj(?:unction)?|interj(?:ection)?|phr(?:ase)?|名词|动词|形容词|副词|代词|介词|连词|短语)[.。:：\s]*/i);
 const names:Record<string,string>={noun:'n',verb:'v',adjective:'adj',adverb:'adv',pronoun:'pron',preposition:'prep',conjunction:'conj',interjection:'interj',phrase:'phr',名词:'n',动词:'v',形容词:'adj',副词:'adv',代词:'pron',介词:'prep',连词:'conj',短语:'phr'};
 const rawPos=match?.[1].toLowerCase();const pos=rawPos?(names[rawPos]??rawPos):'释';
 const meaning=(match?value.slice(match[0].length):value).split(/[;；，,。\n]/)[0].replace(/^[\s:："“]+|[\s"”]+$/g,'').trim();
 return meaning?`${pos}.${Array.from(meaning).slice(0,8).join('')}${Array.from(meaning).length>8?'…':''}`:'';
}
