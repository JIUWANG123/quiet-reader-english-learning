export type ReadingEvent = 'gesture-start'|'gesture-blocked'|'gesture-release'|'preview-request'|'preview-ready'|'preview-error'|'preview-slow'|'preview-stage'|'neighbor-invalidated'|'webview-process-gone'|'reader-session-start'|'reader-session-ready'|'reader-session-background'|'reader-session-foreground'|'reader-session-clean-end'|'reader-session-recover'|'previous-session-unclean'|'previous-process-exit'|'memory-pressure'|'resource-prepare'|'load'|'started'|'restore-ready'|'restore-error'|'progress'|'saved'|'save-error'|'journal-error';
export type ReadingDetail = {
 bookId?:string;cfi?:string;target?:string;documentId?:string;previousId?:string;nextId?:string;sessionId?:string;
 progress?:number;code?:string;mode?:string;direction?:number;requestId?:string;generation?:number;duration?:number;
 cacheHit?:boolean;lockReason?:string;isAnimating?:boolean;previewReady?:boolean;slot?:string;revision?:number;
 previousRevision?:number;nextRevision?:number;layoutRevision?:number;currentReady?:boolean;active?:boolean;didCrash?:boolean;
 reason?:string;stage?:string;origin?:string;archiveSize?:number;extractedSize?:number;unzipDuration?:number;
 importance?:number;pss?:number;rss?:number;timestamp?:number;pressure?:string;
};
export function fingerprint(value:string){let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return (h>>>0).toString(16);}
const reasons=['paragraph-layout','font-layout-change','mode-change','viewport-change','manual-jump','other','background','memory-pressure'];
const stages=['created','webview-mounted','webview-ready','navigation-start','position-restored','preview-step-start','preview-step-complete','decoration-start','decoration-complete','layout-stable','page-painted','ui-readiness-ack'];
const origins=['cold','recycled','layout','retry'];
const slots=['current','previous','next'];
const pressures=['running-low','running-critical','complete','unknown'];
const integer=(value:unknown)=>Number.isSafeInteger(value)&&typeof value==='number'&&value>=0?value:undefined;
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value):undefined;
const allowed=(value:unknown,values:string[])=>typeof value==='string'&&values.includes(value)?value:undefined;
const id=(value:unknown)=>typeof value==='string'&&/^[a-zA-Z0-9:-]{1,80}$/.test(value)?value:undefined;
const session=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:undefined;
const bool=(value:unknown)=>typeof value==='boolean'?value:undefined;
export function appendReadingEvent<T>(rows:T[],row:T){rows.push(row);if(rows.length>500)rows.splice(0,rows.length-500);}
export function sanitizeReadingEvent(event:ReadingEvent,detail:ReadingDetail={},time=Date.now(),version?:string){
 return {time,version,event,book:detail.bookId?fingerprint(detail.bookId):undefined,anchor:detail.cfi?fingerprint(detail.cfi):undefined,
  target:detail.target?fingerprint(detail.target):undefined,document:detail.documentId?fingerprint(detail.documentId):undefined,
  previous:detail.previousId?fingerprint(detail.previousId):undefined,next:detail.nextId?fingerprint(detail.nextId):undefined,
  sessionId:session(detail.sessionId),progress:number(detail.progress),direction:[-1,0,1].includes(detail.direction??2)?detail.direction:undefined,
  requestId:id(detail.requestId),generation:integer(detail.generation),duration:number(detail.duration),cacheHit:bool(detail.cacheHit),
  isAnimating:bool(detail.isAnimating),previewReady:bool(detail.previewReady),currentReady:bool(detail.currentReady),active:bool(detail.active),didCrash:bool(detail.didCrash),
  lockReason:allowed(detail.lockReason,['ANIMATING','PREVIEW_PENDING','BOUNDARY','CANCELLED','TIMEOUT']),
  code:typeof detail.code==='string'&&/^[A-Z_]{1,40}$/.test(detail.code)?detail.code:undefined,
  mode:allowed(detail.mode,['swipe','tap','scroll']),slot:allowed(detail.slot,slots),reason:allowed(detail.reason,reasons),
  stage:allowed(detail.stage,stages),origin:allowed(detail.origin,origins),pressure:allowed(detail.pressure,pressures),
  revision:integer(detail.revision),previousRevision:integer(detail.previousRevision),nextRevision:integer(detail.nextRevision),layoutRevision:integer(detail.layoutRevision),
  archiveSize:number(detail.archiveSize),extractedSize:number(detail.extractedSize),unzipDuration:number(detail.unzipDuration),
  importance:integer(detail.importance),pss:number(detail.pss),rss:number(detail.rss),timestamp:number(detail.timestamp)};
}
const exitReasons:Record<number,string>={0:'UNKNOWN',1:'EXIT_SELF',2:'SIGNALED',3:'LOW_MEMORY',4:'CRASH',5:'CRASH_NATIVE',6:'ANR',7:'INITIALIZATION_FAILURE',8:'PERMISSION_CHANGE',9:'EXCESSIVE_RESOURCE_USAGE',10:'USER_REQUESTED',11:'USER_STOPPED',12:'DEPENDENCY_DIED',13:'OTHER',14:'FREEZER',15:'PACKAGE_STATE_CHANGE',16:'PACKAGE_UPDATED'};
export function classifyProcessExit(reason:number){const name=exitReasons[reason]??'UNKNOWN';return{reason:name,crash:['CRASH','CRASH_NATIVE','ANR','LOW_MEMORY','EXCESSIVE_RESOURCE_USAGE'].includes(name)};}
