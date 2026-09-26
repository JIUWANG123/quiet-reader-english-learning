/** Inject before epubPreviewBoot and define qrDecoratePage in the same script. */
export const epubPaintPageScript = String.raw`
window.qrPaintToken=window.qrPaintToken||0;
window.qrCancelPaint=function(){window.qrPaintToken++;};
window.qrPaintPage=async function(location,revision){
  var token=++window.qrPaintToken,frame,watchdog,stop=Symbol('paint-stopped');
  function isCurrent(){return window.qrPreviewRevision===revision&&window.qrPaintToken===token;}
  if(!isCurrent())return false;
  var abort=new Promise(function(resolve,reject){
    watchdog=setTimeout(function(){reject(Error('PAINT_TIMEOUT'));},5000);
    function check(){if(!isCurrent()){resolve(stop);return;}frame=requestAnimationFrame(check);}
    check();
  });
  function guarded(promise){return Promise.race([promise,abort]);}
  function stage(value,epoch){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-preview-stage',stage:value,layoutEpoch:epoch,revision:revision}));}
  try{
    stage('decoration-start');
    window.qrDecoratePage?.();
    if(!isCurrent())return false;
    stage('decoration-complete');
    for(;;){
      var stable=await guarded(window.qrEpubParagraphs?.whenLayoutStable(isCurrent)??Promise.resolve(true));
      if(stable===stop||!stable||!isCurrent())return false;
      var epoch=window.qrEpubParagraphs?.layoutEpoch??0;
      stage('layout-stable',epoch);
      await guarded(new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});}));
      if(!isCurrent())return false;
      if((window.qrEpubParagraphs?.layoutEpoch??0)!==epoch||window.qrEpubParagraphs?.pendingLayout)continue;
      var rawLocation=await guarded(Promise.resolve().then(function(){return rendition.manager.currentLocation();}));
      if(rawLocation===stop||!isCurrent())return false;
      if((window.qrEpubParagraphs?.layoutEpoch??0)!==epoch||window.qrEpubParagraphs?.pendingLayout)continue;
      var finalLocation=rendition.located(rawLocation);
      if(!finalLocation?.start?.cfi)throw Error('LOCATION_UNSTABLE');
      if(window.qrVisualPosition)finalLocation=window.qrVisualPosition.capture(finalLocation);
      if(!finalLocation?.start?.cfi)throw Error('LOCATION_UNSTABLE');
      if(!isCurrent())return false;
      if((window.qrEpubParagraphs?.layoutEpoch??0)!==epoch||window.qrEpubParagraphs?.pendingLayout)continue;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-page-painted',paintRevision:revision,layoutEpoch:epoch,cacheHit:Boolean(window.qrRestoreCacheHit),location:finalLocation}));
      return true;
    }
  }catch(error){
    if(!isCurrent())return false;
    var code=error?.message==='LAYOUT_TIMEOUT'?'LAYOUT_TIMEOUT':error?.message==='PAINT_TIMEOUT'?'PAINT_TIMEOUT':error?.message==='LOCATION_UNSTABLE'?'LOCATION_UNSTABLE':'DECORATION_FAILED';
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-preview-error',code:code,revision:revision}));
    return false;
  }finally{
    clearTimeout(watchdog);
    if(frame)cancelAnimationFrame(frame);
  }
};true;
`;
