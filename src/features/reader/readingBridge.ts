// Range-based decoration preserves EPUB text nodes and CFI offsets.
export function readingBridge() {
  const root = window as any;
  if (root.qrReader) return;
  let marks:any[]=[];let meaningsVisible=true;
  let sentenceMarks:any[]=[];let marksKey='[]',sentenceMarksKey='[]';
  const documents=new Map<Document, {draw:()=>void;cancelHold:()=>void}>();
  function post(value:unknown) { root.ReactNativeWebView.postMessage(JSON.stringify(value)); }
  function attach(doc:Document, sectionKey?:string) {
    if(sectionKey)(doc as any).qrSectionKey=sectionKey;
    if(documents.has(doc)||!doc.body) return;
    const win=doc.defaultView as any;
    let heldX=win.scrollX,heldY=win.scrollY;
    win.addEventListener('scroll',()=>{const guard=root.qrSelectionGuard;if(guard?.locked&&guard.paginated&&(win.scrollX!==heldX||win.scrollY!==heldY))win.scrollTo(heldX,heldY);});
    const layer=doc.createElement('div');
    layer.setAttribute('aria-hidden','true'); layer.style.cssText='position:absolute;top:0;left:0;pointer-events:none;z-index:9999;';
    doc.documentElement.appendChild(layer);
    let noteRanges:Range[]=[];
    const visibilityStyle=doc.createElement('style');visibilityStyle.textContent='html.qr-hide-meanings .qr-meaning{display:none!important}';doc.head.appendChild(visibilityStyle);doc.documentElement.classList.toggle('qr-hide-meanings',!meaningsVisible);
    const sheet=doc.createElement('style'); doc.head.appendChild(sheet);
    function payload(range:Range, mode:string) {
      const before=doc.createRange();before.selectNodeContents(doc.body);before.setEnd(range.startContainer,range.startOffset);
      const after=doc.createRange();after.selectNodeContents(doc.body);after.setStart(range.endContainer,range.endOffset);
      const startOffset=before.toString().length;
      const element=range.startContainer.nodeType===3?range.startContainer.parentElement:range.startContainer as Element;
      const block=element?.closest('p,li,blockquote,h1,h2,h3');
      const paragraphText=block?.textContent??range.toString();
      return {type:'qr-selection',mode,paragraphText,targetText:range.toString(),previousContext:before.toString().slice(-2200),followingContext:after.toString().slice(0,2200),sectionKey:(doc as any).qrSectionKey,startOffset,endOffset:startOffset+range.toString().length};
    }
    const handles=['start','end'].map((side)=>{
      const handle=doc.createElement('div');handle.dataset.qrUi='';handle.dataset.qrHandle=side;
      handle.setAttribute('role','slider');handle.setAttribute('aria-label',side==='start'?'调整选区起点':'调整选区终点');
      handle.style.cssText='display:none;position:absolute;width:30px;height:30px;border-radius:50%;background:#5687ae;border:3px solid white;box-sizing:border-box;z-index:10001;touch-action:none;';
      doc.documentElement.appendChild(handle);
      let fixed:Range|null=null;
      handle.addEventListener('touchstart',event=>{event.stopPropagation();event.preventDefault();const selected=win.getSelection();if(selected?.rangeCount)fixed=selected.getRangeAt(0).cloneRange();},{passive:false});
      handle.addEventListener('touchmove',event=>{
        event.stopPropagation();event.preventDefault();const point=event.touches[0];if(!fixed||!point)return;
        const hit=(doc as any).caretRangeFromPoint?.(point.clientX,Math.max(0,Math.min(win.innerHeight-1,point.clientY-12)));
        if(!hit||!doc.body.contains(hit.startContainer)||hit.startContainer.parentElement?.closest('button,.qr-translation'))return;
        const next=fixed.cloneRange();
        // Reject crossed handles so dragging never collapses into a page turn.
        const boundary=fixed.cloneRange();boundary.collapse(side!=='start');
        const order=hit.compareBoundaryPoints(0,boundary);
        if(side==='start'&&order>=0||side==='end'&&order<=0)return;
        if(side==='start')next.setStart(hit.startContainer,hit.startOffset);else next.setEnd(hit.startContainer,hit.startOffset);
        const selected=win.getSelection();selected.removeAllRanges();selected.addRange(next);selection();
      },{passive:false});
      const end=(event:Event)=>{event.stopPropagation();event.preventDefault();fixed=null;root.qrSuppressClickUntil=Date.now()+500;};
      handle.addEventListener('touchend',end,{passive:false});handle.addEventListener('touchcancel',end,{passive:false});
      return handle;
    });
    function positionHandles(range?:Range){
      handles.forEach((handle,i)=>{if(!range){handle.style.display='none';return;}const rects=Array.from(range.getClientRects());const rect=i?rects[rects.length-1]:rects[0];if(!rect){handle.style.display='none';return;}handle.style.display='block';handle.style.left=((i?rect.right:rect.left)+win.scrollX-15)+'px';handle.style.top=(rect.bottom+win.scrollY-2)+'px';});
    }
    function selection() {
      const selected=win.getSelection();
      if(selected&&!selected.isCollapsed&&!doc.documentElement.classList.contains('qr-selecting'))selected.removeAllRanges();
      const active=Boolean(selected&&!selected.isCollapsed&&selected.rangeCount);
      post({type:'qr-selection-state',active});
      if(root.qrSelectionGuard)root.qrSelectionGuard.locked=active;
      if(!active){positionHandles();doc.documentElement.classList.remove('qr-selecting');root.qrReader.selected=null;return;}
      positionHandles(selected.getRangeAt(0));
      root.qrReader.selected=payload(selected.getRangeAt(0),'translate');
      const rect=selected.getRangeAt(0).getBoundingClientRect();
      const toolbarTop=rect.bottom+76<win.innerHeight?rect.bottom+8:Math.max(8,rect.top-76);
      post({...root.qrReader.selected,type:'qr-selection-ready',toolbarTop});
    }
    let selectionTimer:ReturnType<typeof setTimeout>;
    doc.addEventListener('selectionchange',()=>{clearTimeout(selectionTimer);selectionTimer=setTimeout(selection,80);});
    function selectSentence(x:number,y:number){
      heldX=win.scrollX;heldY=win.scrollY;
      const guard=root.qrSelectionGuard;if(guard&&!guard.locked){guard.left=guard.container.scrollLeft;guard.top=guard.container.scrollTop;}
      const hit=(doc as any).caretRangeFromPoint?.(x,y);
      const caret=(doc as any).caretPositionFromPoint?.(x,y);
      const node=hit?.startContainer??caret?.offsetNode,offset=hit?.startOffset??caret?.offset;
      if(!node||node.nodeType!==3)return;
      // caretRangeFromPoint snaps blank margins to the nearest text. A hold
      // must actually land on a line before it can enable sentence selection.
      const probe=doc.createRange(),length=node.textContent?.length??0;
      if(!length)return;
      const index=Math.max(0,Math.min(length-1,offset));
      probe.setStart(node,index);probe.setEnd(node,index+1);
      const hitRect=probe.getBoundingClientRect();
      if(y<hitRect.top||y>hitRect.bottom||x<hitRect.left-14||x>hitRect.right+14)return;
      const block=node.parentElement?.closest('p,li,blockquote,h1,h2,h3,div')??doc.body;
      const before=doc.createRange();before.selectNodeContents(block);before.setEnd(node,offset);
      const at=before.toString().length,text=block.textContent??'';
      let start=0,end=text.length;
      if(win.Intl?.Segmenter){for(const part of new win.Intl.Segmenter('en',{granularity:'sentence'}).segment(text))if(at>=part.index&&at<part.index+part.segment.length){start=part.index;end=start+part.segment.length;break;}}
      else {const pieces=/[^.!?]+[.!?]+[”"’']*|[^.!?]+$/g;let part;while((part=pieces.exec(text)))if(at>=part.index&&at<part.index+part[0].length){start=part.index;end=start+part[0].length;break;}}
      while(start<end&&/\s/.test(text[start]))start++;while(end>start&&/\s/.test(text[end-1]))end--;
      const walker=doc.createTreeWalker(block,4);let current:Node|null,total=0;const range=doc.createRange();let begun=false;
      while((current=walker.nextNode())){const length=current.textContent?.length??0;if(!begun&&start<total+length){range.setStart(current,start-total);begun=true;}if(begun&&end<=total+length){range.setEnd(current,end-total);break;}total+=length;}
      if(!begun||range.collapsed)return;
      doc.documentElement.classList.add('qr-selecting');
      root.qrSuppressClickUntil=Date.now()+700;
      if(root.qrSelectionGuard)root.qrSelectionGuard.locked=true;
      const selected=win.getSelection();selected.removeAllRanges();selected.addRange(range);selection();
    }
    let hold:ReturnType<typeof setTimeout>|undefined;let touch:{x:number;y:number}|null=null;
    let moved=false, held=false, started=0, lastBlank=0, axis='', beganSelected=false;
    const selectionStyle=doc.createElement('style');selectionStyle.textContent='html:not(.qr-selecting) body,html:not(.qr-selecting) body *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}';doc.head.appendChild(selectionStyle);if(root.qrReadingMode==='swipe'){doc.documentElement.style.touchAction='pan-y';doc.body.style.touchAction='pan-y';}
    function cancelHold(){clearTimeout(hold);hold=undefined;}
    win.addEventListener('scroll',()=>{cancelHold();moved=true;},{passive:true});
    doc.addEventListener('touchstart',event=>{
      cancelHold();touch=null;moved=false;held=false;axis='';beganSelected=!win.getSelection()?.isCollapsed;started=Date.now();if(event.touches.length!==1||(event.target as Element)?.closest?.('button,a,[data-qr-ui],.qr-translation')){moved=true;return;}
      if(!root.qrSelectionGuard?.locked){heldX=win.scrollX;heldY=win.scrollY;}
      const point=event.touches[0];touch={x:point.clientX,y:point.clientY};
      const guard=root.qrSelectionGuard;if(guard&&!guard.locked){guard.left=guard.container.scrollLeft;guard.top=guard.container.scrollTop;}
      if(win.getSelection()?.isCollapsed)hold=setTimeout(()=>{if(moved||!touch||root.qrInteractionBlocked||!win.getSelection()?.isCollapsed)return;held=true;selectSentence(point.clientX,point.clientY);},1000);
    },{passive:true});
    doc.addEventListener('touchmove',event=>{const point=event.touches[0];if(!point||!touch||Math.hypot(point.clientX-touch.x,point.clientY-touch.y)>8){moved=true;if(!axis&&point&&touch)axis=Math.abs(point.clientX-touch.x)>Math.abs(point.clientY-touch.y)*1.3?'x':'y';cancelHold();root.qrSuppressClickUntil=Date.now()+500;}if(root.qrReadingMode==='swipe'&&axis==='x'&&!beganSelected&&!held&&event.cancelable)event.preventDefault();},{passive:false});
    doc.addEventListener('touchend',event=>{cancelHold();if((moved||held)&&touch&&event.cancelable)event.preventDefault();const point=event.changedTouches[0];if(root.qrReadingMode==='swipe'&&axis==='x'&&!held&&!beganSelected&&win.getSelection()?.isCollapsed&&point&&touch&&Math.abs(point.clientX-touch.x)>70){root.qrSuppressClickUntil=Date.now()+500;post({type:'qr-turn',direction:point.clientX<touch.x?1:-1});}if(moved||held)root.qrSuppressClickUntil=Date.now()+700;}, {passive:false});doc.addEventListener('touchcancel',()=>{cancelHold();moved=true;touch=null;root.qrSuppressClickUntil=Date.now()+700;},{passive:true});
    doc.addEventListener('contextmenu',event=>{event.preventDefault(); /* Only the stationary hold timer selects sentences. */});
    doc.addEventListener('click',(event:MouseEvent)=>{
      if(root.qrInteractionBlocked||Date.now()<(root.qrSuppressClickUntil||0))return;
      // Android may deliver a synthetic click well after a slow swipe completes.
      if((event as any).sourceCapabilities?.firesTouchEvents&&(moved||held||Date.now()-started>500))return;
      const selected=win.getSelection();if(selected&&!selected.isCollapsed){selected.removeAllRanges();selection();root.qrSuppressClickUntil=Date.now()+400;return;}
      const target=event.target as Element;if(target.closest?.('button,a,[data-qr-ui],.qr-translation'))return;
      function blankTap(){post({type:'qr-toggle-ui'});}
      const pos=(doc as any).caretRangeFromPoint?.(event.clientX,event.clientY);
      const caret=(doc as any).caretPositionFromPoint?.(event.clientX,event.clientY);
      const node=pos?.startContainer||caret?.offsetNode; const offset=pos?.startOffset??caret?.offset;
      if(!node||node.nodeType!==3){blankTap();return;}
      const noted=noteRanges.find(range=>Array.from(range.getClientRects()).some(rect=>event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom));
      if(noted){post({...payload(noted,'translate'),action:'mark'});return;}
      const text=node.textContent||'';
      const regex=/[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)*/g;let match;
      while((match=regex.exec(text)))if(offset>=match.index&&offset<match.index+match[0].length){
        const range=doc.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
        const rect=range.getBoundingClientRect(); if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom){blankTap();return;}
        lastBlank=0;post(payload(range,'word'));return;
      }
      blankTap();
    });
    function draw() {
      layer.replaceChildren(); noteRanges=[];sheet.textContent='';
      if(win.CSS?.highlights) for(const name of Array.from(win.CSS.highlights.keys()) as string[])if(name.startsWith('qr-'))win.CSS.highlights.delete(name);
      const byForm=new Map<string,any>();marks.forEach((mark,i)=>mark.forms.forEach((form:string)=>byForm.set(form.toLowerCase().replace(/[’‘]/g,"'"),{...mark,index:i})));
      const groups=new Map<number,Range[]>();
      const walker=doc.createTreeWalker(doc.body,4);let node:Node|null;
      const labels:{range:Range;mark:any}[]=[];
      while((node=walker.nextNode())){
        if((node.parentElement?.closest('script,style,rt,button,textarea,[data-qr-ui]')))continue;
        const text=node.textContent||'';const regex=/[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)*/g;let match;
        while((match=regex.exec(text))){const mark=byForm.get(match[0].toLowerCase().replace(/[’‘]/g,"'"));if(!mark)continue;
          const range=doc.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
          if(!groups.has(mark.index))groups.set(mark.index,[]);groups.get(mark.index)!.push(range);
          labels.push({range,mark});
        }
      }
      marks.forEach((mark,i)=>{
        const color=/^#[0-9a-f]{6}$/i.test(mark.color)?mark.color:'#ffe082';
        const rule=mark.style==='text'?`color:${color}`:mark.style==='underline'?`text-decoration:underline ${color} 2px`:`background-color:${color};color:#222`;
        sheet.textContent+=`::highlight(qr-${i}){${rule}}`;
        if(win.CSS?.highlights&&win.Highlight){
          // A frequent word in an anthology can exceed JS argument limits.
          const highlight=new win.Highlight();
          for(const range of groups.get(i)||[])highlight.add(range);
          win.CSS.highlights.set('qr-'+i,highlight);
        }
      });
      labels.forEach(({range,mark})=>{const rect=range.getBoundingClientRect(); if(!rect.width||!rect.height)return;
        if(!win.CSS?.highlights){const box=doc.createElement('span');box.style.cssText=`position:absolute;left:${rect.left+win.scrollX}px;top:${rect.top+win.scrollY}px;width:${rect.width}px;height:${rect.height}px;${mark.style==='underline'?`border-bottom:2px solid ${mark.color}`:`background:${mark.color};opacity:.25`}`;layer.appendChild(box);}
        if(mark.show_meaning&&mark.contextual_meaning){const label=doc.createElement('span');label.className='qr-meaning';label.textContent=mark.contextual_meaning;label.style.cssText=`position:absolute;left:${rect.left+win.scrollX}px;top:${rect.top+win.scrollY-11}px;max-width:${Math.max(rect.width,110)}px;font:10px/11px sans-serif;color:#888;white-space:nowrap;overflow:hidden;`;layer.appendChild(label);}
      });
      const nodes:Text[]=[];const offsets:number[]=[];let total=0;const texts=doc.createTreeWalker(doc.body,4);let textNode:Node|null;
      while((textNode=texts.nextNode())){offsets.push(total);nodes.push(textNode as Text);total+=textNode.textContent?.length??0;}
      const fullText=nodes.map(node=>node.textContent??'').join('');
      sentenceMarks.filter(mark=>mark.section_key===(doc as any).qrSectionKey).forEach((mark,index)=>{
        let from=mark.start_offset,to=mark.end_offset;
        if(!mark.text)return;
        // Older TXT translations contributed UI characters to saved offsets.
        // Recover only an unambiguous exact quote in the same section; never
        // move a user's stored note or attach it to a guessed occurrence.
        if(fullText.slice(from,to)!==mark.text){
          from=fullText.indexOf(mark.text);to=from+mark.text.length;
          if(from<0||fullText.indexOf(mark.text,from+1)!==-1)return;
        }
        const start=nodes.findIndex((node,i)=>offsets[i]+node.length>from);
        const end=nodes.findIndex((node,i)=>offsets[i]+node.length>=to);
        if(start<0||end<0||from<0||to<=from)return;
        const range=doc.createRange();range.setStart(nodes[start],from-offsets[start]);range.setEnd(nodes[end],to-offsets[end]);
        if(range.toString()!==mark.text)return;
        if(mark.is_note)noteRanges.push(range.cloneRange());
        const color=/^#[0-9a-f]{6}$/i.test(mark.color)?mark.color:'#ffe082';
        sheet.textContent+=`::highlight(qr-sentence-${index}){${mark.style==='underline'?`text-decoration:underline ${color} 2px`:`background-color:${color};color:#222`}}`;
        if(win.CSS?.highlights&&win.Highlight)win.CSS.highlights.set('qr-sentence-'+index,new win.Highlight(range));
        else Array.from(range.getClientRects()).forEach(rect=>{const box=doc.createElement('span');box.style.cssText=`position:absolute;left:${rect.left+win.scrollX}px;top:${rect.top+win.scrollY}px;width:${rect.width}px;height:${rect.height}px;${mark.style==='underline'?`border-bottom:2px solid ${color}`:`background:${color};opacity:.25`}`;layer.appendChild(box);});
      });
    }
    documents.set(doc,{draw,cancelHold:()=>{cancelHold();moved=true;touch=null;}}); win.addEventListener('resize',draw);doc.fonts?.ready.then(draw); draw();
  }
  const drawAll=()=>documents.forEach((value,doc)=>{if(doc.defaultView)value.draw();else documents.delete(doc);});
  let frame=0;const redraw=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;drawAll();});};
  root.qrReader={setReadingMode:(value:string)=>{root.qrReadingMode=value;documents.forEach((_,doc)=>{doc.documentElement.style.touchAction=value==='swipe'?'pan-y':'auto';doc.body.style.touchAction=value==='swipe'?'pan-y':'auto';});},setMeaningsVisible:(value:boolean)=>{meaningsVisible=value;documents.forEach((_,doc)=>doc.documentElement.classList.toggle('qr-hide-meanings',!value));},selected:null,attach,cancelPendingSelection:()=>{root.qrSuppressClickUntil=Date.now()+700;documents.forEach(value=>value.cancelHold());},setMarks:(next:any[])=>{const key=JSON.stringify(next);if(key===marksKey)return;marksKey=key;marks=next;redraw();},setSentenceMarks:(next:any[])=>{const key=JSON.stringify(next);if(key===sentenceMarksKey)return;sentenceMarksKey=key;sentenceMarks=next;redraw();},choose:(mode:string)=>{if(root.qrReader.selected)post({...root.qrReader.selected,mode:mode==='mark'?'translate':mode,action:mode==='mark'?'mark':undefined});}};
  attach(document,root.qrSectionKey);
}
