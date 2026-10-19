// The wrapper displays page one before onReady. Own the asynchronous restore
// handshake so that transient initial relocations never overwrite the saved CFI.
export function restoreEpubPosition(cfi: string | null | undefined,visualAnchor?:unknown,flow:'scroll'|'paginated'='paginated'): string {
  const anchorIsCfi=Boolean(cfi&&/^epubcfi\(/i.test(cfi));
  return `(function(){
    if(window.qrCancelRestore)window.qrCancelRestore();
    window.qrProgress?.pause();
    var active=true,stage='DISPLAY',displayed=false,anchorIsCfi=${JSON.stringify(anchorIsCfi)},timer=setTimeout(function(){finish({type:'qr-position-error',code:'RESTORE_TIMEOUT'});},20000);
    window.qrCancelRestore=function(){active=false;clearTimeout(timer);};
    function finish(message){if(!active)return;active=false;clearTimeout(timer);if(message.type==='qr-position-ready')window.qrProgress?.start(message.location);window.ReactNativeWebView.postMessage(JSON.stringify(message));}
    Promise.resolve().then(async function(){
      if(!active)return;
      window.qrRestoreCacheHit=false;
      if(${JSON.stringify(visualAnchor??null)}&&window.qrVisualPosition){
        var hit=await window.qrVisualPosition.restore(${JSON.stringify(visualAnchor??null)});
        if(!active)return;
        if(hit){window.qrRestoreCacheHit=true;return;}
      }
      if(!active)return;
      ${cfi ? `return rendition.display(${JSON.stringify(cfi)}).then(function(){displayed=true;});` : 'return undefined;'}
    })
    .then(async function(){
      stage='LAYOUT';var deadline=Date.now()+2000,retried=false;
      while(active){
        var raw=await rendition.manager.currentLocation();var location=raw&&raw.length?rendition.located(raw):null;
        var valid=location&&location.start&&location.start.cfi&&location.end&&location.end.cfi;
        ${cfi ? `if(valid&&${JSON.stringify(flow)}!=='scroll'){stage='ANCHOR';
          if(!anchorIsCfi){try{var target=book.spine.get(${JSON.stringify(cfi)});valid=Boolean(target&&location.start.index===target.index);}catch{valid=false;}}
          else {var compare=ePub.CFI.prototype.compare;var contains=compare(location.start.cfi,${JSON.stringify(cfi)})<=0&&compare(location.end.cfi,${JSON.stringify(cfi)})>=0;
            // Repagination can move the saved CFI a few characters past the new
            // page edge. The explicit display already chose the right section;
            // accepting that page avoids a false RESTORE_ANCHOR loop.
            if(!contains&&(displayed||window.qrRestoreCacheHit)){try{var target=book.spine.get(${JSON.stringify(cfi)});contains=Boolean(target&&location.start.index===target.index);}catch{}}
            valid=contains;}
          }` : ''}
        if(valid){finish({type:'qr-position-ready',location:location});return;}
        if(Date.now()>=deadline){
          ${cfi ? `if(!retried&&active){retried=true;stage='DISPLAY';await rendition.display(${JSON.stringify(cfi)});displayed=true;stage='LAYOUT';deadline=Date.now()+2000;continue;}` : ''}
          ${cfi&&anchorIsCfi ? `if(active){try{var fallbackTarget=book.spine.get(${JSON.stringify(cfi)});if(fallbackTarget&&fallbackTarget.href){stage='CHAPTER_FALLBACK';await rendition.display(fallbackTarget.href);var fallbackRaw=await rendition.manager.currentLocation();var fallbackLocation=fallbackRaw&&fallbackRaw.length?rendition.located(fallbackRaw):null;if(fallbackLocation&&fallbackLocation.start&&fallbackLocation.start.index===fallbackTarget.index){finish({type:'qr-position-ready',location:fallbackLocation});return;}}}catch{}}` : ''}
          finish({type:'qr-position-error',code:'RESTORE_'+stage});return;}
        await new Promise(function(resolve){setTimeout(resolve,50);});
      }
    }).catch(function(){finish({type:'qr-position-error',code:'RESTORE_'+stage});});
  })();true;`;
}
