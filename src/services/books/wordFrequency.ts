export function normalizeFrequencyWord(value:string){return value.toLocaleLowerCase('en-US').replace(/[’‘]/g,"'");}
export function countWordOccurrences(text:string){
 const counts:Record<string,number>={};
 for(const match of text.matchAll(/[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)*/g)){const word=normalizeFrequencyWord(match[0]);counts[word]=(counts[word]??0)+1;}
 return counts;
}
export function mergeWordOccurrences(target:Record<string,number>,source:Record<string,number>){for(const [word,count] of Object.entries(source))target[word]=(target[word]??0)+count;return target;}
