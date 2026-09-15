export type Position={page:number;fraction:number;count:number;cfi?:string;progress:number;updated:number};
export function parsePosition(raw:string):Position|null{
 try{const p=JSON.parse(raw);return p&&Number.isSafeInteger(p.updated)&&p.updated>0&&Number.isFinite(p.fraction)&&p.fraction>=0&&p.fraction<=1&&Number.isFinite(p.progress)&&p.progress>=0&&p.progress<=1&&Number.isInteger(p.page)&&p.page>=0&&Number.isInteger(p.count)&&p.count>=0&&(p.cfi===undefined||typeof p.cfi==='string'&&p.cfi.startsWith('epubcfi('))?p:null;}catch{return null;}
}
export function latestPosition(raw:string[]){return raw.map(parsePosition).filter((p):p is Position=>p!==null).sort((a,b)=>b.updated-a.updated)[0]??null;}
