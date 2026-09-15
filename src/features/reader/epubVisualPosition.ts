/** Original CFI remains the persisted anchor. Pixel position is session-only and
 * valid only for the same section and layout revision, including translation. */
export const epubVisualPosition = String.raw`
(function(){
 if(window.qrVisualPosition)return;
 window.qrVisualPosition={
  capture:function(location){
   var container=rendition.manager.container;
   return Object.assign({},location,{qrVisual:{layout:window.qrParagraphLayoutKey||'',section:location.start.index,x:container.scrollLeft,y:container.scrollTop,width:container.clientWidth,height:container.clientHeight}});
  },
  restore:async function(location){
   var visual=location&&location.qrVisual;if(!visual||visual.layout!==(window.qrParagraphLayoutKey||''))return false;
   var container=rendition.manager.container,current=rendition.currentLocation();
   if(!current||current.start.index!==visual.section||container.clientWidth!==visual.width||container.clientHeight!==visual.height)return false;
   rendition.manager.scrollTo(visual.x,visual.y,true);
   await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});
   return Math.abs(container.scrollLeft-visual.x)<2&&Math.abs(container.scrollTop-visual.y)<2;
  },
  same:function(a,b){
   var x=a&&a.qrVisual,y=b&&b.qrVisual;
   if(x&&y)return x.section===y.section&&Math.abs(x.x-y.x)<2&&Math.abs(x.y-y.y)<2;
   return a&&b&&a.start.cfi===b.start.cfi;
  }
 };
})();true;`;
