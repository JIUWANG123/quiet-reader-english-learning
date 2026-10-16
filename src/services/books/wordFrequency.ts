// The pattern below only ever matches ASCII letters plus ’ ' and -, so a plain
// toLowerCase is identical to toLocaleLowerCase('en-US') here. It matters: this
// runs once per word, and on Hermes the locale-aware call resolves a locale every
// single time — a 3MB book spends ~40s in it instead of milliseconds.
export function normalizeFrequencyWord(value:string){return value.toLowerCase().replace(/[’‘]/g,"'");}
export function countWordOccurrences(text:string){
 const counts:Record<string,number>={};
 const pattern=/[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)*/g;
 for(let match=pattern.exec(text);match;match=pattern.exec(text)){const word=normalizeFrequencyWord(match[0]);counts[word]=(counts[word]??0)+1;}
 return counts;
}
export function mergeWordOccurrences(target:Record<string,number>,source:Record<string,number>){for(const [word,count] of Object.entries(source))target[word]=(target[word]??0)+count;return target;}
