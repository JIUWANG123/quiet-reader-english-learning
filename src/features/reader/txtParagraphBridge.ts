// Shadow text stays outside source offsets. Hidden legacy labels in the HTML
// keep offsets of existing TXT sentence notes stable across this UI update.
export const txtParagraphBridge = `
(function(){
  var entries=new Map(),visible=false;
  function publish(id,item){window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-paragraph-state',id:id,state:{open:item.open,pending:item.pending,value:item.value,error:item.error}}));}
  document.querySelectorAll('.qrp').forEach(function(host){
    var shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');
    style.textContent='button{font:12px/1.5 sans-serif;border:0;background:transparent;color:inherit;opacity:.7;min-height:28px;min-width:32px;padding:2px 6px;vertical-align:baseline;cursor:pointer}div{font:15px/1.8 sans-serif;white-space:pre-wrap;border-left:2px solid currentColor;margin:6px 0;padding:8px 12px;opacity:.8;overflow-wrap:anywhere}div[hidden]{display:none}';
    var button=document.createElement('button'),box=document.createElement('div');
    button.type='button';button.textContent='译';button.setAttribute('aria-label','翻译本段');button.setAttribute('aria-expanded','false');box.hidden=true;
    shadow.append(style,button,box);
    var item={host:host,button:button,box:box,open:false,pending:false,value:'',error:false};entries.set(Number(host.dataset.i),item);
    function close(){item.open=false;box.hidden=true;button.textContent='译';button.setAttribute('aria-expanded','false');publish(Number(host.dataset.i),item);window.dispatchEvent(new Event('resize'));}
    button.addEventListener('click',function(e){
      e.preventDefault();e.stopPropagation();if(!visible)return;
      if(item.open&&!item.error){close();return;}
      item.open=true;button.setAttribute('aria-expanded','true');
      if(item.value&&!item.error){box.hidden=false;button.textContent='收起';publish(Number(host.dataset.i),item);window.dispatchEvent(new Event('resize'));return;}
      if(item.pending)return;item.pending=true;button.textContent='…';publish(Number(host.dataset.i),item);
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-paragraph',id:Number(host.dataset.i)}));
    });
    box.addEventListener('click',function(e){e.stopPropagation();if(!item.error)close();});
  });
  // Apply state without publishing it again: all three documents must have the
  // same expanded paragraphs or their page coordinates diverge after a turn.
  window.qrParagraphSync=function(id,state){
    var item=entries.get(id);if(!item)return;
    item.open=Boolean(state.open);item.pending=Boolean(state.pending);item.value=typeof state.value==='string'?state.value:'';item.error=Boolean(state.error);
    item.box.textContent=item.value;item.box.hidden=!visible||!item.open||!item.value;
    item.button.textContent=item.pending?'…':item.error?'重试':item.open?'收起':'译';item.button.setAttribute('aria-expanded',String(item.open));
    window.dispatchEvent(new Event('resize'));
  };
  window.qrParagraphVisibility=function(value){
    visible=Boolean(value);entries.forEach(function(item){item.host.style.display=visible?'inline':'none';if(!visible){item.open=false;item.box.hidden=true;item.button.textContent='译';item.button.setAttribute('aria-expanded','false');}});
    window.dispatchEvent(new Event('resize'));
  };
  window.qrParagraphResult=function(id,text,error){
    var item=entries.get(id);if(!item)return;
    item.pending=false;item.error=error;item.value=text;item.box.textContent=text;item.box.hidden=!item.open;
    item.button.textContent=error?'重试':item.open?'收起':'译';window.dispatchEvent(new Event('resize'));
  };
})();true;`;
