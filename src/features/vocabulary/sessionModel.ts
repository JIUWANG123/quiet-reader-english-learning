export type StudyAnswer='correct'|'wrong'|'reveal'|'defer';
export type StudyWordState={status:'active'|'complete'|'deferred'|'removed';missed:boolean;streak:number;introduced?:boolean;practiceCorrect?:number;spacingDebt?:number};
export type StudyDraft={mode:string;input:string;revealed:boolean;correct:boolean|null;answer:string;prompt:string;choices:string[]};
export type StudySession={version:1;queue:string[];words:Record<string,StudyWordState>;answered:number;draft?:StudyDraft};

export function startSession(words:string[]):StudySession{
 const queue=[...new Set(words)].slice(0,5);
 return {version:1,queue,words:Object.fromEntries(queue.map(word=>[word,{status:'active',missed:false,streak:0}])),answered:0};
}
export function introduceWord(previous:StudySession,word:string):StudySession{
 if(previous.queue[0]!==word)return previous;
 const state=cloneSession(previous);state.words[word].introduced=true;return state;
}

export function resumeSession(previous:StudySession|undefined,candidates:string[]):StudySession{
 const pending=previous?Object.keys(previous.words).filter(w=>previous.words[w].status==='deferred'):[];
 const next=startSession([...pending,...candidates]);
 for(const w of pending)if(next.words[w])next.words[w]={...previous!.words[w],status:'active'};
 // Carry spacing across groups: eligible fresh questions precede pending words.
 enforceSpacing(next);
 return next;
}
export function reconcileSession(previous:StudySession,available:string[]):StudySession{
 const allowed=new Set(available),state=cloneSession(previous);
 for(const [word,value] of Object.entries(state.words)){
  if(!allowed.has(word)&&value.status!=='complete')value.status='removed';
 }
 state.queue=state.queue.filter(word=>state.words[word].status==='active');
 enforceSpacing(state);
 if(state.queue[0]!==previous.queue[0])delete state.draft;
 return state;
}

// Pure, serializable transitions. Scheduling dates are deliberately settled
// separately, once per completed word, rather than once per reinforcement.
export function answerSession(previous:StudySession,answer:StudyAnswer):StudySession{
 const id=previous.queue[0];
 if(!id)return previous;
 const state=cloneSession(previous),word=state.words[id];
 delete state.draft;
 state.queue.shift();state.answered++;
 for(const [other,value] of Object.entries(state.words))if(other!==id&&value.spacingDebt)value.spacingDebt--;
 word.spacingDebt=2;
 if(answer==='defer'){word.status='deferred';return state;}
 if(answer==='correct'){
  word.streak++;
  word.practiceCorrect=(word.practiceCorrect??0)+1;
  const ready=word.missed?word.streak>=2:!word.introduced||word.practiceCorrect>=2;
  if(ready){word.status='complete';return state;}
 }else{word.missed=true;word.streak=0;}
 // Never manufacture filler questions or immediately repeat the only word.
 if(new Set(state.queue.slice(0,2)).size<2){word.status='deferred';return state;}
 state.queue.splice(2,0,id);
 return state;
}

// Explicit copies keep the transition independent of optional JS engine globals.
function cloneSession(state:StudySession):StudySession{
 return {...state,queue:[...state.queue],words:Object.fromEntries(Object.entries(state.words).map(([key,value])=>[key,{...value}])),...(state.draft?{draft:{...state.draft,choices:[...state.draft.choices]}}:{})};
}

function enforceSpacing(state:StudySession){
 const remaining=[...state.queue];state.queue=[];
 while(remaining.length){
  const index=remaining.findIndex(w=>(state.words[w].spacingDebt??0)<=state.queue.length);
  if(index<0)break;
  state.queue.push(remaining.splice(index,1)[0]);
 }
 for(const w of remaining)state.words[w].status='deferred';
}
