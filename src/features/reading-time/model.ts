export const IDLE_MS = 5 * 60_000;
export function localDay(time:number) {
 const d=new Date(time);
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// Split at local midnight, including daylight-saving transitions.
export function readingSlices(from:number,to:number,lastInteraction:number,active:boolean) {
 const end=Math.min(to,lastInteraction+IDLE_MS);
 const slices:{day:string;milliseconds:number}[]=[];
 if(!active||!Number.isFinite(from)||!Number.isFinite(end)||end<=from)return slices;
 for(let at=from;at<end;){
  const date=new Date(at);date.setHours(24,0,0,0);
  const next=Math.min(end,date.getTime());
  slices.push({day:localDay(at),milliseconds:next-at});at=next;
 }
 return slices;
}
export type FocusPreferences={minutes:number;breakMinutes:number;vibrate:boolean;checkInMinutes:number};
export const focusDefaults:FocusPreferences={minutes:25,breakMinutes:5,vibrate:false,checkInMinutes:5};
export function focusPreferences(raw:Partial<FocusPreferences>):FocusPreferences {
 const bounded=(v:unknown,fallback:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(1,Math.min(max,Math.round(v))):fallback;
 return {minutes:bounded(raw.minutes,25,120),breakMinutes:bounded(raw.breakMinutes,5,30),vibrate:raw.vibrate===true,checkInMinutes:bounded(raw.checkInMinutes,5,120)};
}
export function readingStreak(days:string[],now=Date.now()){
 const set=new Set(days),date=new Date(now);let count=0;
 if(!set.has(localDay(date.getTime())))date.setDate(date.getDate()-1);
 while(set.has(localDay(date.getTime()))){count++;date.setDate(date.getDate()-1);}
 return count;
}

export function countdownRemaining(deadline:number,now:number){return deadline>0?Math.max(0,Math.ceil((deadline-now)/1000)):0;}
