(function(){'use strict';

function currentUser(){try{return (typeof me!=='undefined'&&me)||window.me||null}catch(_){return window.me||null}}
function canUse(){const r=String(currentUser()?.role||'');return r==='Manager'||r==='Supervisor'}
function ensureState(){
  if(typeof state==='undefined'||!state)return;
  state.estimates=Array.isArray(state.estimates)?state.estimates:[];
  state.estimateAudit=Array.isArray(state.estimateAudit)?state.estimateAudit:[];
}
function uid(){return globalThis.crypto?.randomUUID?.()||('est-'+Date.now()+'-'+Math.random().toString(36).slice(2))}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function num(v){const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)&&n>=0?n:0}
function money(v){return num(v).toFixed(3)}
function localDate(){
  const d=new Date(),off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10)
}
function role(){return String(currentUser()?.role||'')}
function findEstimate(id){ensureState();return state.estimates.find(x=>x&&String(x.id)===String(id))||null}
function jobByQuery(q){
  q=String(q||'').trim().toUpperCase();if(!q)return null;
  const rows=Array.isArray(state?.jobs)?state.jobs:[];
  return rows.find(j=>String(j?.no||'').trim().toUpperCase()===q)||
    rows.find(j=>String(j?.reg||j?.registration||'').trim().toUpperCase()===q)||null
}
function totals(e){
  const ls=(e.lsRows||[]).reduce((s,x)=>s+num(x.amount),0);
  const labour=(e.labourRows||[]).reduce((s,x)=>s+num(x.amount),0);
  const parts=(e.partRows||[]).reduce((s,x)=>s+(num(x.qty)*num(x.unitPrice)),0);
  const misc=num(e.misc);
  const spare=num(e.lsSpareParts);
  const subtotal=e.type==='PL'?labour+parts+misc:ls+spare+misc;
  const vat=e.vatEnabled?subtotal*.05:0;
  return {labour:e.type==='PL'?labour:ls,parts:e.type==='PL'?parts:spare,misc,subtotal,vat,total:subtotal+vat};
}
function audit(e,action,beforeTotal=null){
  ensureState();const u=currentUser()||{};
  state.estimateAudit.push({id:uid(),estimateId:e.id,estimateNo:e.estimateNo,action,by:u.id||'',role:u.role||'',at:Date.now(),beforeTotal,afterTotal:totals(e).total});
  if(state.estimateAudit.length>1000)state.estimateAudit=state.estimateAudit.slice(-1000);
}
function saveState(){if(typeof save==='function')save()}
function ensureStyle(){
  if(document.getElementById('zukaitEstimateStyle'))return;
  const s=document.createElement('style');s.id='zukaitEstimateStyle';s.textContent=`
  .est-home{background:linear-gradient(145deg,#f7fbff,#eef5fb);border:1px solid #dce7f2;border-radius:20px;padding:14px}
  .est-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  .est-action{min-height:84px;border-radius:16px!important;text-align:left!important;padding:13px!important;background:#fff!important;color:#18324e!important;border:1px solid #d9e5f0!important;box-shadow:0 8px 20px #18314d12!important}
  .est-action b{display:block;font-size:15px}.est-action small{display:block;margin-top:5px;color:#64748b}
  .est-switches{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}.est-switch{display:grid;grid-template-columns:1fr 1fr;gap:5px;background:#eef3f8;padding:5px;border-radius:14px}
  .est-switch button{margin:0!important;background:#dbe5ef!important;color:#334155!important;min-height:42px}.est-switch button.active{background:#2563eb!important;color:#fff!important}
  .est-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.est-fields label{font-weight:700;font-size:12px;color:#334155}.est-fields input{width:100%;box-sizing:border-box;margin-top:4px}
  .est-section{margin-top:12px;padding:12px;border:1px solid #dce6ef;border-radius:15px;background:#fff}.est-section h4{margin:0 0 8px}
  .est-row{display:grid;grid-template-columns:minmax(0,1fr) 120px 44px;gap:6px;margin:6px 0}.est-part-row{grid-template-columns:minmax(0,1fr) 70px 105px 44px}
  .est-row input{width:100%;box-sizing:border-box}.est-remove{background:#dc2626!important;padding:6px!important;margin:0!important}
  .est-add{background:#64748b!important;width:100%;margin:7px 0 0!important}.est-summary{margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px}
  .est-summary-line{display:flex;justify-content:space-between;gap:10px;padding:5px 2px}.est-summary-line.total{font-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';
function printable(e){
  const t=totals(e);
  const customerParts=String(e.customerSuppliedParts||'').trim();
  const notes=String(e.notes||'').trim();
  let body='';
  if(e.type==='PL'){
    body='<div class="doc-section-title">LABOUR</div><table class="work-table"><thead><tr><th style="width:7%">No.</th><th>Description</th><th style="width:20%">Amount OMR</th></tr></thead><tbody>'+((e.labourRows||[]).filter(x=>x.description||num(x.amount)).map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(x.description)+'</td><td class="money-cell">'+money(x.amount)+'</td></tr>').join('')||'<tr><td colspan="3">&nbsp;</td></tr>')+'</tbody></table>'+
    '<div class="doc-section-title">SPARE PARTS</div><table class="work-table"><thead><tr><th style="width:7%">No.</th><th>Part Description</th><th style="width:10%">Qty</th><th style="width:18%">Unit Price</th><th style="width:18%">Amount</th></tr></thead><tbody>'+((e.partRows||[]).filter(x=>x.description||num(x.unitPrice)).map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(x.description)+'</td><td>'+num(x.qty)+'</td><td class="money-cell">'+money(x.unitPrice)+'</td><td class="money-cell">'+money(num(x.qty)*num(x.unitPrice))+'</td></tr>').join('')||'<tr><td colspan="5">&nbsp;</td></tr>')+'</tbody></table>'+
    '<table class="totals"><tr><th>Total Labour</th><td>'+money(t.labour)+'</td></tr><tr><th>Total Parts</th><td>'+money(t.parts)+'</td></tr><tr><th>Misc</th><td>'+money(t.misc)+'</td></tr><tr><th>Subtotal</th><td>'+money(t.subtotal)+'</td></tr>'+ (e.vatEnabled?'<tr><th>VAT 5%</th><td>'+money(t.vat)+'</td></tr>':'') +'<tr class="grand"><th>GRAND TOTAL</th><td>'+money(t.total)+'</td></tr></table>';
  }else{
    const rows=(e.lsRows||[]).filter(x=>x.description||num(x.amount));
    const lm=splitMoney(t.labour),pm=splitMoney(t.parts),mm=splitMoney(t.misc),vm=splitMoney(t.vat),tm=splitMoney(t.total);
    body='<div class="doc-section-title">LABOUR / LUMPSUM</div><table class="work-table ls-table"><tr><th>Description</th><th style="width:14%">R.O.</th><th style="width:14%">Bz.</th></tr>'+((rows.length?rows:[{description:'',amount:0}]).map(x=>{const m=splitMoney(x.amount);return '<tr><td>'+esc(x.description)+'</td><td class="money-cell">'+m.ro+'</td><td class="money-cell">'+m.bz+'</td></tr>'}).join(''))+
    '<tr class="summary-row"><th>Total Labour / Lumpsum</th><td class="money-cell">'+lm.ro+'</td><td class="money-cell">'+lm.bz+'</td></tr>'+
    '<tr class="summary-row"><th>Spare Parts</th><td class="money-cell">'+pm.ro+'</td><td class="money-cell">'+pm.bz+'</td></tr>'+
    '<tr class="summary-row"><th>Misc</th><td class="money-cell">'+mm.ro+'</td><td class="money-cell">'+mm.bz+'</td></tr>'+
    (e.vatEnabled?'<tr class="summary-row"><th>VAT 5%</th><td class="money-cell">'+vm.ro+'</td><td class="money-cell">'+vm.bz+'</td></tr>':'')+
    '<tr class="grand summary-row"><th>TOTAL</th><td class="money-cell">'+tm.ro+'</td><td class="money-cell">'+tm.bz+'</td></tr></table>';
  }
  const lower='<div class="doc-lower"><div class="doc-section-title">SPARE PARTS REQUIRED — TO BE SUPPLIED BY CUSTOMER</div><div class="doc-box">'+(customerParts?esc(customerParts).replace(/\n/g,'<br>'):'&nbsp;<br>&nbsp;')+'</div>'+
    '<div class="doc-section-title">NOTES / CONDITIONS</div><div class="doc-box">'+(notes?esc(notes).replace(/\n/g,'<br>'):'&nbsp;')+'</div>'+'</div>';
  const prepared=esc((typeof user==='function'?user(e.createdBy)?.name:e.createdBy)||e.createdBy||'');
  // Move the existing LS summary into the totals block without changing its currency split.
  let summary='';
  if(e.type!=='PL'){
    const at=body.indexOf('<tr class="summary-row">');
    summary='<table class="totals ls-table"><thead><tr><th>Totals</th><th>R.O.</th><th>Bz.</th></tr></thead><tbody>'+body.slice(at).replace('</table>','</tbody></table>');
    body=body.slice(0,at)+'</table><div class="doc-section-title">SPARE PARTS</div><table class="work-table"><thead><tr><th>Description</th><th>Amount OMR</th></tr></thead><tbody><tr><td>Spare Parts / Lumpsum</td><td class="money-cell">'+money(t.parts)+'</td></tr></tbody></table>';
  }else{
    const at=body.indexOf('<table class="totals">');summary=body.slice(at);body=body.slice(0,at);
  }
  return '<style>'+estimatePrintCss()+'</style><div class="estimate-print"><div class="head"><div class="brand"><img src="'+estimateLogo+'" alt="Zukait Auto"><div>ZUKAIT INTERNATIONAL LLC</div></div><div class="heading"><h1>REPAIR ESTIMATE</h1><div class="estimate-meta"><div><b>Estimate No.:</b> '+esc(e.estimateNo)+'</div><div><b>Date:</b> '+esc(e.date)+'</div><div><b>Type:</b> '+(e.type==='PL'?'PL / Parts + Labour':'LS / Lumpsum')+' &nbsp; <b>VAT:</b> '+(e.vatEnabled?'5%':'NO VAT')+'</div></div></div></div>'+
  '<table class="details"><colgroup><col style="width:17%"><col style="width:33%"><col style="width:19%"><col style="width:31%"></colgroup><tr><th colspan="2">ISSUED TO</th><th colspan="2">VEHICLE DETAILS</th></tr><tr><th>Name</th><td>'+esc(e.customerName)+'</td><th>Make / Model</th><td>'+esc(e.makeModel)+(e.year?' · '+esc(e.year):'')+'</td></tr><tr><th>Tel No.</th><td>'+esc(e.mobile)+'</td><th>Reg No.</th><td>'+esc(e.registration)+'</td></tr><tr><th>Job Card No.</th><td>'+esc(e.jobCard)+'</td><th>Frame / VIN No.</th><td>'+esc(e.vin)+'</td></tr><tr><th></th><td></td><th>Claim No.</th><td>'+esc(e.claimNo)+'</td></tr></table>'+
  body+'<div class="doc-bottom">'+lower+'<div class="summary">'+summary+'<div class="currency">All amounts in OMR</div></div></div><div class="valid">ESTIMATE VALID FOR 15 DAYS.</div><div class="sign"><span>Authorized Signed</span><small>Prepared By: '+prepared+'</small></div><div class="doc-footer">P.O. Box 1921, Barka, Postal Code 130, C.R.N. 1194220 &nbsp; | &nbsp; Contact: 93211154</div></div>';

}
function currentOutputEstimate(id){
  const e=findEstimate(id);if(!e)return null;
  try{
    if(String(window.__zukaitEstimateCurrent||'')===String(id) && document.getElementById('estDate')) return draftFromDom(e);
  }catch(_){}
  return e;
}
function estimatePrintCss(){
  // Scope styles so the in-app preview cannot restyle the editor or dashboard.
  return `.estimate-print{box-sizing:border-box;width:100%;min-height:270mm;display:flex;flex-direction:column;font:12px Arial,sans-serif;color:#202523;background:white;text-align:left;padding:0}.estimate-print *{box-sizing:border-box}.estimate-print .head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;padding-bottom:9px;gap:16px;break-inside:avoid}.estimate-print .brand img{width:210px;height:auto;display:block}.estimate-print .brand div{font-size:9px;margin-top:4px;letter-spacing:.5px}.estimate-print .heading{text-align:right}.estimate-print h1{font-size:25px;letter-spacing:2px;margin:0 0 5px}.estimate-print .estimate-meta{font-size:11px;line-height:1.5}.estimate-print table{border-collapse:collapse;width:100%;table-layout:fixed}.estimate-print th,.estimate-print td{padding:6px 8px;vertical-align:top;overflow-wrap:anywhere;white-space:normal}.estimate-print .details{margin:8px 0;border-bottom:1px solid #555}.estimate-print .details th{width:18%;text-align:left;font-size:10px}.estimate-print .details td{width:32%}.estimate-print .details tr:first-child th{letter-spacing:1px;font-size:11px}.estimate-print .doc-section-title{font-size:16px;letter-spacing:1px;font-weight:bold;margin:12px 0 5px;break-after:avoid}.estimate-print .work-table{margin-bottom:8px}.estimate-print .work-table th{border-bottom:1px solid #333;text-align:left;font-size:11px;letter-spacing:.5px}.estimate-print .work-table td{border-bottom:1px solid #ddd;height:30px}.estimate-print .work-table tbody{min-height:100px}.estimate-print .work-table:after{content:'';display:table-row;height:55px}.estimate-print thead{display:table-header-group}.estimate-print tr{break-inside:avoid;page-break-inside:avoid}.estimate-print .money-cell{text-align:right;white-space:nowrap}.estimate-print .doc-bottom{display:flex;align-items:flex-start;gap:22px;margin-top:12px}.estimate-print .doc-lower{width:52%}.estimate-print .doc-lower .doc-section-title{font-size:10px;letter-spacing:.3px;margin-top:0}.estimate-print .doc-box{border-bottom:1px solid #999;min-height:44px;padding:6px 0;margin-bottom:14px;overflow-wrap:anywhere}.estimate-print .summary{width:48%;break-inside:avoid}.estimate-print .totals th,.estimate-print .totals td{border:1px solid #333;padding:8px;text-align:right}.estimate-print .totals th{font-weight:normal;width:64%}.estimate-print .totals.ls-table th:first-child{width:60%}.estimate-print .totals.ls-table thead th:not(:first-child){width:20%}.estimate-print .totals .grand{font-weight:bold;background:#f0f2f1;font-size:13px}.estimate-print .totals .grand th{font-weight:bold}.estimate-print .currency{font-size:9px;text-align:right;margin-top:4px}.estimate-print .valid{font-size:9px;margin:15px 0}.estimate-print .sign{margin-top:auto;padding-top:35px;align-self:flex-end;width:240px;text-align:center;break-inside:avoid}.estimate-print .sign span{display:block;border-top:1px solid #333;padding-top:6px}.estimate-print .sign small{display:block;font-size:9px;margin-top:5px}.estimate-print .doc-footer{margin-top:14px;background:#202523;color:white;padding:8px 5px;text-align:center;font-size:8px;break-inside:avoid}@media print{.estimate-print{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;
}
function estimateDocumentHtml(e){
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(e.estimateNo)+'</title><style>@page{size:A4;margin:11mm}body{margin:0;background:white}</style></head><body>'+printable(e)+'</body></html>';
}
function printDocument(e,autoPrint=true){
  const w=window.zukaitOpenPrintPreview('Estimate '+e.estimateNo);if(!w)return alert('Print window blocked.');
  w.document.write(estimateDocumentHtml(e));
  w.document.close();w.focus();if(autoPrint)setTimeout(()=>w.print(),200);
}
function preview(id){const e=currentOutputEstimate(id);if(!e)return;openModal(nav('zukaitEstimate.openEditor(\''+esc(id)+'\')')+'<div style="background:#fff;padding:12px;border-radius:12px;overflow:auto">'+printable(e)+'</div>')}
function printEstimate(id){
  const e=currentOutputEstimate(id);if(!e)return;
  try{
    if(window.AndroidBridge&&typeof AndroidBridge.printHtmlNamed==='function'){AndroidBridge.printHtmlNamed(estimateDocumentHtml(e),'Estimate '+e.estimateNo);return}
    if(window.AndroidBridge&&typeof AndroidBridge.printHtml==='function'){AndroidBridge.printHtml(estimateDocumentHtml(e));return}
  }catch(_){}
  printDocument(e,true);
}
function pdfEstimate(id){
  const e=currentOutputEstimate(id);if(!e)return;
  try{if(window.AndroidBridge&&typeof AndroidBridge.shareHtmlAsPdf==='function'){AndroidBridge.shareHtmlAsPdf(estimateDocumentHtml(e),e.estimateNo+'.pdf');return}}catch(_){}
  alert('Choose “Save as PDF” in the print window.');printDocument(e,true);
}
function shareText(e){
  const t=totals(e);return ['ZUKAIT INTERNATIONAL LLC','Repair Estimate '+e.estimateNo,'Date: '+(e.date||''),'Customer: '+(e.customerName||''),'Vehicle: '+[e.makeModel,e.year].filter(Boolean).join(' '),'Registration: '+(e.registration||''),'Type: '+e.type+(e.vatEnabled?' · VAT 5%':' · No VAT'),'Total: OMR '+money(t.total)].join('\n')
}
function whatsApp(id){
  const e=currentOutputEstimate(id);if(!e)return;
  try{if(window.AndroidBridge&&typeof AndroidBridge.shareHtmlAsPdfWhatsApp==='function'){AndroidBridge.shareHtmlAsPdfWhatsApp(estimateDocumentHtml(e),e.estimateNo+'.pdf');return}}catch(_){}
  const url='https://wa.me/?text='+encodeURIComponent(shareText(e));
  try{if(window.AndroidBridge&&typeof AndroidBridge.openExternalUrl==='function'){AndroidBridge.openExternalUrl(url);return}}catch(_){}
  try{const w=window.open(url,'_blank');if(w)return}catch(_){}window.location.href=url;
}
async function shareEstimate(id){
  const e=currentOutputEstimate(id);if(!e)return;const text=shareText(e);
  try{if(window.AndroidBridge&&typeof AndroidBridge.shareText==='function'){AndroidBridge.shareText('Estimate '+e.estimateNo,text);return}}catch(_){}
  try{if(navigator.share){await navigator.share({title:'Estimate '+e.estimateNo,text});return}}catch(x){if(x?.name==='AbortError')return}
  try{await navigator.clipboard.writeText(text);alert('Estimate summary copied for sharing.')}catch(_){alert('Share is unavailable on this device.')}
}
function ensureDashboardCards(){
  if(!canUse())return;ensureStyle();
  const r=role();
  if(r==='Supervisor'){
    const root=document.getElementById('supervisorView');if(!root||root.classList.contains('hidden'))return;
    const existing=[...root.querySelectorAll('[data-estimate-card="1"]')];existing.slice(1).forEach(x=>x.remove());if(existing[0])return;
    const card=document.createElement('div');card.className='card clickable compact-control estimate-dashboard-card';card.setAttribute('data-estimate-card','1');card.onclick=openHome;card.innerHTML='<div class="section-title"><span class="estimate-card-icon" aria-hidden="true">🧾</span><h3>Estimate</h3><span class="pill">LS / PL</span></div><div class="small muted">Create, find, edit, print, PDF and WhatsApp estimates.</div>';
    const assigned=[...root.querySelectorAll('.card')].find(x=>/Assigned Job Cards/i.test(x.textContent||''));if(assigned)root.insertBefore(card,assigned);else root.appendChild(card);
  }
  if(r==='Manager'){
    const root=document.getElementById('managerView');if(!root||root.classList.contains('hidden'))return;
    const existing=[...root.querySelectorAll('[data-estimate-card="1"]')];existing.slice(1).forEach(x=>x.remove());if(existing[0])return;
    const grid=root.querySelector('.v67-control-grid,.v66-control-grid,.v65-control-grid,.manager-actions');
    if(grid){
      const b=document.createElement('button');b.type='button';b.setAttribute('data-estimate-card','1');b.className=grid.matches('.v67-control-grid,.v66-control-grid,.v65-control-grid')?'v67-feature estimate-dashboard-card':'manager-action manager-blue estimate-dashboard-card';b.onclick=openHome;b.innerHTML='<div><span class="estimate-card-icon" aria-hidden="true">🧾</span><span class="estimate-card-copy"><b>ESTIMATE</b><small>LS / Parts + Labour · Find · Print</small></span><span class="estimate-card-arrow" aria-hidden="true">›</span></div>';
      const sp=[...grid.children].find(x=>/SPARE\s*PARTS/i.test(x.textContent||''));if(sp&&sp.nextSibling)grid.insertBefore(b,sp.nextSibling);else grid.appendChild(b);
    }else{
      const card=document.createElement('div');card.className='card clickable estimate-dashboard-card';card.setAttribute('data-estimate-card','1');card.onclick=openHome;card.innerHTML='<h3><span class="estimate-card-icon" aria-hidden="true">🧾</span> Estimate</h3><div class="small muted">LS / Parts + Labour · Find · Print</div>';root.appendChild(card);
    }
  }
}
function wrapRender(name){
  const fn=window[name];if(typeof fn!=='function'||fn.__estimateWrapped)return;
  const w=function(){const r=fn.apply(this,arguments);setTimeout(ensureDashboardCards,0);setTimeout(ensureDashboardCards,250);return r};w.__estimateWrapped=true;window[name]=w;
}
function boot(){ensureState();ensureStyle();wrapRender('renderSupervisor');wrapRender('renderManager');ensureDashboardCards()}
window.zukaitEstimate={openHome,newEstimate,openEditor,setType,setVat,addRow,removeRow,recalc,saveCurrent,loadJob,openFind,renderFind,openRecent,openReports,preview,printEstimate,pdfEstimate,whatsApp,shareEstimate,ensureDashboardCards,totals,printable,estimateDocumentHtml,shareText,currentOutputEstimate};
window.openEstimateModule=openHome;
document.addEventListener('DOMContentLoaded',boot);setTimeout(boot,0);setTimeout(boot,700);
new MutationObserver(()=>{wrapRender('renderSupervisor');wrapRender('renderManager');ensureDashboardCards()}).observe(document.documentElement,{childList:true,subtree:true});
})();