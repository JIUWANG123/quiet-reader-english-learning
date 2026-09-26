export const SOFT_PREVIEW_TIMEOUT=1800;
export const HARD_PREVIEW_TIMEOUT=8000;
export const previewStages=['created','webview-mounted','webview-ready','navigation-start','position-restored','preview-step-start','preview-step-complete','decoration-start','decoration-complete','layout-stable','page-painted','ui-readiness-ack'] as const;
export type PreviewStage=typeof previewStages[number];
/** Monotonic stage advancement is evidence of work. Repeated events are not. */
export class PreviewWatchdog {
 stage:PreviewStage='created';
 lastProgressAt:number;
 private warned=false;
 constructor(readonly started:number){this.lastProgressAt=started;}
 advance(stage:PreviewStage,now:number){
  if(previewStages.indexOf(stage)<=previewStages.indexOf(this.stage))return false;
  this.stage=stage;this.lastProgressAt=now;return true;
 }
 poll(now:number):'slow'|'timeout'|null{
  if(now-this.lastProgressAt>=HARD_PREVIEW_TIMEOUT)return 'timeout';
  if(!this.warned&&now-this.started>=SOFT_PREVIEW_TIMEOUT){this.warned=true;return 'slow';}
  return null;
 }
}
