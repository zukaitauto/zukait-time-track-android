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
function summary(rows){const amount=rows.reduce((n,r)=>n+(mills(r.amount_omr)||0),0),missing=rows.filter(r=>!r.costs_complete||mills(r.total_cost_omr)===null).length,cost=missing?null:rows.reduce((n,r)=>n+mills(r.total_cost_omr),0);return{amount,cost,profit:cost===null?null:amount-cost,margin:cost===null||amount===0?null:(amount-cost)/amount*100,missing};}
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
function groups(rows,kind){
 const map=new Map();for(const row of rows){const id=kind==='INSURANCE'?companyKey(row.insurance_company):row.job_card,label=kind==='INSURANCE'?(row.insurance_company||'Not recorded'):'JC '+row.job_card;const item=map.get(id)||{id,label,rows:[]};item.rows.push(row);map.set(id,item);}
 return [...map.values()].map(g=>({...g,...summary(g.rows)})).sort((a,b)=>(a.profit===null)-(b.profit===null)||(b.profit??0)-(a.profit??0)||a.label.localeCompare(b.label));
}
function graph(rows,kind){
 const data=groups(rows,kind),max=Math.max(1,...data.map(x=>Math.abs(x.profit||0)));
 return '<h3>Profit / loss by '+(kind==='INSURANCE'?'insurance company':'job card')+'</h3><p class="mp-note">Green: profit · Red: loss · Centre line: zero. A group stays pending if any job cost is incomplete.</p><div class="mp-chart">'+data.map(g=>'<div class="mp-chart-row"><b>'+esc(g.label)+'</b><div class="mp-chart-track" role="img" aria-label="'+esc(g.label+': '+profitText(g.profit))+'">'+(g.profit===null?'<span class="mp-chart-pending">Pending costs</span>':'<span class="mp-chart-bar '+signClass(g.profit)+'" style="'+(g.profit<0?'right:50%':'left:50%')+';width:'+(Math.abs(g.profit)/max*50).toFixed(3)+'%"></span>')+'</div><strong class="'+signClass(g.profit)+'">'+esc(profitText(g.profit))+'</strong><small>'+g.rows.length+' jobs · '+(g.margin===null?'Margin pending / unavailable':g.margin.toFixed(2)+'% margin')+'</small></div>').join('')+'</div>';
}
function table(rows){return '<div class="mp-table-scroll"><table><thead><tr><th scope="col">#</th><th scope="col">Cash / LPO date</th><th scope="col">JC number</th><th scope="col">Vehicle</th><th scope="col">Insurance company</th><th scope="col">Cash / LPO amount</th><th scope="col">Total job cost</th><th scope="col">Net job profit / loss</th><th scope="col">Profit %</th></tr></thead><tbody>'+rows.map((r,i)=>{const profit=mills(r.profit_omr),date=r.date.split('-').reverse().join('.');return '<tr><td>'+(i+1)+'</td><td>'+esc(date)+'</td><td>'+esc(r.job_card)+'</td><td>'+esc(r.vehicle||'Not recorded')+(r.registration?'<small>'+esc(r.registration)+'</small>':'')+'</td><td>'+esc(r.kind==='INSURANCE'?(r.insurance_company||'Not recorded'):'—')+'</td><td>'+esc(money(mills(r.amount_omr)))+'</td><td>'+esc(r.costs_complete?money(mills(r.total_cost_omr)):'Pending')+'</td><td class="'+signClass(profit)+'" title="'+esc((r.cost_notes||[]).join('; '))+'">'+esc(profitText(profit))+'</td><td class="'+signClass(profit)+'">'+(r.profit_percentage===null?(profit===null?'Pending':'—'):Number(r.profit_percentage).toFixed(2)+'%')+'</td></tr>';}).join('')+'</tbody></table></div>';}
function renderView(){
 if(!current||!allowed()||current.actor!==identity())return;
 const host=document.getElementById('mpPage');if(!host)return;const v=current;
 const all=v.data.rows.filter(r=>r.kind===v.kind),companies=[...new Map(all.map(r=>[companyKey(r.insurance_company),r.insurance_company||'Not recorded'])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
 const rows=all.filter(r=>!v.company||companyKey(r.insurance_company)===v.company),x=summary(rows);
 host.innerHTML='<div class="mp-heading"><div><h2>'+esc(v.kind==='CASH'?'Cash — Monthly Performance':'Insurance — Monthly LPO Performance')+'</h2><p>'+esc(monthLabel(v.month))+'</p></div><button type="button" data-mp="close">Close ×</button></div><div class="mp-filters"><label>Month<input id="mpMonth" type="month" value="'+esc(v.month)+'"></label>'+(v.kind==='INSURANCE'?'<label>Insurance company<select id="mpCompany"><option value="">All insurance companies</option>'+companies.map(([id,label])=>'<option value="'+esc(id)+'"'+(id===v.company?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>':'')+'<label>View<select id="mpMode"><option value="list"'+(v.mode==='list'?' selected':'')+'>List</option><option value="graph"'+(v.mode==='graph'?' selected':'')+'>Graph</option></select></label><button type="button" data-mp="refresh">Refresh</button></div><div class="mp-summary"><div><span>'+(v.kind==='CASH'?'Cash received — final invoices':'LPO documents received')+'</span><b>'+esc(money(x.amount))+'</b></div><div><span>Total recorded job cost</span><b>'+esc(x.cost===null?'Pending costs':money(x.cost))+'</b></div><div><span>Net job profit / loss</span><b class="'+signClass(x.profit)+'">'+esc(profitText(x.profit))+'</b></div><div><span>Profit margin</span><b class="'+signClass(x.profit)+'">'+(x.margin===null?'—':x.margin.toFixed(2)+'%')+'</b></div></div><p class="mp-note">'+rows.length+' jobs · '+x.missing+' with incomplete costs. '+(v.kind==='CASH'?'Final invoice amounts count once as received; additional receipt entries are not added again.':'LPO documents received are not insurer payment receipts.')+'</p>'+(rows.length?(v.mode==='graph'?graph(rows,v.kind):table(rows)):'<p class="mp-empty">No matching '+(v.kind==='CASH'?'final Cash invoices':'received LPO documents')+' for this month.</p>')+'<p class="mp-note">Profit = invoice/LPO amount − recorded labour, materials, paint, parts and sublet costs. Profit % = profit ÷ invoice/LPO amount × 100. Workshop overheads and tax adjustments are not included; incomplete costs are pending, not zero. '+(v.data.undated_records?esc(v.data.undated_records)+' records without a valid source date are excluded. ':'')+'Verified '+esc(new Date(v.data.as_of).toLocaleString('en-GB',{timeZone:'Asia/Muscat'}))+' (Oman time).</p>';
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
const style=document.createElement('style');style.textContent='.mp-dashboard-card small{display:block;font-size:11px;margin-top:5px;color:#52657a}.mp-page{color:#172b45;font:16px/1.45 system-ui}.mp-heading{display:flex;align-items:start;justify-content:space-between;gap:12px}.mp-heading h2{margin:0}.mp-page button{min-height:44px;padding:9px 14px;border:1px solid #bdd0e5;border-radius:10px;background:#edf4ff;color:#224b74;font:inherit;cursor:pointer}.mp-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;align-items:end;margin:18px 0}.mp-filters label{display:grid;gap:5px;font-weight:700;min-width:0}.mp-filters input,.mp-filters select{width:100%;box-sizing:border-box;min-height:44px;padding:9px;border:1px solid #b8cde0;border-radius:9px;font:inherit;background:#fff;color:#172b45}.mp-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.mp-summary>div{padding:14px;border:1px solid #d5e2ee;border-radius:12px;background:#f6faff;min-width:0}.mp-summary span,.mp-summary b{display:block;overflow-wrap:anywhere}.mp-summary span{font-size:13px}.mp-summary b{font-size:22px;margin-top:5px;font-variant-numeric:tabular-nums}.mp-profit{color:#147438!important}.mp-loss{color:#b42318!important}.mp-pending{color:#795600!important}.mp-even{color:#334155!important}.mp-note{font-size:13px;color:#52657a;line-height:1.6}.mp-table-scroll{overflow-x:auto;max-width:100%}.mp-table-scroll table{min-width:1100px;width:100%;border-collapse:collapse}.mp-table-scroll th,.mp-table-scroll td{padding:12px 10px;border-bottom:1px solid #dce6ef;text-align:left;vertical-align:top}.mp-table-scroll th{background:#edf4fb;white-space:nowrap}.mp-table-scroll td{font-variant-numeric:tabular-nums}.mp-table-scroll td:first-child{width:35px}.mp-table-scroll td:nth-child(n+6){white-space:nowrap;font-weight:700}.mp-table-scroll small{display:block;color:#64748b}.mp-chart-row{display:grid;grid-template-columns:minmax(120px,1fr) minmax(150px,2fr) minmax(140px,1fr);gap:8px;align-items:center;padding:13px 0;border-bottom:1px solid #e1e8f0}.mp-chart-row>b{overflow-wrap:anywhere}.mp-chart-row>small{grid-column:2/-1;color:#52657a}.mp-chart-track{height:32px;position:relative;background:linear-gradient(to right,#fff1f1 0%,#fff1f1 49.8%,#475569 49.8%,#475569 50.2%,#edf9f1 50.2%);border-radius:4px}.mp-chart-bar{position:absolute;top:5px;height:22px;background:currentColor;min-width:1px}.mp-chart-pending{display:block;text-align:center;font-size:13px;line-height:32px;background:#fff7df}.mp-chart-row>strong{text-align:right;font-variant-numeric:tabular-nums}.mp-empty{padding:24px;background:#f5f8fc;border-radius:12px}@media(max-width:700px){.mp-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.mp-summary b{font-size:18px}.mp-chart-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.mp-chart-row>b{grid-column:1/-1}.mp-chart-track{grid-column:1/-1}.mp-chart-row>small{grid-column:1}.mp-chart-row>strong{grid-column:2}.mp-heading h2{font-size:21px}.mp-filters{grid-template-columns:1fr}}';document.head.appendChild(style);
window.zukaitManagerProfit={install,open};
const observer=new MutationObserver(()=>{if(!document?.documentElement)return;const grid=document.querySelector('#managerView .v123-manager-performance .v123-grid');if(grid&&grid.querySelectorAll('[data-profit-card]').length<2)queueInstall();else if(!allowed())syncActor();});observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('pagehide',()=>{disposed=true;observer.disconnect();epoch++;viewTicket++;cache.clear();pending.clear();current=null;});
window.addEventListener('zukait-live-status',()=>{if(allowed()&&cache.get(currentMonth())?.snapshot_revision!==window.zukaitCloud?.revision)queueInstall();});
window.addEventListener('zukait:state-updated',queueInstall);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queueInstall();});
window.addEventListener('offline',()=>{epoch++;viewTicket++;cache.clear();pending.clear();current=null;updateCards(null,Error('OFFLINE'));});
queueInstall();
})();
