(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const who=()=>typeof me==='undefined'?window.me:me;
const allowed=()=>who()?.role==='Manager';
const identity=()=>{const token=window.zukaitAuth?.getToken?.();return allowed()&&token?String(who().id)+':'+String(token):'';};
const currentMonth=()=>new Date(Date.now()+4*3600000).toISOString().slice(0,7);
const monthLabel=m=>new Date(m+'-01T08:00:00Z').toLocaleDateString('en-GB',{timeZone:'Asia/Muscat',month:'long',year:'numeric'});
const mills=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Math.round(Number(v)*1000);return Number.isSafeInteger(n)?n:null;};
const money=n=>Number.isSafeInteger(n)?'OMR '+(n/1000).toFixed(3):'Pending';
const companyKey=v=>String(v||'Not recorded').trim().replace(/\s+/g,' ').toUpperCase();
let actor='',epoch=0,viewTicket=0,current=null,scheduled=false,disposed=false;
const cache=new Map(),pending=new Map();
function syncActor(){const next=identity();if(next!==actor){actor=next;epoch++;viewTicket++;cache.clear();pending.clear();current=null;}return !!actor;}
// Missing categories remain unconfirmed; recorded components are still useful.
function recordedCost(row){
 const total=mills(row.total_cost_omr);if(total!==null)return total;
 const values=Object.values(row.cost_breakdown_omr||{}).concat(row.sublet_cost_omr).map(mills).filter(n=>n!==null);
 return values.length?values.reduce((a,b)=>a+b,0):null;
}
function summary(rows){
 const amount=rows.reduce((n,r)=>n+(mills(r.amount_omr)||0),0),missing=rows.filter(r=>!r.costs_complete||mills(r.total_cost_omr)===null).length;
 const costs=rows.map(recordedCost),cost=costs.some(n=>n!==null)||!rows.length?costs.reduce((n,c)=>n+(c||0),0):null,profit=cost===null?null:amount-cost;
 return{amount,cost,profit,margin:profit===null||amount===0?null:profit/amount*100,missing,count:rows.length};
}
function signClass(n){return n===null?'mp-pending':n>0?'mp-profit':n<0?'mp-loss':'mp-even';}
function profitText(n){return n===null?'Pending costs':(n>0?'+':'')+money(n);}
async function load(month,force=false){
 if(!syncActor()||!navigator.onLine||window.zukaitSessionPrivacy?.locked)throw Error('CONNECTION_UNAVAILABLE');
 const known=cache.get(month);if(!force&&known&&Date.now()-known.at<60000)return known;
 if(pending.has(month))return pending.get(month);
 const token=actor,generation=epoch;
 const task=(async()=>{
  for(let attempt=0;attempt<2;attempt++){
   let offset=0,rows=[],revision=null,finance=null,result=null,changed=false;const visited=new Set();
   do{
    if(visited.has(offset))throw Error('INVALID_REPORT_PAGE');visited.add(offset);
    const page=await window.zukaitCloud.readManagerProfit({month,offset});
    if(identity()!==token||generation!==epoch||!navigator.onLine)throw Error('ACCOUNT_CHANGED');
    if(!Array.isArray(page.rows)||!Number.isSafeInteger(page.snapshot_revision)||!Number.isSafeInteger(page.finance_revision))throw Error('INVALID_REPORT');
    if(revision===null){revision=page.snapshot_revision;finance=page.finance_revision;result=page;}
    else if(revision!==page.snapshot_revision||finance!==page.finance_revision){changed=true;break;}
    rows.push(...page.rows);
    if(page.next_offset!==null&&(!Number.isSafeInteger(page.next_offset)||page.next_offset<=offset))throw Error('INVALID_REPORT_PAGE');
    offset=page.next_offset;
   }while(offset!==null);
   if(changed)continue;
   if(rows.length!==result.total_count||new Set(rows.map(r=>r.job_card)).size!==rows.length)throw Error('INVALID_REPORT_PAGE');
   const saved={...result,rows,at:Date.now()};cache.set(month,saved);return saved;
  }
  throw Error('REPORT_CHANGED');
 })();
 pending.set(month,task);try{return await task;}finally{if(generation===epoch)pending.delete(month);}
}
function message(error){const code=error?.message||'';return ['invalid_report','unknown_action','REPORT_UNAVAILABLE'].includes(code)?'This report requires the approved server update.':'Report unavailable. Check the connection and refresh. No previous-account or offline report is shown.';}
function updateCards(data,error){
 for(const kind of ['CASH','INSURANCE']){
  const card=document.querySelector('[data-profit-card="'+kind+'"]');if(!card)continue;
  const value=data?money(summary(data.rows.filter(r=>r.kind===kind)).amount):error?'Unavailable':'Loading…',el=card.querySelector('b'),note=card.querySelector('small');
  if(el.textContent!==value)el.textContent=value;
  const subtitle=error?message(error):monthLabel(currentMonth())+' · '+(kind==='CASH'?'Final invoices':'LPO documents received');
  if(note.textContent!==subtitle)note.textContent=subtitle;
  card.title=data?'Verified '+new Date(data.as_of).toLocaleString('en-GB',{timeZone:'Asia/Muscat'}):subtitle;
 }
}
function install(){
 if(!syncActor())return;const grid=document.querySelector('#managerView .v123-manager-performance .v123-grid');if(!grid)return;
 for(const kind of ['CASH','INSURANCE'])if(!grid.querySelector('[data-profit-card="'+kind+'"]')){
  const button=document.createElement('button');button.type='button';button.className='v123-perf mp-dashboard-card';button.dataset.profitCard=kind;
  button.innerHTML='<span>'+(kind==='CASH'?'Cash':'Insurance')+'</span><b>Loading…</b><small></small>';button.onclick=()=>open(kind);grid.appendChild(button);
 }
 const data=cache.get(currentMonth());updateCards(data);
 if(document.visibilityState==='hidden'||!navigator.onLine||window.zukaitSessionPrivacy?.locked)return;
 const generation=epoch;load(currentMonth()).then(value=>{if(generation===epoch&&allowed())updateCards(value);}).catch(error=>{if(generation===epoch&&allowed())updateCards(null,error);});
}
function queueInstall(){if(scheduled||disposed)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(!disposed)install();});}
function graph(rows,kind,month){
 const x=summary(rows),max=Math.max(1,x.amount,x.cost||0,Math.abs(x.profit||0));
 const series=[{label:kind==='CASH'?'Cash received':'LPO value',value:x.amount,type:'mp-revenue'},{label:'Recorded job cost',value:x.cost,type:'mp-cost'},{label:x.missing?'Provisional profit / loss':'Net job profit / loss',value:x.profit,type:x.missing?'mp-pending':signClass(x.profit)}];
 const days=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate(),counts=Array(days).fill(0);
 rows.forEach(r=>{const d=Number(r.date.slice(8,10));if(d>=1&&d<=days)counts[d-1]++});
 const peak=Math.max(1,...counts),points=counts.map((n,i)=>[20+i*600/(days-1),150-n/peak*110]),line=points.map(p=>p.join(',')).join(' '),area='20,150 '+line+' 620,150';
 const chart='<svg class="mp-trend" viewBox="0 0 640 180" role="img" aria-label="'+esc(monthLabel(month)+': '+rows.length+' total job cards. Daily counts: '+counts.join(', '))+'"><defs><linearGradient id="mpArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#377cf6" stop-opacity=".3"/><stop offset="100%" stop-color="#377cf6" stop-opacity=".02"/></linearGradient></defs>'+[40,95,150].map(y=>'<line x1="20" x2="620" y1="'+y+'" y2="'+y+'" stroke="#e4ebf5"/>').join('')+'<polygon points="'+area+'" fill="url(#mpArea)"/><polyline points="'+line+'" fill="none" stroke="#377cf6" stroke-width="3" stroke-linejoin="round"/>'+points.map((p,i)=>counts[i]?'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4" fill="#377cf6"><title>'+esc(String(i+1)+' '+monthLabel(month)+': '+counts[i]+' job cards')+'</title></circle>':'').join('')+'<text x="20" y="173" fill="#64748b" font-size="12">01</text><text x="620" y="173" text-anchor="end" fill="#64748b" font-size="12">'+days+'</text></svg>';
 return '<section class="mp-period-overview"><div class="mp-chart-hero"><div><span>SELECTED PERIOD · '+esc(monthLabel(month))+'</span><h3>Workshop financial overview</h3><p>All '+x.count+' job cards in the current filters</p></div><div class="mp-job-count"><strong>'+x.count+'</strong><span>Total job cards</span></div></div><div class="mp-graph-grid"><section class="mp-chart-panel"><h3>Revenue, cost &amp; result</h3><p class="mp-note">'+(x.missing?'Recorded amounts · '+x.missing+' job(s) awaiting final costs':'Complete recorded job costs')+'</p><div class="mp-chart">'+series.map(g=>'<div class="mp-chart-row"><div><span>'+esc(g.label)+'</span><strong class="'+g.type+'">'+esc(g.value===null?'Not recorded':money(g.value))+'</strong></div><div class="mp-chart-track"><span class="mp-chart-bar '+g.type+'" style="width:'+(Math.abs(g.value||0)/max*100).toFixed(3)+'%"></span></div></div>').join('')+'</div></section><section class="mp-chart-panel"><div class="mp-trend-heading"><div><h3>Job cards across the month</h3><p class="mp-note">Daily '+(kind==='CASH'?'final invoices':'LPO documents received')+' · '+x.count+' total</p></div><b>'+Math.max(...counts)+'<small>Peak day</small></b></div>'+chart+'</section></div></section>';
}
function table(rows,kind){
 const columns=[['#','serial'],['Cash / LPO date','date'],['JC number','job'],['Vehicle','vehicle'],...(kind==='INSURANCE'?[['Insurance company','company']]:[]),['Cash / LPO amount','amount'],['Total job cost','cost'],['Net profit / loss','profit'],['Profit %','margin']];
 return '<div class="mp-table-scroll"><table class="mp-table '+(kind==='CASH'?'mp-cash-table':'')+'"><caption>Selected-period job cards · all amounts in OMR</caption><colgroup>'+columns.map(([,k])=>'<col class="mp-col-'+k+'">').join('')+'</colgroup><thead><tr>'+columns.map(([label])=>'<th scope="col">'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+rows.map((r,i)=>{
  const cost=recordedCost(r),incomplete=!r.costs_complete||mills(r.total_cost_omr)===null,profit=cost===null?null:(mills(r.amount_omr)||0)-cost,margin=profit===null||!mills(r.amount_omr)?null:profit/mills(r.amount_omr)*100,cls=incomplete?'mp-pending':signClass(profit),status=incomplete?'<small class="mp-provisional">Provisional</small>':'';
  const values={serial:String(i+1),date:esc(r.date.split('-').reverse().join('.')),job:esc(r.job_card),vehicle:esc(r.vehicle||'Not recorded')+(r.registration?'<small>'+esc(r.registration)+'</small>':''),company:esc(r.insurance_company||'Not recorded'),amount:esc(money(mills(r.amount_omr))),cost:esc(cost===null?'Not recorded':money(cost))+status,profit:esc(profitText(profit))+status,margin:margin===null?'—':margin.toFixed(2)+'%'+status};
  return '<tr>'+columns.map(([label,k])=>'<td data-label="'+esc(label)+'" class="mp-cell-'+k+' '+(['profit','margin'].includes(k)?cls:'')+'"'+(k==='profit'?' title="'+esc((r.cost_notes||[]).join('; '))+'"':'')+'>'+values[k]+'</td>').join('')+'</tr>';
 }).join('')+'</tbody></table></div>';
}
function renderView(){
 if(!current||!allowed()||current.actor!==identity())return;
 const host=document.getElementById('mpPage');if(!host)return;const v=current;
 const all=v.data.rows.filter(r=>r.kind===v.kind),companies=[...new Map(all.map(r=>[companyKey(r.insurance_company),r.insurance_company||'Not recorded'])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
 const rows=all.filter(r=>!v.company||companyKey(r.insurance_company)===v.company),x=summary(rows);
 host.innerHTML='<div class="mp-heading"><div><h2>'+esc(v.kind==='CASH'?'Cash — Monthly Performance':'Insurance — Monthly LPO Performance')+'</h2><p>'+esc(monthLabel(v.month))+'</p></div><button type="button" data-mp="close">Close ×</button></div><div class="mp-filters"><label>Month<input id="mpMonth" type="month" value="'+esc(v.month)+'"></label>'+(v.kind==='INSURANCE'?'<label>Insurance company<select id="mpCompany"><option value="">All insurance companies</option>'+companies.map(([id,label])=>'<option value="'+esc(id)+'"'+(id===v.company?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>':'')+'<label>View<select id="mpMode"><option value="list"'+(v.mode==='list'?' selected':'')+'>List</option><option value="graph"'+(v.mode==='graph'?' selected':'')+'>Graph</option></select></label><button type="button" data-mp="refresh">Refresh</button></div><div class="mp-summary"><div><span>'+(v.kind==='CASH'?'Cash received — final invoices':'LPO documents received')+'</span><b>'+esc(money(x.amount))+'</b></div><div><span>Total recorded job cost</span><b>'+esc(x.cost===null?'Not recorded':money(x.cost))+'</b><small>'+ (x.missing?'Recorded to date · '+x.missing+' unconfirmed':'All job costs complete')+'</small></div><div><span>'+(x.missing?'Provisional profit / loss':'Net job profit / loss')+'</span><b class="'+(x.missing?'mp-pending':signClass(x.profit))+'">'+esc(profitText(x.profit))+'</b><small>'+(x.missing?'Final profit changes when costs are confirmed':'Revenue minus all recorded costs')+'</small></div><div><span>'+(x.missing?'Provisional margin':'Profit margin')+'</span><b class="'+(x.missing?'mp-pending':signClass(x.profit))+'">'+(x.margin===null?'—':x.margin.toFixed(2)+'%')+'</b></div></div><p class="mp-note">'+rows.length+' jobs · '+x.missing+' with incomplete costs. '+(v.kind==='CASH'?'Final invoice amounts count once as received; additional receipt entries are not added again.':'LPO documents received are not insurer payment receipts.')+'</p>'+(x.missing?'<div class="mp-cost-notice"><b>'+x.missing+' job(s) need cost confirmation.</b> Recorded costs are shown now; profit and margin are provisional. '+rows.filter(r=>!r.costs_complete||mills(r.total_cost_omr)===null).map(r=>'<span>JC '+esc(r.job_card)+' · '+esc((r.cost_notes||['Final cost not confirmed']).join('; '))+'</span>').join('')+'</div>':'')+(rows.length?(v.mode==='graph'?graph(rows,v.kind,v.month):table(rows,v.kind)):'<p class="mp-empty">No matching '+(v.kind==='CASH'?'final Cash invoices':'received LPO documents')+' for this month.</p>')+'<p class="mp-note">Profit = invoice/LPO amount − recorded labour, materials, paint, parts and sublet costs. Profit % = profit ÷ invoice/LPO amount × 100. Workshop overheads and tax adjustments are not included; Unconfirmed costs are excluded from recorded totals; provisional profit and margin may decrease when those costs are confirmed. '+(v.data.undated_records?esc(v.data.undated_records)+' records without a valid source date are excluded. ':'')+'Verified '+esc(new Date(v.data.as_of).toLocaleString('en-GB',{timeZone:'Asia/Muscat'}))+' (Oman time).</p>';
 host.querySelector('#mpMonth').onchange=e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))open(v.kind,e.target.value,v.mode);};
 const company=host.querySelector('#mpCompany');if(company)company.onchange=e=>{v.company=e.target.value;renderView();};
 host.querySelector('#mpMode').onchange=e=>{v.mode=e.target.value;renderView();};
 host.querySelector('[data-mp="close"]').onclick=()=>{viewTicket++;current=null;window.closeModal();};
 host.querySelector('[data-mp="refresh"]').onclick=()=>open(v.kind,v.month,v.mode,v.company);
}
async function open(kind,month=currentMonth(),mode='list',company=''){
 if(!allowed()||!['CASH','INSURANCE'].includes(kind))return;syncActor();
 const ticket=++viewTicket,owner=actor;current=null;
 window.openModal('<section id="mpPage" class="mp-page"><div class="mp-heading"><h2>Loading verified monthly report…</h2><button type="button" onclick="closeModal()">Close ×</button></div></section>');const host=document.getElementById('mpPage');
 try{const data=await load(month,true);if(ticket!==viewTicket||owner!==identity()||document.getElementById('mpPage')!==host)return;current={kind,month,mode,company,data,actor:owner};renderView();if(month===currentMonth())updateCards(data);}
 catch(error){if(ticket!==viewTicket||owner!==identity()||document.getElementById('mpPage')!==host)return;host.innerHTML='<h2>Monthly report unavailable</h2><p>'+esc(message(error))+'</p><button type="button" onclick="closeModal()">Close ×</button>';}
}
const style=document.createElement('style');style.textContent="\n.mp-dashboard-card small{display:block;font-size:11px;margin-top:5px;color:#52657a}\n.mp-page{color:#172b45;font:14px/1.5 system-ui;min-width:0;max-width:100%}.mp-page *{box-sizing:border-box}\n.mp-heading{display:flex;align-items:start;justify-content:space-between;gap:12px}.mp-heading>div{min-width:0}.mp-heading h2{margin:0;font-size:23px;letter-spacing:-.5px}.mp-heading p{margin:5px 0;color:#64748b}\n.mp-page button{min-height:44px;padding:9px 14px;border:1px solid #bdd0e5;border-radius:12px;background:#edf4ff;color:#224b74;font:inherit;cursor:pointer}\n.mp-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;align-items:end;margin:20px 0}.mp-filters label{display:grid;gap:5px;font-weight:700;min-width:0}.mp-filters input,.mp-filters select{min-width:0;max-width:100%;width:100%;min-height:44px;padding:9px;border:1px solid #b8cde0;border-radius:10px;font:inherit;background:#fff;color:#172b45}\n.mp-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.mp-summary>div{padding:16px 14px;border:1px solid #d5e2ee;border-radius:16px;background:linear-gradient(135deg,#f6faff,#fff);min-width:0}.mp-summary span,.mp-summary b,.mp-summary small{display:block;overflow-wrap:anywhere}.mp-summary span{font-size:12px;color:#52657a}.mp-summary b{font-size:clamp(17px,1.8vw,25px);margin-top:7px;font-variant-numeric:tabular-nums;letter-spacing:-.5px}.mp-summary small{font-size:11px;color:#64748b;margin-top:5px}\n.mp-profit{color:#147438!important}.mp-loss{color:#b42318!important}.mp-pending{color:#795600!important}.mp-even{color:#334155!important}.mp-revenue{color:#2563eb}.mp-cost{color:#7c3aed}.mp-note{font-size:12px;color:#52657a;line-height:1.6}\n.mp-cost-notice{padding:12px 14px;margin:14px 0;border:1px solid #ead7a5;border-radius:12px;background:#fffaf0;color:#71521a;font-size:12px}.mp-cost-notice span{display:block;margin-top:4px}.mp-provisional{color:#795600!important;font-weight:600}\n.mp-table-scroll{max-width:100%;min-width:0}.mp-table{width:100%!important;min-width:0!important;table-layout:fixed;border-collapse:collapse;font-size:12px}.mp-table caption{max-width:100%;text-align:left;font-size:12px;color:#64748b;margin:10px 0}.mp-table th,.mp-table td{padding:12px 7px;border-bottom:1px solid #dce6ef;text-align:left;vertical-align:top;white-space:normal!important;overflow-wrap:anywhere}.mp-table th{background:#172b45;color:#fff;font-size:11px;line-height:1.4}.mp-table td{font-variant-numeric:tabular-nums}.mp-table tbody tr:nth-child(even){background:#f7faff}.mp-table small{display:block;color:#64748b;font-size:10px;margin-top:3px}.mp-col-serial{width:3%}.mp-col-date{width:9%}.mp-col-job{width:7%}.mp-col-vehicle{width:19%}.mp-col-company{width:13%}.mp-col-amount,.mp-col-cost,.mp-col-profit{width:13%}.mp-col-margin{width:10%}.mp-cash-table .mp-col-vehicle{width:23%}.mp-cell-amount,.mp-cell-cost,.mp-cell-profit,.mp-cell-margin{font-weight:750}\n.mp-chart-hero{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:24px;border-radius:20px;background:linear-gradient(120deg,#142642,#254d83);color:#fff;margin:18px 0}.mp-chart-hero>div>span{font-size:10px;font-weight:750;letter-spacing:1.3px;color:#c6daff}.mp-chart-hero h3{font-size:23px;letter-spacing:-.5px;margin:7px 0}.mp-chart-hero p{margin:0;color:#c6daff;font-size:13px}.mp-job-count{text-align:center;background:#ffffff12;border:1px solid #ffffff26;border-radius:16px;padding:12px 22px;flex-shrink:0}.mp-job-count strong{display:block;font-size:42px;line-height:1.1;letter-spacing:-2px}.mp-job-count span{display:block;font-size:12px;margin-top:6px}\n.mp-graph-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.mp-chart-panel{padding:20px;border:1px solid #dce6f1;border-radius:18px;background:linear-gradient(145deg,#fff,#f8fbff);min-width:0}.mp-chart-panel h3{font-size:15px;margin:0}.mp-chart-panel .mp-note{margin:5px 0 18px}.mp-chart-row{margin:17px 0}.mp-chart-row>div:first-child{display:flex;justify-content:space-between;gap:12px;align-items:start;font-size:12px}.mp-chart-row strong{font-variant-numeric:tabular-nums;white-space:nowrap}.mp-chart-track{height:11px;background:#e9eff7;border-radius:8px;margin-top:8px;overflow:hidden}.mp-chart-bar{display:block;height:100%;border-radius:8px;background:currentColor;min-width:0}.mp-trend{display:block;width:100%;height:auto;margin-top:20px}.mp-trend-heading{display:flex;gap:12px;justify-content:space-between}.mp-trend-heading>b{font-size:22px;color:#2563eb;text-align:right}.mp-trend-heading small{display:block;font-size:10px;color:#64748b;white-space:nowrap;font-weight:500}.mp-empty{padding:24px;background:#f5f8fc;border-radius:12px}\n@media(max-width:900px){.mp-table{font-size:11px}.mp-table th,.mp-table td{padding:10px 5px}.mp-table th{font-size:10px}.mp-graph-grid{grid-template-columns:1fr}}\n@media(max-width:700px){.mp-summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mp-summary>div{padding:12px}.mp-summary b{font-size:18px}.mp-heading h2{font-size:20px}.mp-filters{grid-template-columns:1fr 1fr}.mp-table,.mp-table tbody{display:block}.mp-table caption{display:block}.mp-table colgroup,.mp-table thead{display:none}.mp-table tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px;border:1px solid #dce6ef;border-radius:14px;padding:10px;margin:12px 0;background:#fff!important}.mp-table td{display:block;width:auto!important;font-size:13px;min-width:0;padding:9px 0}.mp-table td:before{content:attr(data-label);display:block;color:#64748b;font-size:10px;font-weight:500;margin-bottom:4px}.mp-table .mp-cell-serial{grid-column:1/-1;padding:0 0 7px;font-size:11px;color:#64748b}.mp-table .mp-cell-serial:before{content:'No. ';display:inline}.mp-cell-vehicle,.mp-cell-company{grid-column:1/-1}.mp-chart-hero{padding:18px;gap:12px}.mp-chart-hero h3{font-size:18px}.mp-job-count{padding:10px 14px}.mp-job-count strong{font-size:34px}.mp-job-count span{font-size:10px}.mp-chart-panel{padding:16px}.mp-chart-row>div:first-child{flex-wrap:wrap;gap:4px}.mp-chart-hero>div>span{font-size:9px}}\n";document.head.appendChild(style);
window.zukaitManagerProfit={install,open};
const observer=new MutationObserver(()=>{if(!document?.documentElement)return;const grid=document.querySelector('#managerView .v123-manager-performance .v123-grid');if(grid&&grid.querySelectorAll('[data-profit-card]').length<2)queueInstall();else if(!allowed())syncActor();});observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('pagehide',()=>{disposed=true;observer.disconnect();epoch++;viewTicket++;cache.clear();pending.clear();current=null;});
window.addEventListener('zukait-live-status',()=>{if(allowed()&&cache.get(currentMonth())?.snapshot_revision!==window.zukaitCloud?.revision)queueInstall();});
window.addEventListener('zukait:state-updated',queueInstall);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queueInstall();});
window.addEventListener('offline',()=>{epoch++;viewTicket++;cache.clear();pending.clear();current=null;updateCards(null,Error('OFFLINE'));});
queueInstall();
})();
