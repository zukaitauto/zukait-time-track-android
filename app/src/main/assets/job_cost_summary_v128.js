(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
function job(no){return (state.jobs||[]).find(j=>j&&String(j.no)===String(no))||null}
function assignmentActual(a){
 if(typeof totalForAssignment==='function')return num(totalForAssignment(a));
 const ss=(state.sessions||[]).filter(s=>s&&s.emp===a.emp&&s.job===a.job);
 return ss.reduce((n,s)=>{const end=s.end||Date.now();return n+Math.max(0,(end-num(s.start))/60000)},0);
}
function labourValue(a,rate){
 if(typeof labourCost==='function'){const v=Number(labourCost(a));if(Number.isFinite(v))return v}
 return assignmentActual(a)/60*rate;
}
function consumablesStatus(no){
 const c=state.consumables||{},issues=(c.issues||[]).filter(x=>x&&!x.voided&&x.jobCard===no),actuals=(c.actuals||[]).filter(x=>x&&!x.voided&&x.locked&&x.jobCard===no);
 if(actuals.length)return 'Completed';
 if(issues.length)return 'Actual Pending';
 return 'Not Started';
}
function paintStatus(no){
 const p=state.paintPurchasing||{},orders=(p.orders||[]).filter(x=>x&&!x.voided&&x.jobCard===no).sort((a,b)=>num(b.createdAt)-num(a.createdAt));
 if(!orders.length)return 'No PO';
 const o=orders[0];if((o.returns||[]).length)return 'Returned / Adjusted';if(o.receivedAt)return 'Received / Costed';return 'PO Created';
}
function data(no){
 const j=job(no);if(!j)return null;
 const rate=num(state.labourRate||2.5),aa=(state.assign||[]).filter(a=>a&&a.job===no&&!a.cancelled);
 const labour=Math.round(aa.reduce((n,a)=>n+labourValue(a,rate),0)*1000)/1000;
 const c=state.consumables||{},materials=Math.round((c.actuals||[]).filter(x=>x&&!x.voided&&x.locked&&x.jobCard===no).reduce((n,x)=>n+num(x.totalCost),0)*1000)/1000;
 const paintRow=state.paintCosting&&state.paintCosting[no],paint=Math.round(num(paintRow?.netPaintCost??j.paintCost)*1000)/1000;
 const consumables=Math.round((materials+paint)*1000)/1000;
 let parts=0;
 try{const rows=window.zukaitV2?.sparePartsMain?.reportRows?.()||[],chargeable=new Set(['RECEIVED','SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED','CUSTOMER_SETTLEMENT']);parts=Math.round(rows.filter(x=>String(x?.jobCard||'')===String(no)&&chargeable.has(String(x?.status||'').toUpperCase())).reduce((n,x)=>n+num(x.amount),0)*1000)/1000}catch(_){}
 return {job:j,labour,materials,paint,consumables,parts,total:Math.round((labour+consumables+parts)*1000)/1000,consumablesStatus:consumablesStatus(no),paintStatus:paintStatus(no),rate,labourHours:rate>0?Math.round((labour/rate)*1000)/1000:0};
}
window.v128JobCostData=data;
function pill(label,value,cls){return '<div class="v128-status '+(cls||'')+'"><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>'}
function managerHtml(no){
 const d=data(no);if(!d)return'';
 return '<section class="v128-job-cost"><div class="v128-cost-head"><div><b>Total Job Card Cost</b><small>Actual recorded cost · Parts + Consumables + Labour</small></div></div><div class="v128-status-grid">'+pill('CONSUMABLES',d.consumablesStatus,'materials')+pill('PAINT',d.paintStatus,'paint')+'</div><div class="v128-cost-grid">'+pill('PARTS COST','OMR '+d.parts.toFixed(3),'parts')+pill('CONSUMABLES COST','OMR '+d.consumables.toFixed(3),'materials')+pill('LABOUR COST','OMR '+d.labour.toFixed(3),'labour')+pill('TOTAL JOB COST','OMR '+d.total.toFixed(3),'total')+'</div><div class="v128-cost-source"><b>Cost source check</b><span>Consumables actual: OMR '+d.materials.toFixed(3)+'</span><span>Paint net after returns: OMR '+d.paint.toFixed(3)+'</span><span>Labour: '+d.labourHours.toFixed(3)+' h × OMR '+d.rate.toFixed(3)+'/h</span><span>Spare Parts: chargeable recorded commercial amount</span></div></section>';
}
function supervisorHtml(no){
 const d=data(no);if(!d)return'';
 return '<section class="v128-job-cost v128-supervisor-status"><div class="v128-cost-head"><div><b>Materials Status</b><small>Job Card consumables and paint progress</small></div></div><div class="v128-status-grid">'+pill('CONSUMABLES',d.consumablesStatus,'materials')+pill('PAINT',d.paintStatus,'paint')+'</div></section>';
}
function scope(){return document.querySelector('#modal .modal-content,#modalContent,.modal-content')||document.getElementById('modal')}
function inject(no,manager){
 const s=scope();if(!s||s.querySelector?.('.v128-job-cost'))return;const html=manager?managerHtml(no):supervisorHtml(no);if(!html)return;
 const box=document.createElement('div');box.innerHTML=html;const node=box.firstElementChild||box;
 const head=s.querySelector?.('.section-title');if(head&&head.insertAdjacentElement)head.insertAdjacentElement('afterend',node);else if(s.prepend)s.prepend(node);else if(s.appendChild)s.appendChild(node);
}
function wrap(name,manager){
 const old=window[name];if(typeof old!=='function'||old.__v128CostWrapped)return;
 const fn=function(no){const r=old.apply(this,arguments);setTimeout(()=>inject(no,manager),0);return r};fn.__v128CostWrapped=true;window[name]=fn;
}
wrap('openManagerJobDetails',true);wrap('openSupervisorJob',false);
const css=document.createElement('style');css.id='v128JobCostStyle';css.textContent='.v128-job-cost{margin:10px 0;padding:12px;border:1px solid #dbe3ee;border-radius:14px;background:#fff}.v128-cost-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.v128-cost-head b,.v128-cost-head small{display:block}.v128-cost-head b{font-size:13px}.v128-cost-head small{font-size:8px;color:#64748b;margin-top:2px}.v128-status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.v128-cost-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:7px}.v128-status{padding:9px;border-radius:10px;border:1px solid #dbe3ee;background:#f8fafc;min-width:0}.v128-status small,.v128-status b{display:block}.v128-status small{font-size:7px;font-weight:900;color:#64748b}.v128-status b{font-size:12px;margin-top:3px;overflow-wrap:anywhere}.v128-status.parts{background:#fff7ed;border-color:#fed7aa}.v128-status.labour{background:#eff6ff;border-color:#bfdbfe}.v128-status.materials{background:#f0fdf4;border-color:#bbf7d0}.v128-status.paint{background:#fff7fb;border-color:#fbcfe8}.v128-status.total{background:#f5f3ff;border-color:#ddd6fe}.v128-status.total b{font-size:15px}.v128-cost-source{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:8px;padding:8px;border-radius:9px;background:#f8fafc;color:#475569;font-size:8px}.v128-cost-source b{grid-column:1/-1;color:#334155;font-size:9px}@media(max-width:650px){.v128-cost-source{grid-template-columns:1fr}.v128-cost-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';document.head.appendChild(css);
})();