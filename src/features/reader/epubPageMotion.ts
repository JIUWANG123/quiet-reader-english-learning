// Keep epub.js responsible for pagination/CFIs. Animate its viewport only around
// the next/prev promise. PaperTurn owns the only visual animation above the WebView.
export const epubPageMotion = `
(function(){
 if(window.qrPageMotion)return;
 var busy=false, pending=null;
 var next=rendition.next.bind(rendition), prev=rendition.prev.bind(rendition);
 var container=rendition.manager.container;
 var guard=window.qrSelectionGuard={container:container,left:container.scrollLeft,top:container.scrollTop,locked:false,paginated:rendition._layout.flow()==='paginated'};
 container.addEventListener('scroll',function(){if(guard.locked&&rendition._layout.flow()==='paginated'){container.scrollLeft=guard.left;container.scrollTop=guard.top;}});
 async function turn(direction){
  window.qrReader?.cancelPendingSelection();
  if(guard.locked||rendition.getContents().some(function(c){var s=c.window.getSelection();return s&&!s.isCollapsed;})){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-turn-settled',moved:false}));return;}
  if(busy){pending=direction;return;}
  var location=rendition.currentLocation();
  if(location&&((direction>0&&location.atEnd)||(direction<0&&location.atStart))){window.ReactNativeWebView.postMessage(JSON.stringify({type:"qr-turn-settled",moved:false}));return;}
  busy=true;var succeeded=false;
  try {
   await (direction>0?next():prev());
   succeeded=true;
   // epub.js resolves only after the new location is installed; an extra two
   // animation-frame wait created a visible pause before the page appeared.
  } catch(error){
   pending=null;
   window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-turn-error'}));
  } finally {
   busy=false;
   window.ReactNativeWebView.postMessage(JSON.stringify({type:"qr-turn-settled",moved:succeeded}));
   if(!guard.locked){guard.left=container.scrollLeft;guard.top=container.scrollTop;}
   if(pending!==null){var direction=pending;pending=null;void turn(direction);}
  }
 }
 rendition.next=function(){return turn(1);};rendition.prev=function(){return turn(-1);};
 window.qrPageMotion={whenIdle:function(){return new Promise(function(resolve){function check(){if(!busy&&pending===null)resolve();else setTimeout(check,20);}check();});}};
})();true;`;
