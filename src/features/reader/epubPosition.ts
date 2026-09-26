// The wrapper displays page one before onReady. Own the asynchronous restore
// handshake so that transient initial relocations never overwrite the saved CFI.
export function restoreEpubPosition(cfi: string | null | undefined,visualAnchor?:unknown): string {
  return `(function(){
    if(window.qrCancelRestore)window.qrCancelRestore();
    window.qrProgress?.pause();
    var active=true,stage='DISPLAY',timer=setTimeout(function(){finish({type:'qr-position-error',code:'RESTORE_TIMEOUT'});},20000);
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
      ${cfi ? `return rendition.display(${JSON.stringify(cfi)});` : 'return undefined;'}
    })
    .then(async function(){
      stage='LAYOUT';var deadline=Date.now()+2000,retried=false;
      while(active){
        var raw=await rendition.manager.currentLocation();var location=raw&&raw.length?rendition.located(raw):null;
        var valid=location&&location.start&&location.start.cfi&&location.end&&location.end.cfi;
        ${cfi ? `if(valid){stage='ANCHOR';var compare=ePub.CFI.prototype.compare;valid=compare(location.start.cfi,${JSON.stringify(cfi)})<=0&&compare(location.end.cfi,${JSON.stringify(cfi)})>=0;}` : ''}
        if(valid){finish({type:'qr-position-ready',location:location});return;}
        if(Date.now()>=deadline){
          ${cfi ? `if(!retried&&active){retried=true;stage='DISPLAY';await rendition.display(${JSON.stringify(cfi)});stage='LAYOUT';deadline=Date.now()+2000;continue;}` : ''}
          finish({type:'qr-position-error',code:'RESTORE_'+stage});return;}
        await new Promise(function(resolve){setTimeout(resolve,50);});
      }
    }).catch(function(){finish({type:'qr-position-error',code:'RESTORE_'+stage});});
  })();true;`;
}
