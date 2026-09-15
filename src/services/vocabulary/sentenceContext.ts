export function sentenceContext(raw:string|null,target:string){
 if(!raw)return '';
 try{const old=JSON.parse(raw);if(typeof old.previous==='string')return target;}catch{}
 const paragraphs=raw.split(/\n\s*\n/);
 const paragraph=paragraphs.find(part=>part.includes(target));
 // Older releases saved only preceding chapter text. Do not present it as provenance.
 return paragraph??target;
}
