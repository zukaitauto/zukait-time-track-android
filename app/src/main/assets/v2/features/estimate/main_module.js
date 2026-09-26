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
  .est-summary-line{display:flex;justify-content:space-between;gap:10px;padding:5px 2px}.est-summary-line.total{font-size:20px;font-weight:900;border-top:2px solid #cbd5e1;margin-top:5px;padding-top:9px}
  .est-bottom{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}.est-bottom button{margin:0!important;min-height:44px}
  .estimate-dashboard-card{border:1px solid #d8e5f1!important;background:linear-gradient(145deg,#fff,#eef6ff)!important;box-shadow:0 10px 22px #18314d12!important}
  .est-result{width:100%;margin:5px 0!important;text-align:left!important;background:#fff!important;color:#172033!important;border:1px solid #dce6ef!important;padding:11px!important}
  @media(max-width:560px){.est-fields,.est-grid2{grid-template-columns:1fr 1fr}.est-switches{grid-template-columns:1fr}.est-row{grid-template-columns:minmax(0,1fr) 92px 40px}.est-part-row{grid-template-columns:minmax(0,1fr) 58px 82px 40px}.est-bottom{grid-template-columns:1fr 1fr}.est-fields label{min-width:0}}
  @media(max-width:390px){.est-fields{grid-template-columns:1fr 1fr}.est-grid2{grid-template-columns:1fr 1fr}}
  `;document.head.appendChild(s);
}
function nav(back){
  return '<div class="row" style="margin-bottom:10px"><button class="blue" onclick="'+(back||'zukaitEstimate.openHome()')+'">← Back</button><button class="danger" onclick="closeModal()">✕ Close</button></div>';
}
function estimateCard(e){
  const t=totals(e);
  return '<button class="est-result" onclick="zukaitEstimate.openEditor(\''+esc(e.id)+'\')"><b>'+esc(e.estimateNo)+'</b> · '+esc(e.date||'')+
    '<br>'+esc(e.customerName||'')+' · '+esc(e.makeModel||'')+(e.year?' · '+esc(e.year):'')+
    '<br><span class="small">'+esc(e.registration||'')+' · '+esc(e.type||'LS')+' · '+(e.vatEnabled?'VAT 5%':'NO VAT')+' · OMR '+money(t.total)+'</span></button>';
}
function openHome(){
  if(!canUse())return alert('Supervisor or Manager access required.');
  ensureState();ensureStyle();
  const recent=state.estimates.slice().sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0)).slice(0,4);
  const html=nav('closeModal()')+'<div class="est-home"><h3 style="margin-top:0">🧾 Estimate</h3><div class="est-grid2">'+
    '<button class="est-action" onclick="zukaitEstimate.newEstimate()"><b>➕ New Estimate</b><small>LS or Parts + Labour</small></button>'+
    '<button class="est-action" onclick="zukaitEstimate.openFind()"><b>🔎 Find Estimate</b><small>Estimate / Reg / Mobile / Claim</small></button>'+
    '<button class="est-action" onclick="zukaitEstimate.openRecent()"><b>🕘 Recent Estimates</b><small>Latest saved estimates</small></button>'+
    '<button class="est-action" onclick="zukaitEstimate.openReports()"><b>📊 Reports</b><small>Simple estimate totals</small></button>'+
    '</div><h4>Recent</h4>'+(recent.length?recent.map(estimateCard).join(''):'<p class="muted">No estimates yet.</p>')+'</div>';
  openModal(html);
}
async function newEstimate(){
  if(!canUse())return;
  ensureState();
  if(!navigator.onLine||!window.zukaitCloud?.allocateEstimateNo){
    alert('Internet is required once to generate the official Zi-Qt estimate number.');return;
  }
  const clientKey=uid();let a;
  try{a=await window.zukaitCloud.allocateEstimateNo(clientKey)}catch(e){alert('Unable to generate Estimate No. Please check connection and try again.');return}
  const u=currentUser()||{},e={
    id:clientKey,estimateNo:String(a?.estimate_no||''),sequenceNo:Number(a?.sequence_no||0),date:localDate(),type:'LS',vatEnabled:true,vatRate:.05,
    customerName:'',mobile:'',makeModel:'',year:'',registration:'',vin:'',claimNo:'',jobCard:'',
    lsRows:[{id:uid(),description:'',amount:0}],labourRows:[{id:uid(),description:'',amount:0}],partRows:[{id:uid(),description:'',qty:1,unitPrice:0}],
    lsSpareParts:0,misc:0,status:'Draft',createdAt:Date.now(),createdBy:u.id||'',updatedAt:Date.now(),updatedBy:u.id||'',revision:0
  };
  if(!e.estimateNo)return alert('Estimate number allocation failed.');
  state.estimates.unshift(e);audit(e,'CREATE');saveState();openEditor(e.id);
}
function field(id,label,value,type='text',extra=''){
  return '<label>'+label+'<input id="'+id+'" type="'+type+'" value="'+esc(value||'')+'" '+extra+'></label>';
}
function lsRowsHtml(rows){
  return (rows||[]).map(r=>'<div class="est-row" data-est-ls-row="'+esc(r.id)+'"><input class="est-desc" placeholder="Description" value="'+esc(r.description||'')+'"><input class="est-amount" inputmode="decimal" placeholder="0.000" value="'+money(r.amount)+'" oninput="zukaitEstimate.recalc()"><button class="est-remove" onclick="zukaitEstimate.removeRow(this)">✕</button></div>').join('');
}
function labourRowsHtml(rows){
  return (rows||[]).map(r=>'<div class="est-row" data-est-lab-row="'+esc(r.id)+'"><input class="est-desc" placeholder="Labour description" value="'+esc(r.description||'')+'"><input class="est-amount" inputmode="decimal" placeholder="0.000" value="'+money(r.amount)+'" oninput="zukaitEstimate.recalc()"><button class="est-remove" onclick="zukaitEstimate.removeRow(this)">✕</button></div>').join('');
}
function partRowsHtml(rows){
  return (rows||[]).map(r=>'<div class="est-row est-part-row" data-est-part-row="'+esc(r.id)+'"><input class="est-desc" placeholder="Part description" value="'+esc(r.description||'')+'"><input class="est-qty" type="number" min="0.001" step="0.001" value="'+num(r.qty)+'" oninput="zukaitEstimate.recalc()"><input class="est-unit" inputmode="decimal" placeholder="0.000" value="'+money(r.unitPrice)+'" oninput="zukaitEstimate.recalc()"><button class="est-remove" onclick="zukaitEstimate.removeRow(this)">✕</button></div>').join('');
}
function openEditor(id){
  const e=findEstimate(id);if(!e)return alert('Estimate not found.');ensureStyle();
  const html=nav('zukaitEstimate.openHome()')+
  '<div class="est-home"><div class="section-title"><div><h3 style="margin:0">'+esc(e.estimateNo)+'</h3><span class="small muted">Create / edit estimate</span></div></div>'+
  '<div class="est-switches"><div><b class="small">Estimate Type</b><div class="est-switch"><button id="estTypeLS" onclick="zukaitEstimate.setType(\'LS\')">LS</button><button id="estTypePL" onclick="zukaitEstimate.setType(\'PL\')">PL</button></div></div>'+
  '<div><b class="small">Tax</b><div class="est-switch"><button id="estVatYes" onclick="zukaitEstimate.setVat(true)">VAT 5%</button><button id="estVatNo" onclick="zukaitEstimate.setVat(false)">NO VAT</button></div></div></div>'+
  '<div class="est-section"><div class="row"><input id="estJobLookup" placeholder="Optional: search JC / Registration" style="flex:1"><button class="blue" onclick="zukaitEstimate.loadJob()">Load JC</button></div>'+
  '<div class="est-fields">'+
    field('estDate','Date',e.date,'date')+
    field('estName','Name',e.customerName)+
    field('estMobile','Mobile Number',e.mobile,'tel')+
    field('estMakeModel','Make & Model',e.makeModel)+
    field('estYear','Year',e.year,'number','min="1900" max="2100"')+
    field('estReg','Registration No.',e.registration)+
    field('estVin','VIN No.',e.vin)+
    field('estClaim','Claim No.',e.claimNo)+
    field('estJobCard','Job Card No. (Optional)',e.jobCard)+
  '</div></div>'+
  '<div id="estLsSection" class="est-section"><h4>LS — Lumpsum</h4><div class="small muted">Description + amount</div><div id="estLsRows">'+lsRowsHtml(e.lsRows)+'</div><button class="est-add" onclick="zukaitEstimate.addRow(\'LS\')">+ Add Row</button>'+
  '<div class="est-fields" style="margin-top:10px">'+field('estLsParts','Spare Parts',money(e.lsSpareParts),'text','inputmode="decimal" oninput="zukaitEstimate.recalc()"')+field('estMiscLs','Misc',money(e.misc),'text','inputmode="decimal" oninput="zukaitEstimate.recalc()"')+'</div></div>'+
  '<div id="estPlSection" class="est-section"><h4>LABOUR</h4><div id="estLabRows">'+labourRowsHtml(e.labourRows)+'</div><button class="est-add" onclick="zukaitEstimate.addRow(\'LAB\')">+ Add Labour</button>'+
  '<h4 style="margin-top:15px">SPARE PARTS</h4><div class="small muted">Part · Qty · Unit Price</div><div id="estPartRows">'+partRowsHtml(e.partRows)+'</div><button class="est-add" onclick="zukaitEstimate.addRow(\'PART\')">+ Add Part</button>'+
  '<div style="margin-top:10px">'+field('estMiscPl','Misc',money(e.misc),'text','inputmode="decimal" oninput="zukaitEstimate.recalc()"')+'</div></div>'+
  '<div class="est-section est-summary"><div id="estSummary"></div></div>'+
  '<div class="est-bottom"><button class="green" onclick="zukaitEstimate.saveCurrent(\''+esc(e.id)+'\')">💾 Save</button><button class="blue" onclick="zukaitEstimate.preview(\''+esc(e.id)+'\')">👁 Preview</button><button class="blue" onclick="zukaitEstimate.printEstimate(\''+esc(e.id)+'\')">🖨 Print</button><button class="purple" onclick="zukaitEstimate.pdfEstimate(\''+esc(e.id)+'\')">PDF</button><button class="green" onclick="zukaitEstimate.whatsApp(\''+esc(e.id)+'\')">WhatsApp</button><button class="secondary" onclick="zukaitEstimate.shareEstimate(\''+esc(e.id)+'\')">↗ Share</button></div></div>';
  openModal(html);
  window.__zukaitEstimateCurrent=id;
  requestAnimationFrame(()=>{setType(e.type||'LS',false);setVat(e.vatEnabled!==false,false);recalc()});
}
function setType(t,doRecalc=true){
  const e=findEstimate(window.__zukaitEstimateCurrent);t=t==='PL'?'PL':'LS';if(e)e.type=t;
  document.getElementById('estLsSection')?.classList.toggle('hidden',t!=='LS');
  document.getElementById('estPlSection')?.classList.toggle('hidden',t!=='PL');
  document.getElementById('estTypeLS')?.classList.toggle('active',t==='LS');
  document.getElementById('estTypePL')?.classList.toggle('active',t==='PL');
  if(doRecalc)recalc();
}
function setVat(v,doRecalc=true){
  const e=findEstimate(window.__zukaitEstimateCurrent);if(e)e.vatEnabled=!!v;
  document.getElementById('estVatYes')?.classList.toggle('active',!!v);
  document.getElementById('estVatNo')?.classList.toggle('active',!v);
  if(doRecalc)recalc();
}
function addRow(kind){
  const id=uid();let box,html='';
  if(kind==='LS'){box=document.getElementById('estLsRows');html=lsRowsHtml([{id,description:'',amount:0}])}
  if(kind==='LAB'){box=document.getElementById('estLabRows');html=labourRowsHtml([{id,description:'',amount:0}])}
  if(kind==='PART'){box=document.getElementById('estPartRows');html=partRowsHtml([{id,description:'',qty:1,unitPrice:0}])}
  if(box)box.insertAdjacentHTML('beforeend',html);recalc();
}
function removeRow(btn){const row=btn?.closest?.('[data-est-ls-row],[data-est-lab-row],[data-est-part-row]');if(row)row.remove();recalc()}
function rowsFromDom(sel,kind){
  return [...document.querySelectorAll(sel)].map(r=>{
    if(kind==='part')return {id:r.getAttribute('data-est-part-row')||uid(),description:r.querySelector('.est-desc')?.value?.trim()||'',qty:num(r.querySelector('.est-qty')?.value)||1,unitPrice:num(r.querySelector('.est-unit')?.value)};
    return {id:r.getAttribute(kind==='ls'?'data-est-ls-row':'data-est-lab-row')||uid(),description:r.querySelector('.est-desc')?.value?.trim()||'',amount:num(r.querySelector('.est-amount')?.value)};
  });
}
function draftFromDom(e){
  return Object.assign({},e,{
    type:document.getElementById('estTypePL')?.classList.contains('active')?'PL':'LS',
    vatEnabled:document.getElementById('estVatYes')?.classList.contains('active'),
    date:document.getElementById('estDate')?.value||localDate(),
    customerName:document.getElementById('estName')?.value?.trim()||'',
    mobile:document.getElementById('estMobile')?.value?.trim()||'',
    makeModel:document.getElementById('estMakeModel')?.value?.trim()||'',
    year:document.getElementById('estYear')?.value?.trim()||'',
    registration:document.getElementById('estReg')?.value?.trim().toUpperCase()||'',
    vin:document.getElementById('estVin')?.value?.trim().toUpperCase()||'',
    claimNo:document.getElementById('estClaim')?.value?.trim()||'',
    jobCard:document.getElementById('estJobCard')?.value?.trim().toUpperCase()||'',
    lsRows:rowsFromDom('[data-est-ls-row]','ls'),
    labourRows:rowsFromDom('[data-est-lab-row]','lab'),
    partRows:rowsFromDom('[data-est-part-row]','part'),
    lsSpareParts:num(document.getElementById('estLsParts')?.value),
    misc:num((document.getElementById('estTypePL')?.classList.contains('active')?document.getElementById('estMiscPl'):document.getElementById('estMiscLs'))?.value)
  });
}
function recalc(){
  const e=findEstimate(window.__zukaitEstimateCurrent);if(!e)return;
  const d=draftFromDom(e),t=totals(d),box=document.getElementById('estSummary');if(!box)return;
  const lines=d.type==='LS'
    ?[['Total Labour / Lumpsum',t.labour],['Spare Parts',t.parts],['Misc',t.misc]]
    :[['Total Labour',t.labour],['Total Parts',t.parts],['Misc',t.misc]];
  box.innerHTML=lines.map(x=>'<div class="est-summary-line"><span>'+x[0]+'</span><b>OMR '+money(x[1])+'</b></div>').join('')+
    (d.vatEnabled?'<div class="est-summary-line"><span>VAT 5%</span><b>OMR '+money(t.vat)+'</b></div>':'')+
    '<div class="est-summary-line total"><span>TOTAL</span><span>OMR '+money(t.total)+'</span></div>';
}
function saveCurrent(id){
  const e=findEstimate(id);if(!e)return;
  const before=totals(e).total,d=draftFromDom(e),u=currentUser()||{};
  Object.assign(e,d,{updatedAt:Date.now(),updatedBy:u.id||'',status:'Saved',revision:Number(e.revision||0)+1});
  audit(e,'EDIT',before);saveState();recalc();alert(e.estimateNo+' saved.');
}
function loadJob(){
  const q=document.getElementById('estJobLookup')?.value||document.getElementById('estJobCard')?.value||document.getElementById('estReg')?.value||'';
  const j=jobByQuery(q);if(!j)return alert('Job Card / Registration not found. You can still enter all estimate details manually.');
  const put=(id,v)=>{const x=document.getElementById(id);if(x&&v!=null&&String(v)!=='')x.value=String(v)};
  put('estJobCard',j.no);put('estReg',j.reg||j.registration);put('estMakeModel',[j.make||j.brand,j.model||j.vehicle].filter(Boolean).join(' ').trim()||j.vehicle);put('estYear',j.year);put('estVin',j.vin||j.vinNo);put('estClaim',j.claimNo||j.claim);put('estName',j.customerName||j.name);put('estMobile',j.mobile||j.phone);
}
function openFind(){
  ensureState();ensureStyle();openModal(nav('zukaitEstimate.openHome()')+'<div class="est-home"><h3>🔎 Find Estimate</h3><input id="estFindInput" style="width:100%;box-sizing:border-box" placeholder="Zi-Qt / Registration / Mobile / Name / Claim" oninput="zukaitEstimate.renderFind()"><div id="estFindResults" style="margin-top:10px"></div></div>');renderFind();
}
function filtered(q){
  ensureState();q=String(q||'').trim().toLowerCase();const rows=state.estimates.slice().sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  if(!q)return rows;
  return rows.filter(e=>[e.estimateNo,e.customerName,e.mobile,e.makeModel,e.registration,e.vin,e.claimNo,e.jobCard].join(' ').toLowerCase().includes(q));
}
function renderFind(){const q=document.getElementById('estFindInput')?.value||'',rows=filtered(q).slice(0,100),el=document.getElementById('estFindResults');if(el)el.innerHTML=rows.length?rows.map(estimateCard).join(''):'<p class="muted">No matching estimate.</p>'}
function openRecent(){ensureState();const rows=state.estimates.slice().sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0)).slice(0,30);openModal(nav('zukaitEstimate.openHome()')+'<div class="est-home"><h3>🕘 Recent Estimates</h3>'+(rows.length?rows.map(estimateCard).join(''):'<p class="muted">No estimates yet.</p>')+'</div>')}
function openReports(){
  ensureState();const rows=state.estimates,t=rows.reduce((s,e)=>s+totals(e).total,0),ls=rows.filter(e=>e.type!=='PL').length,pl=rows.filter(e=>e.type==='PL').length;
  openModal(nav('zukaitEstimate.openHome()')+'<div class="est-home"><h3>📊 Estimate Report</h3><div class="est-grid2"><div class="notice"><b>Total Estimates</b><div class="stat">'+rows.length+'</div></div><div class="notice"><b>Total Quoted</b><div class="stat">OMR '+money(t)+'</div></div><div class="notice"><b>LS</b><div class="stat">'+ls+'</div></div><div class="notice"><b>PL</b><div class="stat">'+pl+'</div></div></div></div>');
}
function splitMoney(v){v=Math.round(num(v)*1000);return {ro:Math.floor(v/1000),bz:String(v%1000).padStart(3,'0')}}
function printable(e){
  const t=totals(e),vat=e.vatEnabled?'<tr><th>VAT 5%</th><td colspan="2">'+money(t.vat)+'</td></tr>':'';
  let body='';
  if(e.type==='PL'){
    body='<h3>LABOUR</h3><table><tr><th>No.</th><th>Description</th><th>Amount OMR</th></tr>'+((e.labourRows||[]).filter(x=>x.description||num(x.amount)).map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(x.description)+'</td><td>'+money(x.amount)+'</td></tr>').join('')||'<tr><td colspan="3">&nbsp;</td></tr>')+'</table>'+
    '<h3>SPARE PARTS</h3><table><tr><th>No.</th><th>Part Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr>'+((e.partRows||[]).filter(x=>x.description||num(x.unitPrice)).map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(x.description)+'</td><td>'+num(x.qty)+'</td><td>'+money(x.unitPrice)+'</td><td>'+money(num(x.qty)*num(x.unitPrice))+'</td></tr>').join('')||'<tr><td colspan="5">&nbsp;</td></tr>')+'</table>'+
    '<table class="totals"><tr><th>Total Labour</th><td>'+money(t.labour)+'</td></tr><tr><th>Total Parts</th><td>'+money(t.parts)+'</td></tr><tr><th>Misc</th><td>'+money(t.misc)+'</td></tr>'+ (e.vatEnabled?'<tr><th>VAT 5%</th><td>'+money(t.vat)+'</td></tr>':'') +'<tr class="grand"><th>GRAND TOTAL</th><td>'+money(t.total)+'</td></tr></table>';
  }else{
    const rows=(e.lsRows||[]).filter(x=>x.description||num(x.amount));
    body='<table><tr><th>Description</th><th>R.O.</th><th>Bz.</th></tr>'+((rows.length?rows:[{description:'',amount:0}]).map(x=>{const m=splitMoney(x.amount);return '<tr><td>'+esc(x.description)+'</td><td>'+m.ro+'</td><td>'+m.bz+'</td></tr>'}).join(''))+'</table>'+
    '<table class="totals"><tr><th>Total Labour / Lumpsum</th><td colspan="2">'+money(t.labour)+'</td></tr><tr><th>Spare Parts</th><td colspan="2">'+money(t.parts)+'</td></tr><tr><th>Misc</th><td colspan="2">'+money(t.misc)+'</td></tr>'+vat+'<tr class="grand"><th>TOTAL</th><td colspan="2">'+money(t.total)+'</td></tr></table>';
  }
  return '<div class="estimate-print"><div class="head"><h2>ZUKAIT INTERNATIONAL LLC</h2><h1>REPAIR ESTIMATE</h1><div><b>Estimate No.:</b> '+esc(e.estimateNo)+' &nbsp; <b>Date:</b> '+esc(e.date)+'</div></div>'+
  '<table class="details"><tr><th>Name</th><td>'+esc(e.customerName)+'</td><th>Mobile</th><td>'+esc(e.mobile)+'</td></tr><tr><th>Make & Model</th><td>'+esc(e.makeModel)+'</td><th>Year</th><td>'+esc(e.year)+'</td></tr><tr><th>Registration</th><td>'+esc(e.registration)+'</td><th>VIN</th><td>'+esc(e.vin)+'</td></tr><tr><th>Claim No.</th><td>'+esc(e.claimNo)+'</td><th>Job Card</th><td>'+esc(e.jobCard||'')+'</td></tr></table>'+
  body+'<div class="valid">Estimate valid for 15 days.</div><div class="sign"><span>Manager</span><span>Foreman</span><span>Prepared By: '+esc((typeof user==='function'?user(e.createdBy)?.name:e.createdBy)||e.createdBy||'')+'</span></div></div>';
}
function printDocument(e,autoPrint=true){
  const w=window.open('','_blank');if(!w)return alert('Print window blocked.');
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(e.estimateNo)+'</title><style>body{font-family:Arial,sans-serif;padding:18px;color:#111}.head{text-align:center}.head h2,.head h1{margin:3px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #555;padding:7px;text-align:left}.details th{width:16%}.totals{margin-left:auto;width:54%}.totals th{width:70%}.grand{font-size:17px;font-weight:bold}.valid{margin-top:22px;font-weight:bold}.sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:38px;text-align:center}.sign span{border-top:1px solid #555;padding-top:7px}@media print{body{padding:0}}</style></head><body>'+printable(e)+'</body></html>');
  w.document.close();w.focus();if(autoPrint)setTimeout(()=>w.print(),200);
}
function preview(id){const e=findEstimate(id);if(!e)return;openModal(nav('zukaitEstimate.openEditor(\''+esc(id)+'\')')+'<div style="background:#fff;padding:12px;border-radius:12px;overflow:auto">'+printable(e)+'</div>')}
function printEstimate(id){const e=findEstimate(id);if(e)printDocument(e,true)}
function pdfEstimate(id){const e=findEstimate(id);if(!e)return;alert('Choose “Save as PDF” in the print window.');printDocument(e,true)}
function shareText(e){
  const t=totals(e);return ['ZUKAIT INTERNATIONAL LLC','Repair Estimate '+e.estimateNo,'Date: '+(e.date||''),'Customer: '+(e.customerName||''),'Vehicle: '+[e.makeModel,e.year].filter(Boolean).join(' '),'Registration: '+(e.registration||''),'Type: '+e.type+(e.vatEnabled?' · VAT 5%':' · No VAT'),'Total: OMR '+money(t.total)].join('\n')
}
function whatsApp(id){const e=findEstimate(id);if(!e)return;const url='https://wa.me/?text='+encodeURIComponent(shareText(e));try{const w=window.open(url,'_blank');if(w)return}catch(_){}window.location.href=url}
async function shareEstimate(id){const e=findEstimate(id);if(!e)return;const text=shareText(e);try{if(navigator.share){await navigator.share({title:'Estimate '+e.estimateNo,text});return}}catch(x){if(x?.name==='AbortError')return}try{await navigator.clipboard.writeText(text);alert('Estimate summary copied for sharing.')}catch(_){alert('Share is unavailable on this device.')}}
function ensureDashboardCards(){
  if(!canUse())return;ensureStyle();
  const r=role();
  if(r==='Supervisor'){
    const root=document.getElementById('supervisorView');if(!root||root.classList.contains('hidden'))return;
    const existing=[...root.querySelectorAll('[data-estimate-card="1"]')];existing.slice(1).forEach(x=>x.remove());if(existing[0])return;
    const card=document.createElement('div');card.className='card clickable compact-control estimate-dashboard-card';card.setAttribute('data-estimate-card','1');card.onclick=openHome;card.innerHTML='<div class="section-title"><h3>🧾 Estimate</h3><span class="pill">LS / PL</span></div><div class="small muted">Create, find, edit, print, PDF and WhatsApp estimates.</div>';
    const assigned=[...root.querySelectorAll('.card')].find(x=>/Assigned Job Cards/i.test(x.textContent||''));if(assigned)root.insertBefore(card,assigned);else root.appendChild(card);
  }
  if(r==='Manager'){
    const root=document.getElementById('managerView');if(!root||root.classList.contains('hidden'))return;
    const existing=[...root.querySelectorAll('[data-estimate-card="1"]')];existing.slice(1).forEach(x=>x.remove());if(existing[0])return;
    const grid=root.querySelector('.v67-control-grid,.v66-control-grid,.v65-control-grid,.manager-actions');
    if(grid){
      const b=document.createElement('button');b.type='button';b.setAttribute('data-estimate-card','1');b.className=grid.matches('.v67-control-grid,.v66-control-grid,.v65-control-grid')?'v67-feature estimate-dashboard-card':'manager-action manager-blue estimate-dashboard-card';b.onclick=openHome;b.innerHTML='<div><span>🧾 ESTIMATE</span><b>›</b><small>LS / PL · VAT / No VAT</small></div>';
      const sp=[...grid.children].find(x=>/SPARE\s*PARTS/i.test(x.textContent||''));if(sp&&sp.nextSibling)grid.insertBefore(b,sp.nextSibling);else grid.appendChild(b);
    }else{
      const card=document.createElement('div');card.className='card clickable estimate-dashboard-card';card.setAttribute('data-estimate-card','1');card.onclick=openHome;card.innerHTML='<h3>🧾 Estimate</h3><div class="small muted">LS / PL · VAT / No VAT</div>';root.appendChild(card);
    }
  }
}
function wrapRender(name){
  const fn=window[name];if(typeof fn!=='function'||fn.__estimateWrapped)return;
  const w=function(){const r=fn.apply(this,arguments);setTimeout(ensureDashboardCards,0);setTimeout(ensureDashboardCards,250);return r};w.__estimateWrapped=true;window[name]=w;
}
function boot(){ensureState();ensureStyle();wrapRender('renderSupervisor');wrapRender('renderManager');ensureDashboardCards()}
window.zukaitEstimate={openHome,newEstimate,openEditor,setType,setVat,addRow,removeRow,recalc,saveCurrent,loadJob,openFind,renderFind,openRecent,openReports,preview,printEstimate,pdfEstimate,whatsApp,shareEstimate,ensureDashboardCards,totals};
window.openEstimateModule=openHome;
document.addEventListener('DOMContentLoaded',boot);setTimeout(boot,0);setTimeout(boot,700);
new MutationObserver(()=>{wrapRender('renderSupervisor');wrapRender('renderManager');ensureDashboardCards()}).observe(document.documentElement,{childList:true,subtree:true});
})();