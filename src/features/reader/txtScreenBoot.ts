import {searchLocator} from './searchLocator';
import type {SearchHit} from '../../services/books/search';
/** Readiness is acknowledged after font layout and restoration, never by a
 * fixed timeout. Scroll events during that process must not overwrite progress. */
export function txtScreenBoot(target: {fraction: number} | {y: number},searchHit?:SearchHit|null) {
  const position = 'fraction' in target
    ? `Math.max(0,document.documentElement.scrollHeight-innerHeight)*${Math.max(0,Math.min(1,target.fraction))}`
    : String(Math.max(0,target.y));
  return `
  (function(){
    var ready=false,queued=false,last='';
    function measure(){
      queued=false;if(!ready)return;
      var value={type:'qr-screen-ready',y:scrollY,max:Math.max(0,document.documentElement.scrollHeight-innerHeight),step:Math.max(1,innerHeight-48)};
      var raw=JSON.stringify(value);if(raw===last)return;last=raw;
      window.ReactNativeWebView.postMessage(raw);
    }
    window.qrMeasure=function(){if(queued)return;queued=true;requestAnimationFrame(measure);};
    Promise.resolve(document.fonts?document.fonts.ready:null).then(function(){
      requestAnimationFrame(function(){
        window.scrollTo(0,${position});
        ${searchHit?searchLocator+`try{var range=window.qrSearchRange(document,${JSON.stringify(searchHit)});window.scrollTo(0,Math.max(0,range.getBoundingClientRect().top+scrollY-100));if(window.CSS?.highlights&&window.Highlight){CSS.highlights.set('search',new Highlight(range));var style=document.createElement('style');style.textContent='::highlight(search){background:#ffe082;color:#222}';document.head.appendChild(style);setTimeout(()=>CSS.highlights.delete('search'),5000);}}catch{window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-search-error'}));}`:''}
        requestAnimationFrame(function(){
          ready=true;measure();
          new ResizeObserver(window.qrMeasure).observe(document.body);
        });
      });
    });
    window.addEventListener('scroll',function(){
      if(!ready)return;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'qr-progress',value:scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)}));
    });
  })();true;`;
}
