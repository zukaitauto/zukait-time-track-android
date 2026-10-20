/* V251 shared monthly Cash Vehicle In / Vehicle Out dashboard snapshot. */
(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'OMR '+Number(v||0).toFixed(3);
function role(){return (typeof me==='undefined'?window.me:me)?.role||''}
function snapshot(){return window.zukaitCloud?.confirmedState||(typeof state==='undefined'?window.state:state)||{}}
function live(j){const x=window.zukaitJobCardMaster?.display?.(j?.no,j);return x?{...j,vehicle:j.vehicle||x.vehicle,reg:j.reg||x.reg,year:j.year||x.year}:j}
function all(){return (snapshot().jobs||[]).filter(j=>j&&j.no!=='ID001'&&!j.deleted&&!j.archived).map(live).filter(j=>String(j.jobType||'').trim().toUpperCase()==='CASH')}
function month(){const d=new Date(),parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Muscat',year:'numeric',month:'numeric'}).formatToParts(d),y=Number(parts.find(x=>x.type==='year').value),m=Number(parts.find(x=>x.type==='month').value);return{from:Date.UTC(y,m-1,1)-4*3600000,to:Date.UTC(y,m,1)-4*3600000,label:d.toLocaleString('en',{timeZone:'Asia/Muscat',month:'long',year:'numeric'})}}
function rows(kind){const {from,to}=month();return all().filter(j=>kind==='in'?Number(j.createdAt||0)>=from&&Number(j.createdAt||0)<to:j.delivered&&Number(j.deliveredAt||0)>=from&&Number(j.deliveredAt||0)<to)}
function amount(j,kind){const invoice=j.finalInvoiceAmount,hasInvoice=invoice!==null&&invoice!==undefined&&invoice!==''&&typeof invoice!=='boolean'&&Number.isFinite(Number(invoice))&&Number(invoice)>=0;const n=Number(kind==='out'&&hasInvoice?invoice:(j.amount??0));return Number.isFinite(n)?n:0}
function total(a,kind='in'){return a.reduce((n,j)=>n+amount(j,kind),0)}
function pendingAll(){return all().filter(j=>!j.delivered)}
function outstandingTotal(a){return a.reduce((n,j)=>n+(Number(j.amount)||0),0)}
function cashStatus(j,now=Date.now()){
 if(j.delivered)return '<span class="v251-job-status delivered">🟢 Delivered</span>';
 const raw=j.createdAt,opened=raw==null||raw===''?NaN:typeof raw==='number'||/^\d+$/.test(String(raw))?Number(raw):Date.parse(raw);
 const omanDay=t=>Math.floor((t+4*3600000)/86400000),days=Number.isFinite(opened)&&opened>0?Math.max(0,omanDay(now)-omanDay(opened)):null;
 const text=days===null?'Open · Opening date not recorded':days===0?'Opened today':'Open · '+days+' '+(days===1?'day':'days');
 return '<span class="v251-job-status open">🟡 '+esc(text)+'</span>';
}
// Follow the authoritative Insurance Management eligibility and LPO completion rules.
function insuranceRows(kind){
 const {from,to}=month(),monthKey=new Date(from+14400000).toISOString().slice(0,7),unique=new Map();
 for(const j of snapshot().jobs||[]){
  const key=String(j?.no||'').trim().toUpperCase();
  if(!key||key==='ID001'||String(j.jobType||'').trim().toUpperCase()!=='INSURANCE'||j.deleted||j.archived||j.cancelled||String(j.status||'').trim().toUpperCase()==='CANCELLED')continue;
  const old=unique.get(key);if(!old||Number(j.createdAt||0)>Number(old.createdAt||0))unique.set(key,j);
 }
 return [...unique.values()].filter(j=>{
  if(kind==='collected'){
   const l=j.insuranceLpo,d=l?.receivedDate;
   return !!l&&Number.isFinite(l.amount)&&l.amount>=0&&typeof d==='string'&&d>='1900-01-01'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d&&d.startsWith(monthKey);
  }
  const t=Number(kind==='out'?j.deliveredAt:j.createdAt);
  return (kind!=='out'||j.delivered)&&t>=from&&t<to;
 }).map(live);
}
const insuranceTotal=a=>a.reduce((n,j)=>n+Math.round(j.insuranceLpo.amount*1000),0)/1000;
function approximateRepairValue(j){
 const v=j.amount;
 return v===null||v===undefined||(typeof v==='string'&&!v.trim())||!['number','string'].includes(typeof v)||!Number.isFinite(Number(v))||Number(v)<0?null:Number(v);
}
function approximateRepairSummary(a){
 const values=a.map(approximateRepairValue),pending=values.filter(v=>v===null).length;
 return {amount:values.reduce((sum,v)=>sum+(v===null?0:Math.round(v*1000)),0)/1000,pending};
}
function repairTotalLabel(a){const r=approximateRepairSummary(a);return a.length&&r.pending===a.length?'Pending':money(r.amount);}
function repairCaption(a){const r=approximateRepairSummary(a);return 'Approx. repair value'+(r.pending?' · '+r.pending+' amount(s) pending':'');}
function insuranceHtml(){
 const i=insuranceRows('in'),o=insuranceRows('out'),l=insuranceRows('collected');
 return '<section class="v251-cash-pulse v251-insurance-pulse" aria-label="Insurance monthly follow-up"><div class="v251-cash-title"><b>Insurance Monthly Follow-up</b><small>'+esc(month().label)+'</small></div><div class="v251-cash-grid">'+[
  ['in','INSURANCE IN',i.length,'Vehicles opened this month','↓'],['out','INSURANCE OUT',o.length,'Vehicles delivered this month','↑'],['collected','LPO COLLECTED',l.length,'LPOs received this month','✓']
 ].map(([kind,title,count,caption,icon])=>'<button type="button" class="v251-followup-card insurance-'+kind+'" onclick="v251OpenInsurancePulse(\''+kind+'\')"><span class="v251-followup-icon" aria-hidden="true">'+icon+'</span><b>'+title+'</b><strong>'+count+'</strong>'+'<em>'+(kind==='collected'?money(insuranceTotal(l)):repairTotalLabel(kind==='in'?i:o))+'</em>'+(kind==='collected'?'':'<small>'+repairCaption(kind==='in'?i:o)+'</small>')+'<small>'+caption+'</small><span class="v251-card-link">View list →</span></button>').join('')+'</div></section>';
}
window.v251OpenInsurancePulse=async function(kind){
 if(role()!=='Manager'||!['in','out','collected'].includes(kind))return;
 if(!await confirmRead()||role()!=='Manager')return;
 const dateKey=kind==='out'?'deliveredAt':'createdAt',a=insuranceRows(kind).slice().sort((x,y)=>kind==='collected'?y.insuranceLpo.receivedDate.localeCompare(x.insuranceLpo.receivedDate):Number(y[dateKey]||0)-Number(x[dateKey]||0));
 const title=kind==='in'?'Insurance In':kind==='out'?'Insurance Out':'LPO Collected';
 const dateText=j=>kind==='collected'?j.insuranceLpo.receivedDate.split('-').reverse().join('-'):new Date(Number(j[dateKey])).toLocaleDateString('en-GB',{timeZone:'Asia/Muscat'}).replaceAll('/','-');
 const body=a.length?a.map((j,n)=>'<div class="v251-cash-row v251-insurance-row"><b class="v251-no">'+(n+1)+'</b><div><strong>JC '+esc(j.no)+' · '+esc(j.reg||'Not recorded')+'</strong><small>'+esc([j.vehicle,j.year].filter(Boolean).join(' '))+'</small><small>'+esc(j.insuranceCompany||'Insurance company not recorded')+' · '+esc(dateText(j))+'</small>'+(j.claimNo?'<small>Claim: '+esc(j.claimNo)+'</small>':'')+'</div>'+'<b>'+(kind==='collected'?money(j.insuranceLpo.amount):'<small>Approx. repair value</small>'+(approximateRepairValue(j)===null?'Pending':money(approximateRepairValue(j))))+'</b>'+'</div>').join(''):'<p class="muted">No '+esc(title.toLowerCase())+' records for '+esc(month().label)+'.</p>';
 openModal('<div class="section-title"><div><h2>'+title+'</h2><p class="muted">'+esc(month().label)+(kind==='collected'?' · LPO documents received; not cash payment receipts':' · '+repairCaption(a))+'</p></div><button class="secondary" onclick="closeModal()">Close</button></div><div class="v251-cash-summary"><b>'+a.length+(kind==='collected'?' LPOs':' Vehicles')+'</b>'+'<strong>'+(kind==='collected'?money(insuranceTotal(a)):repairTotalLabel(a))+'</strong>'+'</div>'+body);
};
function html(){
 const i=rows('in'),o=rows('out'),label=month().label;
 const p=pendingAll();
 return '<section class="v251-cash-pulse" data-v251-cash-pulse><div class="v251-cash-title"><b>Cash Monthly Follow-up</b><small>'+esc(label)+'</small></div><div class="v251-cash-grid"><button class="v251-cash-circle in" onclick="v251OpenCashPulse(\'in\')"><span>↓</span><b>CASH IN</b><strong>'+i.length+'</strong><em>'+money(total(i))+'</em><small>THIS MONTH</small><span class="v251-card-link">View list →</span></button><button class="v251-cash-circle pending" onclick="v251OpenCashPendingAll()"><span>◷</span><b>CASH IN PENDING</b><strong>'+p.length+'</strong><em>'+money(outstandingTotal(p))+'</em><small>ALL MONTHS · NOT DELIVERED</small><span class="v251-card-link">View list →</span></button><button class="v251-cash-circle out" onclick="v251OpenCashPulse(\'out\')"><span>↑</span><b>CASH OUT</b><strong>'+o.length+'</strong><em>'+money(total(o,'out'))+'</em><small>THIS MONTH</small><span class="v251-card-link">View list →</span></button></div></section>';
}
function install(){
 if(!['Manager','Supervisor'].includes(role()))return;
 const root=document.getElementById(role()==='Manager'?'managerView':'supervisorView');if(!root||root.classList.contains('hidden'))return;
 const id=role()==='Manager'?'managerCashPulseSlot':'supervisorCashPulseSlot';let slot=root.querySelector('#'+id);
 if(!slot){slot=document.createElement('div');slot.id=id;slot.className='cash-pulse-slot';root.prepend(slot);}
 const header=root.querySelector(role()==='Manager'?'.v135-manager-header,.v111-manager-header':'.v143-header');
 if(header&&header.nextElementSibling!==slot)header.insertAdjacentElement('afterend',slot);
 const markup='<div class="v251-followup-layout">'+html()+(role()==='Manager'?insuranceHtml():'')+'</div>',old=slot.querySelector('[data-v251-cash-pulse]');
 if(!old||slot.__cashPulseMarkup!==markup){slot.innerHTML=markup;slot.__cashPulseMarkup=markup;}
}
async function confirmRead(){if(!window.zukaitCloud?.readLatest)return true;try{await window.zukaitCloud.readLatest();install();return ['Manager','Supervisor'].includes(role())}catch(e){const login=['invalid_session','NO_SESSION'].includes(e?.message);window.alert?.(login?'Your saved login is no longer valid. Please log in again.':'The server read failed ('+String(e?.message||'NETWORK')+'). Check your connection and try again. Your pending changes are preserved.');return false}}
window.v251OpenCashPendingAll=async function(){if(!['Manager','Supervisor'].includes(role()))return;if(!await confirmRead())return;const a=pendingAll().slice().sort((x,y)=>Number(y.createdAt||0)-Number(x.createdAt||0));const body=a.length?a.map((j,n)=>'<div class="v251-cash-row"><b class="v251-no">'+(n+1)+'</b><div><strong>JC '+esc(j.no)+' · '+esc(j.reg||'—')+'</strong><small>'+esc(j.vehicle||'—')+' · In '+new Date(Number(j.createdAt||0)).toLocaleDateString('en-GB',{timeZone:'Asia/Muscat'})+'</small>'+cashStatus(j)+'</div><b>'+money(j.amount)+'</b><button onclick="closeModal();zukaitOpenCashDetails(\''+esc(j.no)+'\')">Cash Details</button></div>').join(''):'<p class="muted">No undelivered Cash vehicles.</p>';openModal('<div class="section-title"><div><h2>Total Cash Jobs In · Not delivered</h2><p class="muted">All months · outstanding Cash vehicles</p></div><button class="secondary" onclick="closeModal()">Close</button></div><div class="v251-cash-summary"><b>'+a.length+' Vehicles</b><strong>'+money(total(a))+'</strong></div>'+body)};
window.v251OpenCashPulse=async function(kind){
 if(!['Manager','Supervisor'].includes(role()))return;
 if(!await confirmRead())return;
 const a=rows(kind),dateKey=kind==='out'?'deliveredAt':'createdAt',title=kind==='out'?'Cash Vehicle Out':'Cash Vehicle In',pending=pendingAll();
 const pendingSummary=kind==='in'?'<button class="v251-pending-total" onclick="v251OpenCashPendingAll()"><span>TOTAL CASH JOBS IN · NOT DELIVERED</span><b>'+pending.length+' Vehicles</b><strong>'+money(outstandingTotal(pending))+'</strong><small>All months · current cash amount expected when these vehicles are delivered</small></button>':'';
 const body=a.length?a.slice().sort((x,y)=>Number(y[dateKey]||0)-Number(x[dateKey]||0)).map((j,n)=>'<div class="v251-cash-row"><b class="v251-no">'+(n+1)+'</b><div><strong>JC '+esc(j.no)+' · '+esc(j.reg||'—')+'</strong><small>'+esc(j.vehicle||'—')+' · '+new Date(Number(j[dateKey]||0)).toLocaleDateString('en-GB',{timeZone:'Asia/Muscat'})+'</small>'+cashStatus(j)+'</div><b>'+money(amount(j,kind))+'</b><button onclick="closeModal();zukaitOpenCashDetails(\''+esc(j.no)+'\')">Cash Details</button></div>').join(''):'<p class="muted">No Cash vehicles in this section for '+esc(month().label)+'.</p>';
 openModal('<div class="section-title"><div><h2>'+title+'</h2><p class="muted">'+esc(month().label)+'</p></div><button class="secondary" onclick="closeModal()">Close</button></div>'+pendingSummary+'<div class="v251-cash-summary"><b>'+a.length+' Vehicles</b><strong>'+money(total(a,kind))+'</strong></div>'+body);
};
const s=document.createElement('style');s.id='v251CashPulseStyle';s.textContent='.v251-job-status{display:inline-block;margin-top:5px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800}.v251-job-status.open{background:#fff4ce;color:#795400}.v251-job-status.delivered{background:#dcfce7;color:#166534}.v251-cash-pulse{margin:10px 0 12px;padding:12px;border:1px solid #dbe5ef;border-radius:18px;background:linear-gradient(145deg,#fff,#f8fbff);box-shadow:0 4px 12px #17324b12}.v251-cash-title{display:flex;justify-content:space-between;align-items:end;gap:8px;margin-bottom:9px;color:#233b55}.v251-cash-title b{font-size:14px}.v251-cash-title small{font-size:9px;color:#66788d}.v251-cash-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;max-width:760px;margin:auto}.v251-cash-circle{box-sizing:border-box;min-width:0;min-height:0;text-align:center;aspect-ratio:1/1;max-width:245px;width:100%;justify-self:center;border-radius:50%!important;border:1.5px solid!important;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:16px!important;margin:0!important;box-shadow:inset 0 3px 2px #fff,0 6px 0 var(--edge),0 12px 20px #17324b20!important}.v251-cash-circle.in{--edge:#79b9e7;background:linear-gradient(145deg,#fff,#dff2ff)!important;border-color:#8ac4eb!important;color:#155884!important}.v251-cash-circle.pending{--edge:#bd720b;background:radial-gradient(circle at 30% 20%,#fff9e8 0%,#ffda83 45%,#f3b545 100%)!important;border-color:#d18b22!important;color:#583300!important;box-shadow:inset 0 3px 3px #fff8dc,0 6px 0 var(--edge),0 12px 20px #9b59002b!important}.v251-cash-circle.pending span{color:#985600}.v251-cash-circle.pending em{color:#583300}.v251-cash-circle.pending small{opacity:1;color:#704400}.v251-cash-circle.out{--edge:#77c6a3;background:linear-gradient(145deg,#fff,#dcf7e9)!important;border-color:#8bd0b0!important;color:#176b4b!important}.v251-cash-circle span{font-size:21px}.v251-cash-circle b{font-size:11px;letter-spacing:.04em}.v251-cash-circle strong{font-size:30px;line-height:1}.v251-cash-circle em{font-size:13px;font-style:normal;font-weight:950}.v251-cash-circle small{font-size:8px;font-weight:850;opacity:.8}.v251-cash-pending-card{width:100%;max-width:560px;margin:16px auto 2px!important;padding:12px 14px!important;display:grid!important;grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;gap:3px 10px;text-align:left;border:1px solid #e4bb59!important;border-radius:16px!important;background:linear-gradient(145deg,#fffdf6,#ffefbd)!important;color:#6d4a00!important;box-shadow:inset 0 2px 1px #fff,0 5px 0 #d9a93d,0 10px 18px #6f4c001b!important}.v251-pending-icon{grid-row:1/3;width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:#fff7dc;border:1px solid #ebc76f;font-size:21px}.v251-cash-pending-card b{display:block;font-size:11px;letter-spacing:.025em}.v251-cash-pending-card small{display:block;margin-top:2px;font-size:9px;opacity:.8}.v251-cash-pending-card>strong{grid-column:3;grid-row:1;font-size:13px;text-align:right}.v251-cash-pending-card>em{grid-column:3;grid-row:2;font-size:17px;font-style:normal;font-weight:950;text-align:right}.v251-pending-open{grid-column:2;grid-row:2;align-self:end;font-size:9px;font-weight:900;color:#8b6200}.v251-pending-total{width:100%;display:grid;grid-template-columns:1fr auto;gap:3px 10px;text-align:left;margin:0 0 10px;padding:12px 14px!important;border:1px solid #e7c46a!important;border-radius:13px!important;background:linear-gradient(145deg,#fffaf0,#fff1c7)!important;color:#6f4c00!important;box-shadow:0 4px 10px #6f4c0015!important}.v251-pending-total span{font-size:10px;font-weight:900}.v251-pending-total b{font-size:15px}.v251-pending-total strong{grid-column:2;grid-row:1/3;align-self:center;font-size:18px}.v251-pending-total small{grid-column:1/3;font-size:9px;opacity:.8}.v251-cash-summary{display:flex;justify-content:space-between;gap:10px;padding:10px;margin-bottom:8px;border-radius:11px;background:#eef5fb;color:#244867}.v251-cash-row{display:grid;grid-template-columns:25px minmax(0,1fr) auto auto;align-items:center;gap:7px;padding:7px;margin:5px 0;border:1px solid #dfe7ef;border-radius:10px;background:#fff}.v251-cash-row small{display:block;margin-top:2px;color:#64748b}.v251-cash-row button{min-height:34px;padding:5px 8px;background:#e8f3ff;color:#1763a2;border:1px solid #bcd7ee;border-radius:8px;font-weight:900}.v251-no{display:grid;place-items:center;width:23px;height:23px;border-radius:7px;background:#eef4fa;color:#315a7c}@media(max-width:520px){.v251-cash-pulse{padding:8px}.v251-cash-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.v251-cash-circle{padding:5px!important}.v251-cash-circle span{font-size:16px}.v251-cash-circle b{font-size:7.5px;line-height:1.05}.v251-cash-circle strong{font-size:20px}.v251-cash-circle em{font-size:8px}.v251-cash-circle small{font-size:5.8px;line-height:1.05}.v251-cash-title small{max-width:50%;text-align:right}.v251-cash-row{grid-template-columns:22px minmax(0,1fr) auto}.v251-cash-row>button{grid-column:2/4;width:100%;margin:0}.v251-cash-row>b:nth-of-type(2){font-size:10px}}';s.textContent+=`
.v251-followup-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin:12px 0}
.v251-followup-layout .v251-cash-pulse{display:flex;flex-direction:column;margin:0;padding:16px;border-radius:20px;background:linear-gradient(135deg,#ffffffed,#f3f7ffed);box-shadow:inset 0 1px 0 #fff,0 8px 24px #17324b0d}
.v251-followup-layout .v251-cash-title{align-items:center;flex-wrap:wrap;margin-bottom:14px}.v251-followup-layout .v251-cash-title b{font-size:16px}.v251-followup-layout .v251-cash-title small{font-size:12px;text-align:left;max-width:none}
.v251-followup-layout .v251-cash-grid{flex:1;width:100%;max-width:none;gap:10px;align-items:stretch}
.v251-followup-layout .v251-cash-circle,.v251-followup-card{position:relative;box-sizing:border-box;display:flex!important;flex-direction:column;align-items:flex-start;justify-content:flex-start;text-align:left;gap:7px;width:100%;max-width:none;min-width:0;min-height:168px;aspect-ratio:auto;border-radius:16px!important;padding:14px!important;white-space:normal;box-shadow:inset 0 1px 0 #ffffffb3,0 4px 10px #17324b10!important;cursor:pointer;transition:transform .15s,box-shadow .15s}
.v251-followup-layout .v251-cash-circle:hover,.v251-followup-card:hover{transform:translateY(-2px)}
.v251-followup-layout button:focus-visible{outline:3px solid #155eef;outline-offset:3px}
.v251-followup-layout .v251-cash-circle span,.v251-followup-icon{font-size:18px;line-height:1;display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#ffffffb0}
.v251-followup-layout .v251-cash-circle b,.v251-followup-card b{font-size:12px;letter-spacing:.02em;line-height:1.35}
.v251-followup-layout .v251-cash-circle strong,.v251-followup-card strong{font-size:30px;line-height:1.1;font-weight:850}
.v251-followup-layout .v251-cash-circle em,.v251-followup-card em{font-size:13px;font-style:normal;font-weight:800;overflow-wrap:anywhere}
.v251-followup-layout .v251-cash-circle small,.v251-followup-card small{font-size:11px;line-height:1.4;opacity:1;letter-spacing:0}
.v251-followup-card.insurance-in{background:linear-gradient(145deg,#f0f3ff,#dfe7ff)!important;color:#303f8e!important;border:1px solid #bdc9f5!important}
.v251-followup-card.insurance-out{background:linear-gradient(145deg,#edfffc,#ccf3ee)!important;color:#115e59!important;border:1px solid #95d9cd!important}
.v251-followup-card.insurance-collected{background:linear-gradient(145deg,#faf3ff,#eddcfc)!important;color:#63308b!important;border:1px solid #d7b8ed!important}
.v251-followup-layout .v251-cash-circle .v251-card-link,.v251-card-link{display:block;width:auto;height:auto;background:none;border-radius:0;line-height:1.4;font-size:11px;font-weight:800;margin-top:auto;padding-top:3px}
.v251-insurance-row{grid-template-columns:25px minmax(0,1fr) auto}.v251-insurance-row strong,.v251-insurance-row small{overflow-wrap:anywhere}
@media(min-width:1100px){.v251-followup-layout:has(.v251-insurance-pulse){grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:520px){.v251-followup-layout .v251-cash-pulse{padding:12px}.v251-followup-layout .v251-cash-grid{gap:7px}.v251-followup-layout .v251-cash-circle,.v251-followup-card{padding:10px!important;min-height:167px}.v251-followup-layout .v251-cash-circle b,.v251-followup-card b{font-size:11px}.v251-followup-layout .v251-cash-circle em,.v251-followup-card em{font-size:12px}.v251-followup-layout .v251-cash-circle small,.v251-followup-card small{font-size:10px}}
@media(max-width:359px){.v251-followup-layout .v251-cash-grid{grid-template-columns:1fr}.v251-followup-layout .v251-cash-circle,.v251-followup-card{min-height:0}}
@media(prefers-reduced-motion:reduce){.v251-followup-layout button{transition:none;transform:none}}

/* Alternate report-card pattern: solid surfaces, navy headers and colour rails. */
.v251-followup-layout .v251-cash-pulse{padding:0;overflow:hidden;border:1px solid #dce4ee;background:#fff;box-shadow:0 6px 20px #162c4610;border-radius:18px}
.v251-followup-layout .v251-cash-title{padding:16px 18px;margin:0;background:#172c46;color:#fff;min-height:68px;align-items:center}
.v251-followup-layout .v251-cash-title b{font-size:16px;letter-spacing:.01em}.v251-followup-layout .v251-cash-title small{color:#cbd8e8;font-size:11px}
.v251-followup-layout .v251-insurance-pulse .v251-cash-title{background:#213a50}
.v251-followup-layout .v251-cash-grid{padding:14px;background:#f5f7fb;gap:10px}
.v251-followup-layout .v251-cash-circle,.v251-followup-layout .v251-followup-card{background:#fff!important;color:#21324a!important;border:1px solid #dce4ef!important;border-left:4px solid var(--card-accent)!important;border-radius:12px!important;box-shadow:0 2px 5px #162c4608!important;padding:14px 12px!important;gap:9px}
.v251-followup-layout .in{--card-accent:#2674bd;--card-tint:#eaf3fc}.v251-followup-layout .pending{--card-accent:#b77909;--card-tint:#fff4db}.v251-followup-layout .out{--card-accent:#18836a;--card-tint:#e8f6ef}
.v251-followup-layout .insurance-in{--card-accent:#5362bd;--card-tint:#eef0fe}.v251-followup-layout .insurance-out{--card-accent:#14818b;--card-tint:#e7f6f7}.v251-followup-layout .insurance-collected{--card-accent:#8852ad;--card-tint:#f5edfb}
.v251-followup-layout .v251-cash-circle span:first-child,.v251-followup-layout .v251-followup-icon{background:var(--card-tint);color:var(--card-accent);border-radius:8px;font-size:20px;font-weight:800}
.v251-followup-layout .v251-cash-circle strong,.v251-followup-layout .v251-followup-card strong{color:#172c46;font-size:34px;letter-spacing:-.03em}
.v251-followup-layout .v251-cash-circle em,.v251-followup-layout .v251-followup-card em{color:#172c46;font-size:14px;padding-top:8px;border-top:1px solid #e4eaf2;width:100%}
.v251-followup-layout .v251-cash-circle small,.v251-followup-layout .v251-followup-card small{color:#56677d;font-weight:500}
.v251-followup-layout .v251-cash-circle .v251-card-link,.v251-followup-layout .v251-card-link{color:var(--card-accent);padding-top:8px}
@media(max-width:520px){.v251-followup-layout .v251-cash-title{padding:14px}.v251-followup-layout .v251-cash-grid{padding:10px;gap:7px}.v251-followup-layout .v251-cash-circle,.v251-followup-layout .v251-followup-card{padding:10px 8px!important;gap:7px}.v251-followup-layout .v251-cash-circle em,.v251-followup-layout .v251-followup-card em{font-size:12px}}

/* Phone layout: wide, compact rows keep counts and OMR amounts legible. */
@media(max-width:599px){
 .v251-followup-layout .v251-cash-grid{grid-template-columns:minmax(0,1fr);gap:9px}
 .v251-followup-layout .v251-cash-circle,.v251-followup-layout .v251-followup-card{display:grid!important;grid-template-columns:30px minmax(0,1fr) auto;min-height:100px;padding:13px!important;gap:4px 10px;align-items:center}
 .v251-followup-layout .v251-cash-circle>span:first-child,.v251-followup-layout .v251-followup-card>.v251-followup-icon{grid-column:1;grid-row:1/3}
 .v251-followup-layout .v251-cash-circle>b,.v251-followup-layout .v251-followup-card>b{grid-column:2;grid-row:1;font-size:12px}
 .v251-followup-layout .v251-cash-circle>strong,.v251-followup-layout .v251-followup-card>strong{grid-column:3;grid-row:1/3;font-size:30px;text-align:right}
 .v251-followup-layout .v251-cash-circle>em,.v251-followup-layout .v251-followup-card>em{grid-column:2;grid-row:2;border:0;padding:0;font-size:15px;overflow-wrap:anywhere}
 .v251-followup-layout .v251-cash-circle>small,.v251-followup-layout .v251-followup-card>small{grid-column:2;font-size:12px;line-height:1.4}
 .v251-followup-layout .v251-cash-circle>.v251-card-link,.v251-followup-layout .v251-followup-card>.v251-card-link{grid-column:3;grid-row:3/5;font-size:11px;align-self:end;white-space:nowrap}
 .v251-insurance-row{grid-template-columns:23px minmax(0,1fr);padding:12px;gap:6px 10px}
 .v251-insurance-row>b:nth-of-type(2){grid-column:2;font-size:14px;text-align:left}.v251-insurance-row small{font-size:13px}
}
`;document.head.appendChild(s);
let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;install()},0)}new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});['zukait:state-synced','zukait:state-updated','zukait:cloud-sync','online','focus'].forEach(n=>window.addEventListener(n,schedule));document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});schedule();setInterval(install,2000);
window.v251CashPulse={install,html,rows,total,pendingAll,insuranceRows,insuranceHtml,insuranceTotal,approximateRepairValue,approximateRepairSummary};
})();
