// Shadow-root text is excluded from DOM textContent and epub.js CFI text offsets.
// Hosts are appended inside paragraphs, never inserted among spine/body siblings.
export const epubParagraphBridge = String.raw`
(function(){
  if(window.qrEpubParagraphs)return;
  var visible=false, entries=new Map(), states=new Map();
  function publish(id,item){var state={open:item.open,value:item.value,error:item.error};states.set(id,state);window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-paragraph-state',id:id,state:state}));}
  function paint(item,state){item.pending=false;item.open=Boolean(state.open);item.value=state.value||'';item.error=Boolean(state.error);item.box.textContent=item.value;item.box.hidden=!item.open;item.button.textContent=item.error?'重试':item.open?'收起':'译';item.button.setAttribute('aria-expanded',String(item.open));}
  function layoutKey(){window.qrParagraphLayoutKey=JSON.stringify([visible,Array.from(states.entries()).sort(function(a,b){return a[0].localeCompare(b[0]);})]);}
  var layoutTimer,layoutEpoch=0,stableEpoch=0,pendingLayout=false,internalResize=new WeakSet();
  function validLocation(location){return Boolean(location&&location.start&&location.start.cfi);}
  function whenLayoutStable(isCurrent){
    if(isCurrent&&!isCurrent())return Promise.resolve(false);
    if(!pendingLayout)return Promise.resolve(true);
    return new Promise(function(resolve,reject){
      var done=false,frame,watchdog=setTimeout(function(){finish(Error('LAYOUT_TIMEOUT'));},3000);
      function finish(error,value){if(done)return;done=true;clearTimeout(watchdog);if(frame)cancelAnimationFrame(frame);if(error)reject(error);else resolve(value);}
      function check(){
        if(isCurrent&&!isCurrent()){finish(null,false);return;}
        if(!pendingLayout&&stableEpoch===layoutEpoch){finish(null,true);return;}
        frame=requestAnimationFrame(check);
      }
      check();
    });
  }
  function relayout(content,fromResize){
    layoutKey();layoutEpoch++;pendingLayout=true;
    if(!fromResize){internalResize.add(content.window);try{content.window.dispatchEvent(new Event('resize'));}finally{internalResize.delete(content.window);}}
    clearTimeout(layoutTimer);
    layoutTimer=setTimeout(async function(){
      var epoch=layoutEpoch;
      try{await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});
        if(epoch!==layoutEpoch)return;
        var location=rendition.located(await rendition.manager.currentLocation());
        if(epoch!==layoutEpoch)return;
        if(!validLocation(location))return;
        if(window.qrVisualPosition)location=window.qrVisualPosition.capture(location);
        if(epoch!==layoutEpoch)return;
        stableEpoch=epoch;pendingLayout=false;
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-paragraph-layout',layoutEpoch:epoch,location:location}));
      }catch(error){}
    },100);
  }
  function attach(content){
    var doc=content.document;
    if(!doc.body||doc.body.dataset.qrParagraphs)return;
    doc.body.dataset.qrParagraphs='true';
    var paragraphs=Array.from(doc.querySelectorAll('p')).filter(function(p){return p.textContent.trim()&&!p.closest('[data-qr-ui]');});
    var texts=paragraphs.map(function(p){return p.textContent;});
    paragraphs.forEach(function(p,index){
      var host=doc.createElement('span');host.setAttribute('data-qr-ui','');
      host.style.cssText='display:none;user-select:none;-webkit-user-select:none';
      if(visible)host.style.display='inline';
      var shadow=host.attachShadow({mode:'open'}),style=doc.createElement('style');
      style.textContent=':host{color:inherit}button{font:12px/1.5 sans-serif;border:0;background:transparent;color:inherit;opacity:.7;min-height:28px;min-width:32px;vertical-align:baseline;cursor:pointer;text-align:left;padding:2px 6px}div{font:15px/1.8 sans-serif;white-space:pre-wrap;border-left:2px solid currentColor;padding:8px 12px;margin:4px 0 16px;opacity:.85;overflow-wrap:anywhere}div[hidden]{display:none}';
      shadow.appendChild(style);
      var button=doc.createElement('button'),box=doc.createElement('div');
      button.type='button';button.textContent='译';button.setAttribute('aria-label','翻译本段');button.setAttribute('aria-expanded','false');
      box.hidden=true;shadow.append(button,box);p.appendChild(host);
      var id=String(content.sectionIndex)+':'+index,item={doc:doc,host:host,button:button,box:box,content:content,pending:false,value:'',error:false,open:false};entries.set(id,item);if(states.has(id))paint(item,states.get(id));
      function toggle(e){
        e.preventDefault();e.stopPropagation();
        if(!visible)return;
        if(item.open&&!item.error){item.open=false;box.hidden=true;button.textContent='译';button.setAttribute('aria-expanded','false');publish(id,item);relayout(content);return;}
        item.open=true;button.setAttribute('aria-expanded','true');publish(id,item);
        if(item.value&&!item.error){box.hidden=false;button.textContent='收起';relayout(content);return;}
        if(item.pending)return;item.pending=true;button.textContent='…';button.setAttribute('aria-label','正在翻译本段');
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-epub-paragraph',id:id,targetText:texts[index],previousContext:texts.slice(Math.max(0,index-2),index).join('\n\n').slice(-2200),followingContext:texts.slice(index+1,index+3).join('\n\n').slice(0,2200)}));
      }
      button.addEventListener('click',toggle);box.addEventListener('click',function(e){if(item.error)return;toggle(e);});
    });
    // Drop detached documents so turning through a book cannot retain its entire DOM.
    entries.forEach(function(item,id){if(item.doc!==doc&&(!item.doc.defaultView||!item.doc.defaultView.frameElement?.isConnected))entries.delete(id);});
    if(!content.window.__qrParagraphResizeHook){content.window.__qrParagraphResizeHook=true;content.window.addEventListener('resize',function(){if(!internalResize.has(content.window))relayout(content,true);});}
    if(visible&&paragraphs.length)relayout(content);
  }
  window.qrEpubParagraphs={attach:attach,whenLayoutStable:whenLayoutStable,get layoutEpoch(){return layoutEpoch;},get stableEpoch(){return stableEpoch;},get pendingLayout(){return pendingLayout;},sync:function(snapshot){Object.keys(snapshot).forEach(function(id){var state=snapshot[id],old=states.get(id);states.set(id,state);var item=entries.get(id);if(item&&(!old||old.open!==state.open||old.value!==state.value||old.error!==state.error)){paint(item,state);relayout(item.content);}});layoutKey();},setVisible:function(value){
    value=Boolean(value);if(value===visible)return;visible=value;
    var contents=new Set();
    entries.forEach(function(item){
      item.host.style.display=visible?'inline':'none';
      // Hiding controls does not discard the shared paragraph expansion state.
      contents.add(item.content);
    });
    contents.forEach(function(content){relayout(content);});
  },reply:function(id,text,error){
    var item=entries.get(id);if(!item)return;
    item.pending=false;item.error=error;item.value=text;
    item.box.textContent=text;item.box.hidden=!item.open;publish(id,item);
    item.button.textContent=error?'重试':item.open?'收起':'译';item.button.setAttribute('aria-label',error?'重试翻译本段':'翻译本段');relayout(item.content);
  }};
  rendition.hooks.content.register(attach);
  rendition.getContents().forEach(attach);
})();true;
`;
