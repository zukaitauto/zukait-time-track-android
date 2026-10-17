(function(){'use strict';
// Browser-generated URL/date headers live in page margins, not report content.
// Keep document size/orientation and move existing page insets into the body.
function printPageCss(source){
 let inset=null;const pages=String(source||'').match(/@page\s*\{[^{}]*\}/gi)||[];
 for(const page of pages){const margin=page.match(/(?:[;{]\s*)margin\s*:\s*([^;}]+)/i);if(margin)inset=margin[1].replace(/!important/gi,'').trim();}
 const padding=inset&&!/^0(?:px|mm|cm|in|pt)?$/.test(inset)?'padding:'+inset+'!important;':'';
 return '@media print{@page{margin:0!important}html{margin:0!important;padding:0!important}body{margin:0!important;'+padding+'}}';
}
window.zukaitPrintWithoutBrowserHeaders=function(value){
 const html=String(value||'');if(html.includes('id="zukait-print-page-policy"'))return html;
 const style='<style id="zukait-print-page-policy">'+printPageCss(html)+'</style>';
 return /<\/head>/i.test(html)?html.replace(/<\/head>/i,style+'</head>'):style+html;
};
function installPrintPolicy(target){
 if(!target?.addEventListener)return;
 target.addEventListener('beforeprint',()=>{try{
  const d=target.document;if(!d?.head||d.getElementById('zukait-print-page-policy'))return;
  const style=d.createElement('style');style.id='zukait-print-page-policy';style.textContent=printPageCss(d.documentElement?.outerHTML||'');d.head.appendChild(style);
 }catch(_){}});
}
installPrintPolicy(window);
// Legacy reports use a same-origin blank popup rather than the shared preview.
if(typeof window.open==='function'){
 const originalOpen=window.open;
 window.open=function(url,...args){const popup=originalOpen.call(this,url,...args);if(!url||url==='about:blank')installPrintPolicy(popup);return popup;};
}
// Preview navigation belongs to the app, not popup history or window.close.
let activeClose=null;
window.zukaitOpenPrintPreview=function(title='Zukait Document'){
 const native=window.AndroidBridge;
 let html='',frame=null,overlay=null,ready=false,pendingPrint=false,closed=false;
 const previousFocus=document.activeElement;
 function close(){if(closed)return;closed=true;overlay?.remove();document.removeEventListener('keydown',escape);if(activeClose===close)activeClose=null;try{previousFocus?.focus?.()}catch(_){}}
 function escape(e){if(e.key==='Escape'){e.preventDefault();close()}}
 function print(){if(closed)return;if(native&&typeof native.printHtmlNamed==='function'){native.printHtmlNamed(html,String(title));return}if(!ready){pendingPrint=true;return}frame.contentWindow.focus();frame.contentWindow.print()}
 function mount(){
  html=window.zukaitPrintWithoutBrowserHeaders(html);
  if(native&&typeof native.printHtmlNamed==='function')return;
  if(activeClose)activeClose();activeClose=close;
  overlay=document.createElement('div');overlay.className='zukait-print-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label',String(title));overlay.setAttribute('aria-modal','true');overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#fff;display:flex;flex-direction:column';
  frame=document.createElement('iframe');frame.title=String(title);frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.cssText='width:100%;height:100%;border:0;flex:1;min-height:0';overlay.appendChild(frame);document.body.appendChild(overlay);document.addEventListener('keydown',escape);
  frame.onload=function(){if(closed||ready)return;const d=frame.contentDocument;if(!d?.body||(d.URL&&d.URL!=='about:srcdoc'))return;
   d.querySelectorAll('.cons-preview-nav,.sp-print-nav').forEach(n=>n.remove());
   const style=d.createElement('style');style.textContent='.zukait-print-nav{position:sticky;top:0;z-index:999;display:flex;gap:8px;padding:10px;background:#fff;border-bottom:1px solid #d7dde5;margin-bottom:12px}.zukait-print-nav button{padding:8px 12px;border:1px solid #bfdbfe;border-radius:9px;background:#dbeafe;color:#1d4ed8;font:700 13px Arial;cursor:pointer}.zukait-print-nav .close{border-color:#fecaca;background:#fee2e2;color:#b91c1c}@media print{.zukait-print-nav{display:none!important}}';d.head.appendChild(style);
   const nav=d.createElement('nav');nav.className='zukait-print-nav';
   for(const [label,fn,cls] of [['← Back',close,''],['✕ Close',close,'close'],['Print / PDF',print,'']]){const b=d.createElement('button');b.type='button';b.textContent=label;b.className=cls;b.addEventListener('click',fn);nav.appendChild(b)}
   d.body.insertBefore(nav,d.body.firstChild);d.addEventListener('keydown',escape);ready=true;nav.querySelector('button')?.focus();if(pendingPrint){pendingPrint=false;print()}
  };
  frame.srcdoc=html;
 }
 return {document:{write(value){html+=String(value)},close:mount},focus(){if(ready)frame.contentWindow.focus()},print,close};
};
})();