export type WarmupSettings={width:number;height:number;fontSize:number;lineHeight:number;margin:number;theme:string;paragraphTranslation:boolean;readingMode:'swipe'|'tap'|'scroll'};
export type WarmupSnapshot={key:string;sourceFingerprint:string;createdAt:number;locations:string[];current?:string;next?:string;previous?:string;section?:number;visual?:{x:number;y:number;width:number;height:number;section:number}};
export type WarmupStore={read:()=>string|undefined;write:(value:string)=>void};
export function warmupKey(sourceFingerprint:string,settings:WarmupSettings){return JSON.stringify([sourceFingerprint,settings.width,settings.height,settings.fontSize,settings.lineHeight,settings.margin,settings.theme,settings.paragraphTranslation,settings.readingMode]);}
export function createWarmupSnapshot(sourceFingerprint:string,settings:WarmupSettings,locations:string[],extra:Omit<WarmupSnapshot,'key'|'sourceFingerprint'|'createdAt'|'locations'>={}):WarmupSnapshot{return{key:warmupKey(sourceFingerprint,settings),sourceFingerprint,createdAt:Date.now(),locations:[...locations],...extra};}
export function readWarmup(store:WarmupStore,sourceFingerprint:string,settings:WarmupSettings):WarmupSnapshot|undefined{
 try{const value=JSON.parse(store.read()??'');const key=warmupKey(sourceFingerprint,settings);if(!value||value.key!==key||value.sourceFingerprint!==sourceFingerprint||!Array.isArray(value.locations)||value.locations.length===0||value.locations.length>20000||!value.locations.every((item:unknown)=>typeof item==='string'&&item.startsWith('epubcfi(')))return;return value as WarmupSnapshot;}catch{return;}
}
export function writeWarmup(store:WarmupStore,snapshot:WarmupSnapshot){
 if(snapshot.locations.length===0||snapshot.locations.length>20000||snapshot.locations.some(item=>!item.startsWith('epubcfi(')))return false;
 try{store.write(JSON.stringify(snapshot));return true;}catch{return false;}
}
