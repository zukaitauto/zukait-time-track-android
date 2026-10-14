(function(){'use strict';
let busy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const timeout=(promise,ms,stage='Report rendering')=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(stage+' timed out')),ms);Promise.resolve(promise).then(v=>{clearTimeout(t);resolve(v)},e=>{clearTimeout(t);reject(e)})});
function sanitizedDocument(html){
 const doc=new DOMParser().parseFromString(String(html),'text/html');
 doc.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv]').forEach(el=>el.remove());
 for(const el of doc.querySelectorAll('*'))for(const attr of Array.from(el.attributes)){
  const name=attr.name.toLowerCase(),value=attr.value.replace(/[\u0000-\u0020]/g,'').toLowerCase();
  if(name.startsWith('on')||name==='srcdoc'||(['href','src','action','formaction','xlink:href'].includes(name)&&/^(javascript|vbscript):/.test(value)))el.removeAttribute(attr.name);
 }
 return '<!doctype html>'+doc.documentElement.outerHTML;
}
async function generate(html,name='Zukait_Report.pdf'){
 if(!html||(!String(html).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,'').trim()&&!/<(?:img|svg)\b/i.test(html)))throw Error('The report is empty. Reopen it and try again.');
 if(!window.html2canvas||!window.jspdf?.jsPDF)throw Error('PDF tools are unavailable. Reload the page and try again.');
 const frame=document.createElement('iframe');frame.title='PDF rendering';frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-same-origin allow-scripts');frame.style.cssText='position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0;pointer-events:none';
 try{
  const loaded=new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=()=>reject(Error('Report could not load'))});
  frame.srcdoc=sanitizedDocument(html);document.body.appendChild(frame);await timeout(loaded,15000,'Report frame loading');
  const doc=frame.contentDocument;if(!doc?.body)throw Error('Report content is unavailable');
  const printStyle=doc.createElement('style');let rules='';
  for(const sheet of Array.from(doc.styleSheets)){try{for(const rule of Array.from(sheet.cssRules||[]))if(rule.type===4&&rule.conditionText.includes('print'))rules+=Array.from(rule.cssRules).map(r=>r.cssText).join('\n')}catch(_){}}
  printStyle.textContent=rules+'\nhtml,body{background:white!important;max-width:794px;overflow:visible!important}';doc.head.appendChild(printStyle);
  await timeout(Promise.all([doc.fonts?.ready,...Array.from(doc.images).map(img=>img.complete?(img.naturalWidth?Promise.resolve():Promise.reject(Error('Report image is missing'))):new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Report image is missing'))}))]),15000,'Report fonts/images');
  const canvas=await timeout(window.html2canvas(doc.body,{scale:2,backgroundColor:'#ffffff',logging:false,useCORS:true,windowWidth:794,windowHeight:1123}),30000,'Report canvas rendering');
  if(!canvas.width||!canvas.height)throw Error('Report rendering returned an empty page');
  const context=canvas.getContext('2d');let ink=0;
  for(let y=0;y<canvas.height;y+=Math.max(1,Math.floor(canvas.height/128))){const pixels=context.getImageData(0,y,canvas.width,1).data;for(let i=0;i<pixels.length;i+=64)if(pixels[i+3]&&(pixels[i]<235||pixels[i+1]<235||pixels[i+2]<235))ink++;}
  if(ink<20)throw Error('The PDF has no visible report content. Reopen the report and try again.');
  const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const width=186,pageHeight=273,maxPixels=Math.floor(canvas.width*pageHeight/width),scale=canvas.width/doc.body.getBoundingClientRect().width;
  const rows=Array.from(doc.querySelectorAll('tr')).map(row=>{const r=row.getBoundingClientRect(),body=doc.body.getBoundingClientRect();return {top:Math.round((r.top-body.top)*scale),bottom:Math.round((r.bottom-body.top)*scale)}});
  let offset=0,index=0;
  while(offset<canvas.height){let end=Math.min(canvas.height,offset+maxPixels);const crossing=rows.find(r=>r.top<end&&r.bottom>end&&r.top>offset&&r.bottom-r.top<maxPixels);if(crossing)end=crossing.top;
   if(end<=offset)end=Math.min(canvas.height,offset+maxPixels);
   const page=document.createElement('canvas');page.width=canvas.width;page.height=end-offset;page.getContext('2d').drawImage(canvas,0,offset,canvas.width,page.height,0,0,page.width,page.height);
   if(index++)pdf.addPage();pdf.addImage(page.toDataURL('image/png'),'PNG',12,12,width,page.height*width/page.width,undefined,'FAST');offset=end;page.width=page.height=0;
  }
  const blob=pdf.output('blob');if(blob.size<1000||await blob.slice(0,5).text()!=='%PDF-')throw Error('PDF generation failed');
  const filename=String(name||'Zukait_Report.pdf').replace(/[^A-Za-z0-9._-]/g,'_').replace(/(?:\.pdf)?$/i,'.pdf');
  canvas.width=canvas.height=0;return new File([blob],filename,{type:'application/pdf'});
 }finally{frame.remove()}
}
async function share(html,name,whatsapp=false){
 if(busy)return;
 if(window.AndroidBridge){const bridge=window.AndroidBridge;if(typeof bridge.supportsValidatedPdfExport!=='function'||!bridge.supportsValidatedPdfExport()){window.alert?.('Please update the Android app to share this PDF. Your report has not been changed.');return;}if(whatsapp&&typeof bridge.shareHtmlAsPdfWhatsApp==='function'){bridge.shareHtmlAsPdfWhatsApp(html,name);return;}if(typeof bridge.shareHtmlAsPdf==='function'){bridge.shareHtmlAsPdf(html,name);return;}}
 busy=true;
 try{
  const file=await generate(html,name),url=URL.createObjectURL(file);
  const download=()=>{const a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove()};
  const canShare=!!(navigator.share&&navigator.canShare?.({files:[file]}));
  if(window.openModal){window.openModal('<section class="report-pdf-ready"><h3>PDF ready</h3><p>'+esc(file.name)+'</p><p>The generated PDF contains the report. Download it or share the document.</p><button id="report-pdf-download">Download PDF</button>'+(canShare?'<button id="report-pdf-share">Share PDF</button>':'')+'<button id="report-pdf-close">Close</button></section>');
   document.getElementById('report-pdf-download').onclick=download;
   if(canShare)document.getElementById('report-pdf-share').onclick=async()=>{try{await navigator.share({title:file.name,files:[file]})}catch(e){if(e.name!=='AbortError')window.alert?.('PDF sharing failed. Use Download PDF or try again.')}};
   document.getElementById('report-pdf-close').onclick=()=>{window.closeModal?.();URL.revokeObjectURL(url)};
  }else{download();setTimeout(()=>URL.revokeObjectURL(url),60000)}
 }catch(e){window.alert?.(e.message||'PDF generation failed. Reopen the report and try again.')}finally{busy=false}
}
window.zukaitReportPdf={generate,share};
})();
