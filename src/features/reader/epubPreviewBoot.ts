/** A preview restores the active anchor, then asks epub.js for exactly one page.
 * Using next/prev preserves spine boundaries and CFI semantics of the library. */
export function epubPreviewBoot(direction: -1 | 0 | 1,revision=0,visualAnchor?:unknown,emitStages=false):string {
 return `(function(){
   window.qrCancelRestore?.();window.qrCancelPreview?.();window.qrCancelPaint?.();window.qrPreviewPromoted=false;
   window.qrPreviewRevision=${revision};window.qrPreviewStartedAt=Date.now();
   var original=window.qrPreviewSend||(window.qrPreviewSend=window.ReactNativeWebView.postMessage.bind(window.ReactNativeWebView));
   var send=function(raw){try{var value=JSON.parse(raw);value.revision=${revision};original(JSON.stringify(value));}catch{original(raw);}},stepping=false,settled=false,timer;
   window.qrCancelPreview=function(){settled=true;clearTimeout(timer);window.qrCancelPaint?.();};
   window.qrPreviewStage=function(stage){if(${emitStages})send(JSON.stringify({type:'qr-preview-stage',stage:stage}));};
   window.qrPreviewStage('navigation-start');
   function finish(message){if(settled)return;settled=true;clearTimeout(timer);if(message.type==='qr-preview-ready'&&window.qrPaintPage){window.qrPaintPage(message.location,${revision});return;}send(JSON.stringify(message));}
   window.ReactNativeWebView.postMessage=function(raw){
     var message;try{message=JSON.parse(raw);}catch{send(raw);return;}
     // A hidden reader's failed restore must reach its owner. Otherwise it stays
     // permanently unready while the visible page appears to ignore swipes.
     if(message.type==='qr-position-error'&&!window.qrPreviewPromoted&&${direction}!==0){finish({type:'qr-preview-error',code:message.code||'PREVIEW_RESTORE'});return;}
     if(message.type==='qr-position-ready')window.qrPreviewStage('position-restored');
     if(message.type!=='qr-position-ready'||window.qrPreviewPromoted||${direction}===0){if(message.type==='qr-position-ready'&&!window.qrPreviewPromoted&&window.qrPaintPage){window.qrPaintPage(message.location,${revision});return;}send(raw);return;}
     if(stepping)return;stepping=true;window.qrProgress?.pause();
     timer=setTimeout(function(){finish({type:'qr-preview-error',code:'PREVIEW_TIMEOUT'});},20000);
     var before=message.location;
     Promise.resolve().then(async function(){
       if(settled)return;
       if(window.qrVisualPosition&&${JSON.stringify(visualAnchor??null)}){
         var restoredVisual=window.qrRestoreCacheHit||await window.qrVisualPosition.restore(${JSON.stringify(visualAnchor??null)});
         if(settled)return;
         if(!restoredVisual)throw Error('VISUAL_ANCHOR');
         before=window.qrVisualPosition.capture(rendition.located(await rendition.manager.currentLocation()));
       }
       if(settled)return;
       window.qrPreviewStage('preview-step-start');
       return ${direction}===1?rendition.next():rendition.prev();}).then(function(){
       if(settled)return;
       return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});
     }).then(async function(){
       if(settled)return;
       window.qrPreviewStage('preview-step-complete');
       var rawLocation=await rendition.manager.currentLocation(),location=rendition.located(rawLocation);
       if(!location?.start?.cfi)throw Error('NO_LOCATION');
       if(window.qrVisualPosition)location=window.qrVisualPosition.capture(location);
       if(window.qrVisualPosition?window.qrVisualPosition.same(location,before):location.start.cfi===before.start.cfi){finish({type:'qr-preview-boundary'});return;}
       finish({type:'qr-preview-ready',location:location});
     }).catch(function(){finish({type:'qr-preview-error',code:'PREVIEW_STEP'});});
   };
 })();true;`;
}
