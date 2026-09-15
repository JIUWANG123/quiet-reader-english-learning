/** UI-thread safe decision shared by native gestures and regression tests. */
export function pageTurnDecision(distance:number,velocity:number,width:number,previousReady:boolean,nextReady:boolean): -1|0|1 {
 'worklet';
 if(!Number.isFinite(width)||width<=0||!Number.isFinite(distance)||!Number.isFinite(velocity))return 0;
 if(Math.abs(distance)<14)return 0;
 const direction=distance<0?1:-1;
 if(direction===1?!nextReady:!previousReady)return 0;
 // A fast reversal should rebound, rather than committing in the old direction.
 if(Math.abs(velocity)>900&&Math.sign(velocity)!==Math.sign(distance))return 0;
 return Math.abs(distance)>=width*.28||Math.abs(velocity)>900?direction:0;
}
