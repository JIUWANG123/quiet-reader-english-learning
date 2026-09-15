// Only missed words enter reinforcement; any subsequent miss resets the streak.
export function reinforce(previous:number|undefined,correct:boolean){
 if(!correct)return {streak:0,repeat:true};
 if(previous===undefined)return {streak:undefined,repeat:false};
 const streak=previous+1;
 return {streak,repeat:streak<2};
}
