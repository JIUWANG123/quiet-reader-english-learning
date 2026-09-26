export function sameAnswer(input: string, answer: string) {
  return input.trim().toLowerCase() === answer.trim().toLowerCase();
}
export function studyQuestionKind(input:{translation:string|null;hasSentence:boolean;options:number}){
 if(!input.translation?.trim())return 'missing';
 if(input.options<2)return 'reveal';
 return input.hasSentence?'cloze':'recognition';
}

export function clozeQuestion(sentence:string,forms:string[],offset?:number){
 const targets=new Set(forms.map(form=>form.toLowerCase()));
 const matches=[...sentence.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)].filter(m=>targets.has(m[0].toLowerCase()));
 // Older sources lack an occurrence offset: do not silently mask the wrong span.
 if(offset===undefined&&matches.length!==1)return null;
 for(const match of matches){
  if(!targets.has(match[0].toLowerCase())||(offset!==undefined&&match.index!==offset))continue;
  return {text:sentence.slice(0,match.index)+'______'+sentence.slice(match.index+match[0].length),answer:match[0],offset:match.index};
 }
 return null;
}

export function quizChoices(answer: string, pool: string[], random = Math.random) {
  const unique = [...new Map(pool.map(value => [value.trim().toLowerCase(), value.trim()])).values()]
    .filter(value => value && !sameAnswer(value, answer));
  function shuffle(values: string[]) {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
  return answer.trim() ? shuffle([answer.trim(), ...shuffle(unique).slice(0, 3)]) : [];
}

export function clozeSentence(sentence: string, forms: string[]) {
  const targets = new Set(forms.map(form => form.toLowerCase()));
  let matched = false;
  const text = sentence.replace(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g, word => {
    if (!targets.has(word.toLowerCase())) return word;
    matched = true;
    return '______';
  });
  return matched ? text : null;
}

// Reject overlapping dictionary senses rather than offering two valid meanings.
// This is a conservative local check, not a claim of semantic equivalence detection.
export function meaningChoices(answer:string,pool:string[],random=Math.random){
 const pos=(s:string)=>s.match(/^\s*(n|v|vt|vi|adj|adv|prep|pron|conj)\./i)?.[1].toLowerCase().replace(/^(vt|vi)$/,'v');
 const senses=(s:string)=>s.replace(/\b(?:n|v|vt|vi|adj|adv|prep|pron|conj)\./gi,'').split(/[;；,，\n]/).map(x=>x.trim()).filter(Boolean);
 const target=senses(answer),kind=pos(answer);
 return quizChoices(answer,pool.filter(candidate=>{
  const other=pos(candidate);
  if(kind&&other&&kind!==other)return false;
  return !senses(candidate).some(a=>target.some(b=>a.includes(b)||b.includes(a)));
 }),random);
}
