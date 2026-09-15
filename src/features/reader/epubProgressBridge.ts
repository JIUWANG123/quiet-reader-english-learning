// Progress messages have no dependency on chapter metadata or the wrapper UI.
export const epubProgressBridge = `(function(){
 if(window.qrProgress)return;
 var enabled=false,last='';
 function fraction(location){return book.locations.total>0?book.locations.percentageFromCfi(location.start.cfi):undefined;}
 function send(type,location,requestId){window.ReactNativeWebView.postMessage(JSON.stringify({type:type,location:location,fraction:location?fraction(location):undefined,requestId:requestId}));}
 window.qrProgress={
  pause:function(){enabled=false;},
  start:function(location){enabled=true;last=location.start.cfi+'|'+fraction(location);},
  report:function(location){if(!enabled||!location?.start?.cfi)return;var key=location.start.cfi+'|'+fraction(location);if(key===last)return;last=key;send('qr-progress',location);},
  capture:async function(requestId){try{
   if(!enabled)throw Error();
   if(window.qrPageMotion?.whenIdle)await window.qrPageMotion.whenIdle();
   await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});
   var raw=await rendition.manager.currentLocation();var location=rendition.located(raw);
   if(!enabled||!location?.start?.cfi)throw Error();
   send('qr-position-snapshot',location,requestId);
  }catch(error){send('qr-position-snapshot',null,requestId);}}
 };
})();true;`;
