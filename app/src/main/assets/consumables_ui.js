(function(){
'use strict';
const C=()=>window.ZukaitConsumables;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const role=()=>typeof me==='undefined'?'':(me&&me.role)||'';
function consSyncInfo(){
 const online=typeof navigator==='undefined'||navigator.onLine!==false,c=window.zukaitCloud;
 if(!online)return {text:'OFFLINE',cls:'off'};
 if(c&&c.dirty)return {text:'SYNCING…',cls:'sync'};
 if(c&&c.ready&&!c.dirty)return {text:'SERVER SYNCED',cls:'ok'};
 return {text:'SYNCING…',cls:'sync'};
}
function consUpdateSync(){
 const el=document.getElementById('consSyncPill');if(!el)return;const x=consSyncInfo();el.textContent=x.text;el.className='cons-sync-pill '+x.cls;
}
const modal=(title,body)=>{
  if(typeof window.openModal!=='function')return;
  const x=consSyncInfo(),r=openModal('<div class="cons-page"><div class="section-title"><h2>'+title+'</h2><span id="consSyncPill" class="cons-sync-pill '+x.cls+'">'+x.text+'</span><button class="secondary" onclick="closeModal()">Close</button></div>'+body+'</div>');
  setTimeout(consUpdateSync,0);return r;
};
if(window.addEventListener){window.addEventListener('zukait-live-status',consUpdateSync);window.addEventListener('online',consUpdateSync);window.addEventListener('offline',consUpdateSync)}
function deptCard(title,icon,enabled,fn){
 return '<button class="cons-dept '+(enabled?'':'disabled')+'" '+(enabled?'onclick="'+fn+'"':'disabled')+'><span>'+icon+'</span><b>'+title+'</b><small>'+(enabled?'Open module':'Coming soon')+'</small></button>';
}
window.openConsumablesModule=function(){
 const r=role();if(r!=='Supervisor'&&r!=='Manager')return;
 modal('Consumables','<div class="cons-depts">'+deptCard('Painting Consumables','🎨',true,'openPaintingConsumables()')+deptCard('Denting Consumables','🛠️',false,"openConsumablesPlaceholder('Denting')")+deptCard('Mechanical Consumables','⚙️',false,"openConsumablesPlaceholder('Mechanical')")+'</div>');
};
window.openConsumablesPlaceholder=function(name){modal(esc(name)+' Consumables','<div class="notice">This department module is openable and isolated. Detailed workflow will be added after Painting Consumables is completed.</div>')};
function action(label,sub,fn,cls=''){return '<button class="cons-action '+cls+'" onclick="'+fn+'"><b>'+label+'</b><small>'+sub+'</small></button>'}
window.openPaintingConsumables=function(){
 if(!['Supervisor','Manager'].includes(role()))return;
 let base=action('Suggested / Issued Materials','Original material issue','openConsumablesEntry(\'issued\')','issued')+
 action('Actual Materials','Final quantity used for costing','openConsumablesEntry(\'actual\')','actual')+
 action('Additional Materials','Extra controlled material issue','openConsumablesEntry(\'additional\')','additional')+
 action('Search Material List','JC issued vs actual material','openConsumablesSearch()','search');
 let mgr=role()==='Manager'?action('Brands & Price','Material, brand, unit and price master','openConsumablesManager(\'master\')','manager')+
 action('Search Material','Find and correct material pricing','openConsumablesManager(\'material\')','manager')+
 action('Reports','Actual material cost and consumption reports','openConsumablesManager(\'reports\')','manager')+
 action('Edit History','Manager audit trail','openConsumablesManager(\'history\')','manager'):'';
 modal('🎨 Painting Consumables','<div class="cons-actions">'+base+mgr+'</div>');
};
let draft={type:null,jc:null,lines:[]};
function jcData(no){
 const n=String(no||'').trim().toUpperCase(),j=(state.jobs||[]).find(x=>String(x.no||'').toUpperCase()===n);
 if(!j||n==='ID001')return null;
 const aa=(state.assign||[]).filter(a=>a&&!a.cancelled&&a.job===j.no);
 const painters=aa.map(a=>(users||[]).find(u=>u.id===a.emp)).filter(u=>u&&u.department==='Painter');
 const painterAssignments=aa.filter(a=>(users||[]).some(u=>u.id===a.emp&&u.department==='Painter')).sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0));
 const supervisorId=painterAssignments.find(a=>a.assignedBy)?.assignedBy||aa.slice().sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0)).find(a=>a.assignedBy)?.assignedBy||'';
 const vehicle=[j.make,j.model,j.year].filter(Boolean).join(' ')||j.vehicle||'';
 return {job:j,vehicle,supervisorId,painters:[...new Map(painters.map(x=>[x.id,x])).values()]};
}
function consLineFingerprint(lines){
 return (lines||[]).map(l=>[String(l.materialId||''),String(l.brandId||''),Number(l.quantity||0).toFixed(6)].join('|')).sort().join('||');
}
function consRecentDuplicate(type,jc,lines){
 const c=C().ensureState(state),cut=Date.now()-15*60*1000,key=consLineFingerprint(lines);
 return c.issues.find(x=>x&&!x.voided&&x.type===type&&x.jobCard===jc&&(Number(x.createdAt)||0)>=cut&&consLineFingerprint(x.lines)===key)||null;
}
function consJobMatches(q){
 const x=String(q||'').trim().toLowerCase();
 return (state.jobs||[]).filter(j=>j&&String(j.no||'').toUpperCase()!=='ID001').filter(j=>{
   if(!x)return true;
   return [j.no,j.reg,j.registration,j.vehicle,j.make,j.model,j.year,j.modelYear].filter(Boolean).join(' ').toLowerCase().includes(x);
 }).sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0)).slice(0,10);
}
function consVehicleDetails(d,colour){
 if(!d)return '';
 const j=d.job||{},vehicle=d.vehicle||j.vehicle||[j.make,j.model].filter(Boolean).join(' ')||'—';
 const reg=j.reg||j.registration||'—',year=j.year||j.modelYear||'—',vin=j.vin||j.VIN||j.chassis||j.chassisNo||'',status=j.status||'Open';
 const clr=colour||j.colorCode||j.colourCode||'—';
 return '<div class="cons-vehicle-card"><div><small>JOB CARD</small><b>'+esc(j.no||'—')+'</b></div><div><small>VEHICLE</small><b>'+esc(vehicle)+'</b></div><div><small>REGISTRATION</small><b>'+esc(reg)+'</b></div><div><small>YEAR</small><b>'+esc(year)+'</b></div><div><small>COLOUR CODE</small><b>'+esc(clr)+'</b></div><div><small>STATUS</small><b>'+esc(status)+'</b></div>'+(vin?'<div class="wide"><small>VIN / CHASSIS</small><b>'+esc(vin)+'</b></div>':'')+'</div>';
}
function consJobResults(q,selectFn){
 const rows=consJobMatches(q);
 return rows.length?rows.map(j=>'<button type="button" class="cons-jc-result" onclick="'+selectFn+'(decodeURIComponent(\''+encodeURIComponent(String(j.no||''))+'\'))"><b>'+esc(j.no||'')+'</b><span>'+esc(j.reg||j.registration||'No Reg')+'</span><small>'+esc(j.vehicle||[j.make,j.model,j.year].filter(Boolean).join(' ')||'Vehicle')+'</small></button>').join(''):'<div class="cons-jc-empty">No matching Job Card.</div>';
}
function entryHeader(type){
 return '<div class="cons-jc-access"><label>Job Card Search<div class="cons-searchbar"><input id="consJc" placeholder="JC / Registration / Vehicle" autocomplete="off" oninput="consFindJC(\''+type+'\')"><button class="blue" type="button" onclick="consFindJC(\''+type+'\',true)">SEARCH</button></div></label><div id="consJcResults" class="cons-jc-results hidden"></div><div id="consVehicleDetails" class="cons-vehicle-sticky"></div></div><div class="cons-entry-grid cons-entry-grid-compact"><label>Vehicle Details<input id="consVehicle" readonly></label><label>Colour Code<input id="consColour" placeholder="Paint colour code"></label><label>Painter Name<select id="consPainter"><option value="">Select painter</option></select></label><label>Allotted Supervisor<input id="consSupervisor" readonly></label></div><div id="consJcNote" class="muted small"></div>';
}
function lineEditor(){
 const c=C().ensureState(state),m=c.materials.filter(x=>x.active!==false),b=c.brands.filter(x=>x.active!==false);
 return '<div class="cons-line-editor"><select id="consMaterial" onchange="consFilterBrands()"><option value="">Material</option>'+m.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+esc(x.unit)+'</option>').join('')+'</select><select id="consBrand"><option value="">Brand</option>'+b.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select><input id="consQty" type="number" min="0" step="any" placeholder="Quantity"><button class="blue" onclick="consAddLine()">ADD</button></div><div id="consDraftRows"></div>';
}
function consCompactEntryStyle(){
 if(document.getElementById('consCompactEntryStyle'))return;
 const s=document.createElement('style');s.id='consCompactEntryStyle';
 s.textContent='.cons-entry-grid-compact{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:10px 12px!important;align-items:end!important}.cons-entry-grid-compact label{min-width:0!important;margin:0!important}.cons-entry-grid-compact input,.cons-entry-grid-compact select{width:100%!important;box-sizing:border-box!important}.cons-line-editor{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:10px 12px!important;align-items:stretch!important}.cons-line-editor>*{min-width:0!important;width:100%!important;box-sizing:border-box!important;margin:0!important}.cons-line-editor button{min-height:48px!important}@media(max-width:520px){.cons-draft-table{display:none!important}.cons-draft-cards{display:grid!important;gap:7px}}@media(max-width:340px){.cons-entry-grid-compact,.cons-line-editor{gap:8px!important}}';
 document.head.appendChild(s);
}
window.openConsumablesEntry=function(type){
 if(!['Supervisor','Manager'].includes(role()))return;
 consCompactEntryStyle();
 const names={issued:'Suggested / Issued Materials',additional:'Additional Materials',actual:'Actual Materials'};
 if(type==='actual')return openConsumablesActual();
 draft={type,jc:null,lines:[]};
 modal(names[type]||'Painting Consumables','<div class="cons-entry-shell">'+entryHeader(type)+lineEditor()+'<div class="cons-entry-actions"><button class="secondary" onclick="openPaintingConsumables()">← BACK</button><button id="consFinishBtn" class="green" onclick="consFinishIssue()" disabled>FINISH</button></div></div>');
};
window.consFindJC=function(type,showAll){
 const input=document.getElementById('consJc'),box=document.getElementById('consJcResults');if(!input||!box)return;
 const q=input.value||'';if(!q&&!showAll){box.innerHTML='';box.classList?.add?.('hidden');return}
 box.innerHTML=consJobResults(q,'consSelectJC');box.dataset.type=type||'';box.classList?.remove?.('hidden');
};
window.consSelectJC=function(no){
 const input=document.getElementById('consJc'),box=document.getElementById('consJcResults');if(input)input.value=no;
 const type=box?.dataset?.type||draft.type||'issued';if(box){box.innerHTML='';box.classList?.add?.('hidden')}
 consLoadJC(type);
};
window.consLoadJC=function(type){
 const el=document.getElementById('consJc'),d=jcData(el?.value),v=document.getElementById('consVehicle'),colour=document.getElementById('consColour'),p=document.getElementById('consPainter'),sup=document.getElementById('consSupervisor'),note=document.getElementById('consJcNote'),details=document.getElementById('consVehicleDetails');
 draft.jc=d;
 if(!d){if(v)v.value='';if(p)p.innerHTML='<option value="">Select painter</option>';if(sup)sup.value=me?.name||me?.id||'';if(details)details.innerHTML='';if(note)note.textContent=el?.value?'Select a Job Card from the search results.':'';return}
 if(details)details.innerHTML=consVehicleDetails(d,document.getElementById('consColour')?.value||'');
 if(v)v.value=d.vehicle||'';
 if(sup){const su=(users||[]).find(x=>x.id===d.supervisorId);sup.value=su?.name||d.supervisorId||me?.name||me?.id||'';}
 if(p){p.innerHTML=(d.painters.length>1?'<option value="">Choose Main Painter</option>':'')+d.painters.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');if(d.painters.length===1)p.value=d.painters[0].id}
 if(note)note.textContent=d.painters.length?'Job Card loaded.':'Job Card loaded, but no Painter is assigned.';
};
window.consFilterBrands=function(){
 const c=C().ensureState(state),mid=document.getElementById('consMaterial')?.value,sel=document.getElementById('consBrand');if(!sel)return;
 const ids=new Set(c.prices.filter(p=>!p.voided&&p.materialId===mid).map(p=>p.brandId));
 const brands=c.brands.filter(b=>b.active!==false&&ids.has(b.id));
 sel.innerHTML='<option value="">Brand</option>'+brands.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('');if(brands.length===1)sel.value=brands[0].id;
 const m=c.materials.find(x=>x.id===mid),q=document.getElementById('consQty');if(q)q.placeholder=m?.unit?'Quantity ('+m.unit+')':'Quantity';
};
window.consAddLine=function(){
 if(!draft.jc)return alert('Load a valid Job Card first.');
 const mid=document.getElementById('consMaterial')?.value,bid=document.getElementById('consBrand')?.value,q=Number(document.getElementById('consQty')?.value);
 if(!mid||!bid||!Number.isFinite(q)||!(q>0))return alert('Select Material, Brand and enter Quantity.');
 draft.lines.push({materialId:mid,brandId:bid,quantity:q});consRenderRows();
 document.getElementById('consQty').value='';
};
window.consRemoveLine=function(i){draft.lines.splice(i,1);consRenderRows()};
window.consEditLine=function(i){const l=draft.lines[i];if(!l)return;const c=C().ensureState(state),m=c.materials.find(x=>x.id===l.materialId)||{},b=c.brands.find(x=>x.id===l.brandId)||{},v=prompt((m.name||'Material')+' / '+(b.name||'Brand')+' quantity ('+(m.unit||'unit')+')',String(l.quantity));if(v===null)return;const q=Number(v);if(!Number.isFinite(q)||q<=0)return alert('Enter a valid quantity.');l.quantity=q;consRenderRows()};
window.consRenderRows=function(){
 const out=document.getElementById('consDraftRows');if(!out)return;const c=C().ensureState(state);
 out.innerHTML=draft.lines.length?'<div class="cons-table"><table><tr><th>No.</th><th>Material</th><th>Brand</th><th>Qty</th><th></th></tr>'+draft.lines.map((l,i)=>{const m=c.materials.find(x=>x.id===l.materialId)||{},b=c.brands.find(x=>x.id===l.brandId)||{};return '<tr><td>'+(i+1)+'</td><td>'+esc(m.name||'')+'</td><td>'+esc(b.name||'')+'</td><td>'+esc(l.quantity)+' '+esc(m.unit||'')+'</td><td><button class="secondary" onclick="consRemoveLine('+i+')">REMOVE</button></td></tr>'}).join('')+'</table></div>':'<div class="notice">No materials added yet.</div>';
};
window.consFinishIssue=function(){
 if(!draft.jc||!draft.lines.length)return alert('Load Job Card and add at least one material.');
 const painter=document.getElementById('consPainter')?.value;if(!painter)return alert('Select the Main Painter.');
 const issueType=draft.type==='additional'?C().TYPES.ADDITIONAL:C().TYPES.ISSUED,dup=consRecentDuplicate(issueType,draft.jc.job.no,draft.lines);
 if(dup&&!confirm('Possible duplicate entry: the same materials and quantities were saved for this Job Card within the last 15 minutes. Continue anyway?'))return;
 if(!confirm('Finish and lock this material issue?'))return;
 try{
  draft.clientRequestId=draft.clientRequestId||('ui-'+Date.now()+'-'+Math.random().toString(36).slice(2,10));
  const x=C().issue(state,{clientRequestId:draft.clientRequestId,jobCard:draft.jc.job.no,vehicle:draft.jc.vehicle||'',colourCode:document.getElementById('consColour')?.value||'',mainPainterId:painter,allottedSupervisorId:draft.jc.supervisorId||me?.id||'',lines:draft.lines},{id:me?.id||'',name:me?.name||me?.id||'',role:role()},issueType);
  if(typeof save==='function')save(); alert((draft.type==='additional'?'Additional':'Suggested / Issued')+' Materials saved and locked.'); openPaintingConsumables();
 }catch(e){alert(String(e?.message||e))}
};
window.openConsumablesActual=function(){
 if(!['Supervisor','Manager'].includes(role()))return;
 draft={type:'actual',jc:null,lines:[]};
 modal('Actual Materials','<div class="cons-entry-shell"><div class="cons-jc-access"><label>Job Card Search<div class="cons-searchbar"><input id="consActualJc" placeholder="JC / Registration / Vehicle" autocomplete="off" oninput="consFindActualJC()"><button class="blue" type="button" onclick="consFindActualJC(true)">SEARCH</button></div></label><div id="consActualJcResults" class="cons-jc-results hidden"></div><div id="consActualVehicleDetails" class="cons-vehicle-sticky"></div></div><div class="cons-entry-grid cons-entry-grid-compact"><label>Vehicle Details<input id="consActualVehicle" readonly></label><label>Colour Code<input id="consActualColour" readonly></label><label>Main Painter<input id="consActualPainter" readonly></label><label>Allotted Supervisor<input id="consActualSupervisor" readonly></label></div><div id="consActualNote" class="muted small"></div><div id="consActualRows" class="notice">Search and select a Job Card to load Suggested + Additional materials.</div><div class="cons-entry-actions"><button class="secondary" onclick="openPaintingConsumables()">← BACK</button><button id="consFinishActualBtn" class="green" onclick="consFinishActual()" disabled>FINISH ACTUAL</button></div></div>');
};
window.consFindActualJC=function(showAll){
 const input=document.getElementById('consActualJc'),box=document.getElementById('consActualJcResults');if(!input||!box)return;
 const q=input.value||'';if(!q&&!showAll){box.innerHTML='';box.classList?.add?.('hidden');return}
 box.innerHTML=consJobResults(q,'consSelectActualJC');box.classList?.remove?.('hidden');
};
window.consSelectActualJC=function(no){
 const input=document.getElementById('consActualJc'),box=document.getElementById('consActualJcResults');if(input)input.value=no;if(box){box.innerHTML='';box.classList?.add?.('hidden')}consLoadActual();
};
window.consLoadActual=function(){
 const no=document.getElementById('consActualJc')?.value||'',d=jcData(no),out=document.getElementById('consActualRows'),note=document.getElementById('consActualNote');
 draft={type:'actual',jc:d,lines:[]};
 const details=document.getElementById('consActualVehicleDetails');
 if(!d){const fb=document.getElementById('consFinishActualBtn');if(fb)fb.disabled=true;['consActualVehicle','consActualColour','consActualPainter','consActualSupervisor'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});if(details)details.innerHTML='';if(note)note.textContent='';if(out)out.innerHTML='<div class="notice">Search and select a Job Card to load Suggested + Additional materials.</div>';return}
 const c=C().ensureState(state),issued=c.issues.filter(x=>x.jobCard===d.job.no&&!x.voided),base=issued.find(x=>x.type===C().TYPES.ISSUED);
 if(details)details.innerHTML=consVehicleDetails(d,base?.colourCode||'');
 document.getElementById('consActualVehicle').value=d.vehicle||'';
 document.getElementById('consActualColour').value=base?.colourCode||'';
 const pu=(users||[]).find(x=>x.id===base?.mainPainterId),su=(users||[]).find(x=>x.id===base?.allottedSupervisorId);
 document.getElementById('consActualPainter').value=pu?.name||base?.mainPainterId||'';
 document.getElementById('consActualSupervisor').value=su?.name||base?.allottedSupervisorId||'';
 if(!base){const fb=document.getElementById('consFinishActualBtn');if(fb)fb.disabled=true;out.innerHTML='<div class="notice">No completed Suggested / Issued Materials found for this Job Card.</div>';return}
 if(c.actuals.some(x=>x.jobCard===d.job.no&&!x.voided)){const fb=document.getElementById('consFinishActualBtn');if(fb)fb.disabled=true;out.innerHTML='<div class="notice">Actual Materials are already finished and locked for this Job Card.</div>';return}
 const a=C().allowance(state,d.job.no);
 draft.lines=a.map(({materialId,brandId,quantity})=>({materialId,brandId,quantity}));const fb=document.getElementById('consFinishActualBtn');if(fb)fb.disabled=!draft.lines.length;
 if(note)note.textContent='Actual quantity starts from total Suggested + Additional issued quantity. Reduce/change quantity only when actual use differs.';
 consRenderActualRows();
};
window.consRenderActualRows=function(){
 const out=document.getElementById('consActualRows');if(!out)return;const c=C().ensureState(state);
 out.innerHTML=draft.lines.length?'<div class="cons-table"><table><tr><th>No.</th><th>Material</th><th>Brand</th><th>Total Issued</th><th>Actual Qty</th></tr>'+draft.lines.map((l,i)=>{const m=c.materials.find(x=>x.id===l.materialId)||{},b=c.brands.find(x=>x.id===l.brandId)||{},allow=C().allowance(state,draft.jc.job.no).find(a=>a.materialId===l.materialId&&a.brandId===l.brandId)?.quantity||0;return '<tr><td>'+(i+1)+'</td><td>'+esc(m.name||'')+'</td><td>'+esc(b.name||'')+'</td><td>'+esc(allow)+' '+esc(m.unit||'')+'</td><td><input class="cons-actual-qty" data-i="'+i+'" type="number" min="0" max="'+esc(allow)+'" step="any" value="'+esc(l.quantity)+'"> '+esc(m.unit||'')+'</td></tr>'}).join('')+'</table></div>':'<div class="notice">No issued material lines found.</div>';
};
window.consFinishActual=function(){
 if(!draft.jc||!draft.lines.length)return alert('Load a Job Card with issued materials first.');
 const inputs=[...document.querySelectorAll('.cons-actual-qty')],lines=draft.lines.map((l,i)=>({...l,quantity:Number(inputs[i]?.value)}));
 if(lines.some(x=>!Number.isFinite(x.quantity)||x.quantity<0))return alert('Actual quantity must be zero or more.');
 const at=Date.now(),c=C().ensureState(state);let total=0;
 const rows=lines.map((l,i)=>{const m=c.materials.find(x=>x.id===l.materialId)||{},b=c.brands.find(x=>x.id===l.brandId)||{},p=C().priceAt(state,l.materialId,l.brandId,at);if(!p)throw new Error('Price not found for '+(m.name||'material'));const cost=Math.round((l.quantity*p.pricePerUnit+Number.EPSILON)*1000)/1000;total+=cost;return '<tr><td>'+(i+1)+'</td><td>'+esc(m.name||'')+'</td><td>'+esc(b.name||'')+'</td><td>'+esc(l.quantity)+' '+esc(m.unit||'')+'</td><td>OMR '+Number(p.pricePerUnit).toFixed(3)+'</td><td>OMR '+cost.toFixed(3)+'</td></tr>'}).join('');
 draft.pendingActual={jobCard:draft.jc.job.no,vehicle:draft.jc.vehicle||'',lines,actualAt:at,total};
 modal('Confirm Actual Materials','<div class="cons-confirm"><div class="notice"><b>FINAL CHECK BEFORE LOCKING</b><br>JC '+esc(draft.jc.job.no)+' · '+esc(draft.jc.vehicle||'—')+'<br>Entered by: '+esc(me?.name||me?.id||'—')+'</div><div class="cons-table"><table><tr><th>No.</th><th>Material</th><th>Brand</th><th>Actual Qty</th><th>Price / Unit</th><th>Cost</th></tr>'+rows+'</table></div><div class="cons-confirm-total"><span>Total Actual Material Cost</span><b>OMR '+total.toFixed(3)+'</b></div><div class="cons-entry-actions"><button class="secondary" onclick="consBackActualReview()">← BACK</button><button class="green" onclick="consConfirmFinishActual()">CONFIRM & LOCK</button></div></div>');
};
window.consBackActualReview=function(){
 const p=draft.pendingActual;if(!p)return openConsumablesActual();
 openConsumablesActual();const el=document.getElementById('consActualJc');if(el)el.value=p.jobCard;consLoadActual();draft.lines=p.lines.map(x=>({...x}));consRenderActualRows();
};
window.consConfirmFinishActual=function(){
 const p=draft.pendingActual;if(!p||!p.lines?.length)return alert('Actual Materials review expired. Reopen the Job Card and try again.');
 try{
  draft.clientRequestId=draft.clientRequestId||('ui-'+Date.now()+'-'+Math.random().toString(36).slice(2,10));
  const x=C().finishActual(state,{clientRequestId:draft.clientRequestId,jobCard:p.jobCard,lines:p.lines,actualAt:p.actualAt},{id:me?.id||'',name:me?.name||me?.id||'',role:role()});
  if(typeof save==='function')save();alert('Actual Materials finished and locked. Total material cost: OMR '+Number(x.totalCost||0).toFixed(3));openPaintingConsumables();
 }catch(e){alert(String(e?.message||e))}
};
window.openConsumablesSearch=function(){
 if(!['Supervisor','Manager'].includes(role()))return;
 modal('Search Material List','<div class="cons-subnav"><button class="secondary" type="button" onclick="openPaintingConsumables()">← BACK TO CONSUMABLES</button><button class="blue" type="button" onclick="consOpenPaintReport()">PAINT REPORT</button></div><div class="cons-entry-shell"><div class="cons-searchbar"><input id="consSearchJc" placeholder="Search Job Card No." oninput="consShowSearch()"><button class="blue" onclick="consShowSearch()">SEARCH</button></div><div id="consSearchResult" class="notice">Enter a Job Card number to view material history.</div></div>');
};
window.consShowSearch=function(){
 const no=document.getElementById('consSearchJc')?.value||'',d=jcData(no),out=document.getElementById('consSearchResult');if(!out)return;
 if(!d){out.innerHTML='<div class="notice">Job Card not found.</div>';return}
 const c=C().ensureState(state),issues=c.issues.filter(x=>x.jobCard===d.job.no&&!x.voided),base=issues.find(x=>x.type===C().TYPES.ISSUED),adds=issues.filter(x=>x.type===C().TYPES.ADDITIONAL),actual=c.actuals.find(x=>x.jobCard===d.job.no&&!x.voided),allow=C().allowance(state,d.job.no);
 const keys=[...new Set([...allow.map(x=>x.materialId+'|'+x.brandId),...(actual?.lines||[]).map(x=>x.materialId+'|'+x.brandId)])];
 const u=id=>(users||[]).find(x=>x.id===id)?.name||id||'—',mat=id=>c.materials.find(x=>x.id===id)||{},brand=id=>c.brands.find(x=>x.id===id)||{};
 let rows=keys.map((k,i)=>{const [mid,bid]=k.split('|'),m=mat(mid),b=brand(bid),al=actual?.lines?.find(x=>x.materialId===mid&&x.brandId===bid),aq=allow.find(x=>x.materialId===mid&&x.brandId===bid)?.quantity||0;return '<tr><td>'+(i+1)+'</td><td>'+esc(m.name||'')+'</td><td>'+esc(b.name||'')+'</td><td>'+esc(aq)+' '+esc(m.unit||'')+'</td><td>'+esc(al?m.name||'':'—')+'</td><td>'+esc(al?b.name||'':'—')+'</td><td>'+esc(al?(al.actualQuantity??al.quantity):'—')+(al?' '+esc(m.unit||''):'')+'</td></tr>'}).join('');
 let history=adds.length?'<details><summary>Additional Materials History ('+adds.length+')</summary><div class="cons-add-history">'+adds.map((x,i)=>'<div><b>Additional #'+(i+1)+'</b> · '+new Date(x.createdAt||0).toLocaleString()+' · '+esc(x.createdByName||u(x.createdBy))+'<br>'+x.lines.map(l=>esc(mat(l.materialId).name||'')+' / '+esc(brand(l.brandId).name||'')+' — '+esc(l.quantity)+' '+esc(mat(l.materialId).unit||'')).join('<br>')+'</div>').join('')+'</div></details>':'';
 out.innerHTML='<div class="cons-summary"><b>JC '+esc(d.job.no)+'</b><span>'+esc(d.job.vehicle||'—')+'</span><span>Colour: '+esc(base?.colourCode||'—')+'</span><span>Main Painter: '+esc(u(base?.mainPainterId))+'</span><span>Allotted Supervisor: '+esc(u(base?.allottedSupervisorId))+'</span><span>Issued Entered By: '+esc(base?.createdByName||u(base?.createdBy))+(base?.createdAt?' · '+esc(new Date(base.createdAt).toLocaleString()):'')+'</span><span>Actual Entered By: '+esc(actual?.createdByName||u(actual?.createdBy))+(actual?.createdAt?' · '+esc(new Date(actual.createdAt).toLocaleString()):'')+'</span></div><div class="cons-table"><table><tr><th>No.</th><th>Suggested Material</th><th>Brand</th><th>Quantity</th><th>Actual Material</th><th>Brand</th><th>Quantity</th></tr>'+rows+'</table></div>'+history+'<div class="cons-export-actions"><button class="secondary" onclick="consPrintSearch(\'issued\')">PRINT / PDF ISSUED</button><button class="secondary" onclick="consPrintSearch(\'actual\')">PRINT / PDF ACTUAL</button><button class="blue" onclick="consPrintSearch(\'both\')">PRINT / PDF BOTH</button><button class="blue" onclick="consShareSearch()">SHARE / WHATSAPP</button></div>';
};
function consPrintableWindow(title,body){const w=window.open('','_blank');if(!w)return null;w.document.write('<html><head><meta charset="utf-8"><title>'+title+'</title><style>body{font-family:Arial;padding:24px}.cons-preview-nav{position:sticky;top:0;background:#fff;padding:0 0 12px;margin-bottom:12px;border-bottom:1px solid #ddd}.cons-preview-nav button{font-size:15px;font-weight:700;padding:9px 16px;border:1px solid #111;border-radius:8px;background:#fff;color:#111;cursor:pointer}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:8px;text-align:left}@media print{.cons-preview-nav{display:none}}</style></head><body><div class="cons-preview-nav"><button type="button" onclick="window.close();if(!window.closed)history.back()">← BACK</button></div>'+body+'</body></html>');w.document.close();return w}
window.consPrintSearch=function(mode){
 const result=document.getElementById('consSearchResult');if(!result)return;
 const copy=result.cloneNode(true),table=copy.querySelector('table');if(table&&mode!=='both'){const remove=mode==='issued'?[6,5,4]:[3,2,1];[...table.rows].forEach(row=>remove.sort((a,b)=>b-a).forEach(i=>{if(row.cells[i])row.deleteCell(i)}));}
 if(mode==='issued')copy.querySelectorAll('details').forEach(x=>x.open=true);
 if(mode==='actual')copy.querySelectorAll('details').forEach(x=>x.remove());
 const w=consPrintableWindow('Painting Consumables','<h2>Painting Consumables — '+esc(mode.toUpperCase())+'</h2>'+copy.innerHTML);if(!w)return alert('Allow pop-ups to print.');w.focus();w.print();
};
window.consShareSearch=async function(){const result=document.getElementById('consSearchResult');if(!result)return;const copy=result.cloneNode(true);copy.querySelectorAll('.cons-export-actions,button').forEach(x=>x.remove());copy.querySelectorAll('details').forEach(x=>x.open=true);const text='ZUKAIT AUTO — Painting Consumables Material List\n'+copy.innerText;if(navigator.share){try{await navigator.share({title:'Painting Consumables Material List',text})}catch(e){}}else{try{await navigator.clipboard.writeText(text);alert('Material list copied. You can paste it into WhatsApp or another app.')}catch(e){alert('Share is not available on this device.')}}};
window.openConsumablesManager=function(type){if(role()!=='Manager')return;if(type==='master')return consOpenMaster();if(type==='material')return consOpenMaterialSearch();if(type==='reports')return consOpenReports();if(type==='history')return consOpenHistory();modal('Manager Consumables','<div class="notice">Manager-only Consumables foundation is connected.</div>')};
window.consOpenMaster=function(){if(role()!=='Manager')return;const units=['Liter','kg','Piece'],cats=['Paint','Consumable'];modal('Brands & Price','<div class="cons-subnav"><button class="secondary" type="button" onclick="openPaintingConsumables()">← BACK TO CONSUMABLES</button></div><div id="consMasterWorkspace" class="cons-entry-shell"><div class="cons-master-form"><input id="cmMaterial" placeholder="Material Name"><input id="cmBrand" placeholder="Brand Name"><select id="cmUnit">'+units.map(x=>'<option>'+x+'</option>').join('')+'</select><select id="cmCategory">'+cats.map(x=>'<option>'+x+'</option>').join('')+'</select><input id="cmPrice" type="number" min="0" step="0.001" placeholder="Price / Unit OMR"><label>Effective From<input id="cmDate" type="date" value="'+new Date().toISOString().slice(0,10)+'"></label><button class="blue" onclick="consSaveMaster()">ADD / SET PRICE</button></div><div id="cmList"></div><button class="secondary" onclick="consPrintMaster()">PRINT MATERIAL & PRICE LIST</button></div>');consRenderMaster()};
window.consSaveMaster=function(){if(role()!=='Manager')return;const mn=document.getElementById('cmMaterial')?.value.trim(),bn=document.getElementById('cmBrand')?.value.trim(),unit=document.getElementById('cmUnit')?.value,category=document.getElementById('cmCategory')?.value||'Consumable',price=Number(document.getElementById('cmPrice')?.value),date=document.getElementById('cmDate')?.value;if(!mn||!bn||!unit||!Number.isFinite(price)||price<0||!date)return alert('Enter Material, Brand, Unit, Price and Effective From date.');const reason=prompt('Reason for this price entry/change:');if(reason===null)return;if(!reason.trim())return alert('Reason is required for every price entry/change.');try{const c=C().ensureState(state),actor={id:me?.id||'',role:'Manager'};let m=c.materials.find(x=>String(x.name).toLowerCase()===mn.toLowerCase()&&x.active!==false);if(!m)m=C().addMaterial(state,{name:mn,unit,category},actor);else if(m.unit!==unit)return alert('This material already uses '+m.unit+'. Use its configured unit to protect historical quantities.');else if(!m.category)m.category=category;else if(m.category!==category)return alert('This material is already classified as '+m.category+'. Change its category through a controlled correction to protect reporting.');let b=c.brands.find(x=>String(x.name).toLowerCase()===bn.toLowerCase()&&x.active!==false);if(!b)b=C().addBrand(state,{name:bn},actor);const effective=new Date(date+'T00:00:00').getTime(),hasLater=c.prices.some(p=>!p.voided&&p.materialId===m.id&&p.brandId===b.id&&p.effectiveFrom>effective);if(hasLater&&!confirm('This is a backdated price before a newer price period. Historical finalized Actual records will NOT be recalculated automatically. Continue?'))return;C().setPrice(state,{materialId:m.id,brandId:b.id,pricePerUnit:price,effectiveFrom:effective,reason:reason.trim()},actor);if(typeof save==='function')save();document.getElementById('cmPrice').value='';consRenderMaster()}catch(e){alert(String(e?.message||e))}};
window.consRenderMaster=function(){const out=document.getElementById('cmList');if(!out)return;const c=C().ensureState(state),rows=[];c.materials.filter(x=>x.active!==false).forEach(m=>c.brands.filter(x=>x.active!==false).forEach(b=>{const ps=c.prices.filter(p=>p.materialId===m.id&&p.brandId===b.id&&!p.voided).sort((a,z)=>Number(z.effectiveFrom)-Number(a.effectiveFrom));if(ps.length)rows.push({m,b,p:ps[0],count:ps.length})}));out.innerHTML=rows.length?'<div class="cons-table"><table><tr><th>No.</th><th>Material</th><th>Brand</th><th>Category</th><th>Unit</th><th>Price / Unit</th><th>Effective From</th><th>History</th></tr>'+rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(r.m.name)+'</td><td>'+esc(r.b.name)+'</td><td><button class="secondary" type="button" onclick="consChangeMaterialCategory(\''+esc(r.m.id)+'\')">'+esc(r.m.category||'Consumable')+'</button></td><td>'+esc(r.m.unit)+'</td><td>OMR '+Number(r.p.pricePerUnit).toFixed(3)+'</td><td>'+esc(new Date(r.p.effectiveFrom).toLocaleDateString())+'</td><td>'+r.count+'</td></tr>').join('')+'</table></div>':'<div class="notice">No material prices configured yet.</div>'};
window.consChangeMaterialCategory=function(mid){if(role()!=='Manager')return;const c=C().ensureState(state),m=c.materials.find(x=>x.id===mid&&x.active!==false);if(!m)return;const next=String(m.category||'Consumable')==='Paint'?'Consumable':'Paint';if(!confirm('Change '+m.name+' category from '+(m.category||'Consumable')+' to '+next+'? This changes Paint Report classification but does not change historical quantities or prices.'))return;m.category=next;m.categoryChangedAt=Date.now();m.categoryChangedBy=me?.id||'';if(Array.isArray(c.audit))c.audit.push({id:'audit_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),type:'MATERIAL_CATEGORY_CHANGED',entityId:m.id,by:me?.id||'',at:Date.now(),after:{category:next}});if(typeof save==='function')save();consRenderMaster()};
window.consPrintMaster=function(){const x=document.getElementById('cmList');if(!x)return;const w=consPrintableWindow('Painting Material Price List','<h2>Painting Consumables — Material & Price List</h2>'+x.innerHTML);if(!w)return alert('Allow pop-ups to print.');w.focus();w.print()};
window.consOpenMaterialSearch=function(){
 if(role()!=='Manager')return;const c=C().ensureState(state);
 modal('Search Material','<div class="cons-subnav"><button class="secondary" type="button" onclick="openPaintingConsumables()">← BACK TO CONSUMABLES</button></div><div class="cons-entry-shell"><div class="cons-searchbar"><select id="csmMaterial" onchange="consMaterialHistory()"><option value="">Select Material</option>'+c.materials.filter(x=>x.active!==false).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+esc(x.unit)+'</option>').join('')+'</select><button class="blue" onclick="consMaterialHistory()">VIEW HISTORY</button></div><div id="csmResult" class="notice">Select a material to view brands and complete effective-date price history.</div></div>');
};
window.consMaterialHistory=function(){
 const mid=document.getElementById('csmMaterial')?.value,out=document.getElementById('csmResult');if(!out)return;const c=C().ensureState(state),m=c.materials.find(x=>x.id===mid);
 if(!m){out.innerHTML='<div class="notice">Select a material.</div>';return}
 const brands=c.brands.filter(b=>c.prices.some(p=>p.materialId===mid&&p.brandId===b.id&&!p.voided));
 out.innerHTML='<div class="cons-summary"><b>'+esc(m.name)+'</b><span>Configured Unit: '+esc(m.unit)+'</span></div>'+brands.map(b=>{const ps=c.prices.filter(p=>p.materialId===mid&&p.brandId===b.id&&!p.voided).sort((a,z)=>Number(z.effectiveFrom)-Number(a.effectiveFrom));return '<div class="cons-price-history"><h3>'+esc(b.name)+'</h3><table><tr><th>Effective From</th><th>Price / Unit</th><th>Changed By</th><th>Changed On</th></tr>'+ps.map(p=>'<tr><td>'+esc(new Date(p.effectiveFrom).toLocaleDateString())+'</td><td>OMR '+Number(p.pricePerUnit).toFixed(3)+' / '+esc(m.unit)+'</td><td>'+esc((users||[]).find(u=>u.id===p.createdBy)?.name||p.createdBy||'Manager')+'</td><td>'+esc(p.createdAt?new Date(p.createdAt).toLocaleString():'—')+'</td></tr>').join('')+'</table><div class="cons-price-change"><input id="np_'+esc(b.id)+'" type="number" min="0" step="0.001" placeholder="New Price / Unit"><input id="nd_'+esc(b.id)+'" type="date" value="'+new Date().toISOString().slice(0,10)+'"><button class="blue" onclick="consChangePrice(\''+esc(mid)+'\',\''+esc(b.id)+'\')">SET NEW PRICE</button></div></div>'}).join('');
};
window.consChangePrice=function(mid,bid){
 if(role()!=='Manager')return;const price=Number(document.getElementById('np_'+bid)?.value),date=document.getElementById('nd_'+bid)?.value;if(!Number.isFinite(price)||price<0||!date)return alert('Enter new Price / Unit and Effective From date.');
 try{const c=C().ensureState(state),latest=c.prices.filter(p=>p.materialId===mid&&p.brandId===bid&&!p.voided).sort((a,z)=>Number(z.effectiveFrom)-Number(a.effectiveFrom))[0];if(latest&&new Date(date+'T00:00:00').getTime()<Number(latest.effectiveFrom)&&!confirm('This is a backdated price. Historical Actual records keep their stored price snapshot. Continue adding this effective-date price?'))return;const reason=prompt('Reason for price change (required)');if(reason===null)return;if(!reason.trim())return alert('Reason is required.');const effective=new Date(date+'T00:00:00').getTime(),isBackdated=!!(latest&&effective<Number(latest.effectiveFrom));const newPrice=C().setPrice(state,{materialId:mid,brandId:bid,pricePerUnit:price,effectiveFrom:effective,reason:reason.trim()},me);if(isBackdated){const recalc=confirm('Backdated price saved.\n\nOK = RECALCULATE affected finalized Actual costs using this effective-date price.\nCancel = KEEP existing historical cost snapshots.');if(recalc){const rr=prompt('Reason for recalculating historical Actual costs (required):');if(rr===null||!rr.trim()){alert('Recalculation cancelled. Historical costs remain unchanged.');}else{const changed=C().managerRecalculateActualPrices(state,newPrice.id,me,rr.trim());alert(changed.length+' finalized Actual record(s) recalculated with full audit history.')}}}if(typeof save==='function')save();consMaterialHistory()}catch(e){alert(String(e?.message||e))}
};
window.consOpenHistory=function(){
 if(role()!=='Manager')return;const c=C().ensureState(state),rows=[...c.audit].sort((a,b)=>(b.at||0)-(a.at||0));
 modal('Consumables Edit History','<div class="cons-subnav"><button class="secondary" type="button" onclick="openPaintingConsumables()">← BACK TO CONSUMABLES</button></div><div class="cons-entry-shell"><div class="notice">Manager corrections are never silently overwritten. Original and corrected values remain in this audit history.</div><div class="cons-table"><table><tr><th>Date / Time</th><th>Action</th><th>JC / Record</th><th>Changed By</th><th>Reason</th><th>Before → After</th></tr>'+rows.map(a=>'<tr><td>'+esc(new Date(a.at||0).toLocaleString())+'</td><td>'+esc(a.type||'')+'</td><td>'+esc(a.jobCard||a.entityId||'')+'</td><td>'+esc((users||[]).find(u=>u.id===a.by)?.name||a.by||'')+'</td><td>'+esc(a.reason||'—')+'</td><td><details><summary>VIEW CHANGE</summary><pre>'+esc(JSON.stringify({before:a.before||null,after:a.after||null},null,2))+'</pre></details></td></tr>').join('')+'</table></div><h3>Issued / Additional Records</h3><div class="cons-table"><table><tr><th>JC</th><th>Type</th><th>Entered By</th><th>Entered On</th><th>Lines</th><th>Manager Action</th></tr>'+c.issues.filter(x=>!x.voided).map(a=>'<tr><td>'+esc(a.jobCard)+'</td><td>'+esc(a.type||'')+'</td><td>'+esc((users||[]).find(u=>u.id===a.createdBy)?.name||a.createdBy||'—')+'</td><td>'+esc(a.createdAt?new Date(a.createdAt).toLocaleString():'—')+'</td><td>'+esc((a.lines||[]).length)+'</td><td><button class="secondary" onclick="consHistoryCorrectIssue(\''+esc(a.id)+'\')">CORRECT</button> <button class="danger" onclick="consHistoryVoid(\'issue\',\''+esc(a.id)+'\')">VOID</button></td></tr>').join('')+'</table></div><h3>Finalized Actual Records</h3><div class="cons-table"><table><tr><th>JC</th><th>Entered By</th><th>Entered On</th><th>Total</th><th>Status</th><th>Manager Action</th></tr>'+c.actuals.filter(x=>!x.voided).map(a=>'<tr><td>'+esc(a.jobCard)+'</td><td>'+esc((users||[]).find(u=>u.id===a.createdBy)?.name||a.createdBy||'—')+'</td><td>'+esc(a.createdAt?new Date(a.createdAt).toLocaleString():'—')+'</td><td>OMR '+Number(a.totalCost||0).toFixed(3)+'</td><td>'+esc(a.locked?'Finalized':'Reopened')+'</td><td><button class="secondary" onclick="consHistoryCorrectActual(\''+esc(a.id)+'\')">CORRECT</button> <button class="secondary" onclick="consHistoryReopen(\''+esc(a.id)+'\')">REOPEN</button> <button class="danger" onclick="consHistoryVoid(\'actual\',\''+esc(a.id)+'\')">VOID</button></td></tr>').join('')+'</table></div></div>');
};
window.consHistoryCorrectIssue=function(id){if(role()!=='Manager')return;const c=C().ensureState(state),a=c.issues.find(x=>x.id===id&&!x.voided);if(!a)return;try{const lines=(a.lines||[]).map(l=>{const m=c.materials.find(x=>x.id===l.materialId)||{},b=c.brands.find(x=>x.id===l.brandId)||{};const q=prompt((m.name||'Material')+' / '+(b.name||'Brand')+' issued quantity',String(l.quantity));if(q===null)throw new Error('CANCEL');const n=Number(q);if(!Number.isFinite(n)||n<0)throw new Error('INVALID_QUANTITY');return {materialId:l.materialId,brandId:l.brandId,quantity:n}});const colourCode=prompt('Colour Code',String(a.colourCode||''));if(colourCode===null)return;const reason=prompt('Reason for correction (required)');if(reason===null)return;C().managerCorrectIssue(state,id,{colourCode,lines},me,reason);save();consOpenHistory();alert('Issued / Additional record corrected and audit history updated.')}catch(e){if(e.message!=='CANCEL')alert(e.message)}};
window.consHistoryCorrectActual=function(id){if(role()!=='Manager')return;const c=C().ensureState(state),a=c.actuals.find(x=>x.id===id&&!x.voided);if(!a)return;try{const lines=a.lines.map(l=>{const m=c.materials.find(x=>x.id===l.materialId)||{},b=c.brands.find(x=>x.id===l.brandId)||{};const q=prompt((m.name||'Material')+' / '+(b.name||'Brand')+' actual quantity',String(l.actualQuantity));if(q===null)throw new Error('CANCEL');return {materialId:l.materialId,brandId:l.brandId,quantity:Number(q)}});const reason=prompt('Reason for correction (required)');if(reason===null)return;C().managerCorrectActual(state,id,lines,me,reason);save();consOpenHistory();alert('Actual Materials corrected and audit history updated.')}catch(e){if(e.message!=='CANCEL')alert(e.message)}};
window.consHistoryReopen=function(id){if(role()!=='Manager')return;const reason=prompt('Reason for reopening this Actual record (required)');if(reason===null)return;try{C().managerReopenActual(state,id,me,reason);save();consOpenHistory();alert('Actual record reopened and audited.')}catch(e){alert(e.message)}};
window.consHistoryVoid=function(kind,id){if(role()!=='Manager')return;const reason=prompt('Reason for voiding this record (required)');if(reason===null)return;if(!confirm('Void this record? The original remains in Edit History.'))return;try{C().managerVoid(state,kind,id,me,reason);save();consOpenHistory();alert('Record voided. Original history retained.')}catch(e){alert(e.message)}};
window.consOpenReports=function(){
 if(role()!=='Manager')return;const c=C().ensureState(state),opts=(arr,label)=>'<option value="">All '+label+'</option>'+arr.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
 modal('Painting Consumables Reports','<div class="cons-subnav"><button class="secondary" type="button" onclick="openPaintingConsumables()">← BACK TO CONSUMABLES</button></div><div class="cons-entry-shell"><div class="cons-report-filters"><select id="crMode"><option value="custom">Custom Range</option><option value="jc">Job Card Cost</option><option value="monthly">Monthly Expense</option><option value="material">Material Consumption</option><option value="brand">Brand-wise</option><option value="painter">Painter-wise</option><option value="supervisor">Supervisor-wise</option></select><label>From<input id="crFrom" type="date"></label><label>To<input id="crTo" type="date"></label><input id="crJc" placeholder="Job Card"><select id="crMat">'+opts(c.materials.filter(x=>x.active!==false),'Materials')+'</select><select id="crBrand">'+opts(c.brands.filter(x=>x.active!==false),'Brands')+'</select><select id="crPainter">'+opts((users||[]).filter(x=>x.department==='Painter'),'Painters')+'</select><select id="crSupervisor">'+opts((users||[]).filter(x=>x.role==='Supervisor'),'Supervisors')+'</select><button class="blue" onclick="consRunReports()">VIEW REPORT</button></div><div id="crResult" class="notice">Reports use finalized Actual Materials only.</div></div>');
};
window.consRunReports=function(){
 if(role()!=='Manager')return;
 const c=C().ensureState(state),from=document.getElementById('crFrom')?.value,to=document.getElementById('crTo')?.value,jc=(document.getElementById('crJc')?.value||'').trim().toUpperCase(),mid=document.getElementById('crMat')?.value,bid=document.getElementById('crBrand')?.value,pid=document.getElementById('crPainter')?.value,sid=document.getElementById('crSupervisor')?.value,out=document.getElementById('crResult');if(!out)return;
 const day=t=>{const n=Number(t)||0;if(!n)return '';const d=new Date(n),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+dd};let actuals=c.actuals.filter(x=>!x.voided&&x.locked&&(!from||day(x.actualAt)>=from)&&(!to||day(x.actualAt)<=to)&&(!jc||String(x.jobCard).toUpperCase().includes(jc)));
 actuals=actuals.filter(a=>{const base=c.issues.find(x=>x.jobCard===a.jobCard&&x.type===C().TYPES.ISSUED&&!x.voided);return (!pid||base?.mainPainterId===pid)&&(!sid||base?.allottedSupervisorId===sid)});
 const rows=[];actuals.forEach(a=>{const base=c.issues.find(x=>x.jobCard===a.jobCard&&x.type===C().TYPES.ISSUED&&!x.voided);a.lines.forEach(l=>{if((mid&&l.materialId!==mid)||(bid&&l.brandId!==bid))return;const m=c.materials.find(x=>x.id===l.materialId)||{},b=c.brands.find(x=>x.id===l.brandId)||{};rows.push({date:day(a.actualAt),jc:a.jobCard,material:m.name||'',brand:b.name||'',unit:m.unit||'',qty:Number(l.actualQuantity??l.quantity)||0,unitPrice:Number(l.unitPriceSnapshot)||0,cost:Number(l.lineCost)||0,painter:(users||[]).find(x=>x.id===base?.mainPainterId)?.name||base?.mainPainterId||'—',supervisor:(users||[]).find(x=>x.id===base?.allottedSupervisorId)?.name||base?.allottedSupervisorId||'—'})})});
 const mode=document.getElementById('crMode')?.value||'custom';if(mode==='jc'&&!jc)return alert('Enter a Job Card for Job Card Cost report.');const total=Math.round(rows.reduce((n,r)=>n+r.cost,0)*1000)/1000,jcs=new Set(rows.map(r=>r.jc)).size,groups={};rows.forEach(r=>{const k=r.material+'|'+r.brand+'|'+r.unit;groups[k]||(groups[k]={name:r.material,brand:r.brand,unit:r.unit,qty:0,cost:0});groups[k].qty+=r.qty;groups[k].cost+=r.cost});
 const modeName={custom:'Custom Range',jc:'Job Card Cost',monthly:'Monthly Expense',material:'Material Consumption',brand:'Brand-wise',painter:'Painter-wise',supervisor:'Supervisor-wise'}[mode]||'Custom Range';let grouped='';if(['material','brand','painter','supervisor'].includes(mode)){const gm=new Map(),keyFor=r=>mode==='material'?[r.material,r.brand,r.unit]:mode==='brand'?[r.brand]:mode==='painter'?[r.painter]:[r.supervisor];rows.forEach(r=>{const parts=keyFor(r),k=parts.join('|'),g=gm.get(k)||{parts,qty:0,cost:0,jcs:new Set(),lines:0,units:new Set()};g.qty+=r.qty;g.cost+=r.cost;g.jcs.add(r.jc);g.lines++;if(r.unit)g.units.add(r.unit);gm.set(k,g)});const first=mode==='material'?'Material / Brand':mode==='brand'?'Brand':mode==='painter'?'Painter':'Supervisor';grouped='<h3>'+esc(modeName)+' Summary</h3><div class="cons-table"><table><tr><th>'+first+'</th><th>Job Cards</th><th>Actual Lines</th><th>Total Quantity</th><th>Total Cost</th></tr>'+[...gm.values()].sort((a,b)=>b.cost-a.cost).map(g=>{const qty=g.units.size===1?(Math.round(g.qty*1000)/1000)+' '+[...g.units][0]:'Mixed units';return '<tr><td>'+esc(g.parts.filter(Boolean).join(' / '))+'</td><td>'+g.jcs.size+'</td><td>'+g.lines+'</td><td>'+esc(qty)+'</td><td>OMR '+(Math.round(g.cost*1000)/1000).toFixed(3)+'</td></tr>'}).join('')+'</table></div>'}let comparison='';if(mode==='monthly'){const monthTotals={};c.actuals.filter(x=>!x.voided&&x.locked).forEach(a=>{const d=day(a.actualAt),mk=d.slice(0,7);if(!mk)return;monthTotals[mk]=(monthTotals[mk]||0)+a.lines.reduce((n,l)=>n+(Number(l.lineCost)||0),0)});const months=Object.keys(monthTotals).sort().slice(-2);if(months.length===2){const prev=monthTotals[months[0]],cur=monthTotals[months[1]],diff=Math.round((cur-prev)*1000)/1000,pct=prev?Math.round((diff/prev)*1000)/10:null;comparison='<div class="notice"><b>Workshop Month-to-Month Total:</b> '+esc(months[0])+' OMR '+prev.toFixed(3)+' → '+esc(months[1])+' OMR '+cur.toFixed(3)+' · '+(diff>=0?'+':'')+diff.toFixed(3)+' OMR'+(pct===null?'':' ('+(pct>=0?'+':'')+pct.toFixed(1)+'%)')+'<br><small>Overall finalized Painting Actual expense; report filters above do not change this comparison.</small></div>'}}out.innerHTML='<h3>'+esc(modeName)+'</h3><div class="cons-report-kpis"><div><b>OMR '+total.toFixed(3)+'</b><span>Total Actual Expense</span></div><div><b>'+jcs+'</b><span>Job Cards</span></div><div><b>'+rows.length+'</b><span>Actual Material Lines</span></div></div><div class="cons-table"><table><tr><th>Date</th><th>JC</th><th>Material</th><th>Brand</th><th>Actual Qty</th><th>Price / Unit</th><th>Cost</th><th>Painter</th><th>Supervisor</th></tr>'+rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.jc)+'</td><td>'+esc(r.material)+'</td><td>'+esc(r.brand)+'</td><td>'+esc(r.qty)+' '+esc(r.unit)+'</td><td>OMR '+r.unitPrice.toFixed(3)+'</td><td>OMR '+r.cost.toFixed(3)+'</td><td>'+esc(r.painter)+'</td><td>'+esc(r.supervisor)+'</td></tr>').join('')+'</table></div><h3>Material / Brand Consumption</h3><div class="cons-table"><table><tr><th>Material</th><th>Brand</th><th>Total Qty</th><th>Total Cost</th></tr>'+Object.values(groups).map(g=>'<tr><td>'+esc(g.name)+'</td><td>'+esc(g.brand)+'</td><td>'+esc(Math.round(g.qty*1000)/1000)+' '+esc(g.unit)+'</td><td>OMR '+(Math.round(g.cost*1000)/1000).toFixed(3)+'</td></tr>').join('')+'</table></div>'+grouped+comparison+'<div class="cons-export-actions"><button class="secondary" onclick="consPrintReport()">PRINT / PDF</button><button class="blue" onclick="consShareReport()">SHARE</button></div>';
};
window.consOpenPaintReport=function(){
 if(role()!=='Manager')return;
 const c=C().ensureState(state),opts=(arr,label)=>'<option value="">All '+label+'</option>'+arr.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
 modal('Painting Consumables — Paint Report','<div class="cons-subnav"><button class="secondary" type="button" onclick="consOpenReports()">← BACK TO REPORTS</button></div><div class="cons-entry-shell"><div class="cons-report-filters"><label>From<input id="prFrom" type="date"></label><label>To<input id="prTo" type="date"></label><input id="prJc" placeholder="Job Card"><input id="prColour" placeholder="Colour Code"><select id="prBrand">'+opts(c.brands.filter(x=>x.active!==false),'Brands')+'</select><select id="prPainter">'+opts((users||[]).filter(x=>x.department==='Painter'),'Painters')+'</select><select id="prSupervisor">'+opts((users||[]).filter(x=>x.role==='Supervisor'),'Supervisors')+'</select><button class="blue" onclick="consRunPaintReport()">VIEW PAINT REPORT</button></div><div id="prResult" class="notice">Paint Report uses finalized Actual Materials classified as Paint.</div></div>');
};
window.consRunPaintReport=function(){
 if(role()!=='Manager')return;
 const c=C().ensureState(state),from=document.getElementById('prFrom')?.value,to=document.getElementById('prTo')?.value,jc=(document.getElementById('prJc')?.value||'').trim().toUpperCase(),colour=(document.getElementById('prColour')?.value||'').trim().toLowerCase(),bid=document.getElementById('prBrand')?.value,pid=document.getElementById('prPainter')?.value,sid=document.getElementById('prSupervisor')?.value,out=document.getElementById('prResult');if(!out)return;
 const day=t=>{const n=Number(t)||0;if(!n)return '';const d=new Date(n),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+dd};
 const rows=[];
 c.actuals.filter(x=>!x.voided&&x.locked&&(!from||day(x.actualAt)>=from)&&(!to||day(x.actualAt)<=to)&&(!jc||String(x.jobCard).toUpperCase().includes(jc))).forEach(a=>{
  const base=c.issues.find(x=>x.jobCard===a.jobCard&&x.type===C().TYPES.ISSUED&&!x.voided);if(!base)return;
  if((colour&&!String(base.colourCode||'').toLowerCase().includes(colour))||(pid&&base.mainPainterId!==pid)||(sid&&base.allottedSupervisorId!==sid))return;
  const allIssues=c.issues.filter(x=>x.jobCard===a.jobCard&&!x.voided&&(x.type===C().TYPES.ISSUED||x.type===C().TYPES.ADDITIONAL));
  a.lines.forEach(l=>{const m=c.materials.find(x=>x.id===l.materialId)||{},b=c.brands.find(x=>x.id===l.brandId)||{};if(String(m.category||'').toLowerCase()!=='paint'||(bid&&l.brandId!==bid))return;
   let issued=0,additional=0;allIssues.forEach(ix=>(ix.lines||[]).forEach(z=>{if(z.materialId===l.materialId&&z.brandId===l.brandId){if(ix.type===C().TYPES.ADDITIONAL)additional+=Number(z.quantity)||0;else issued+=Number(z.quantity)||0}}));
   const actual=Number(l.actualQuantity??l.quantity)||0,variance=issued+additional-actual,cost=Number(l.lineCost)||0,j=typeof jcData==='function'?jcData(a.jobCard):null;
   rows.push({date:day(a.actualAt),jc:a.jobCard,vehicle:j?.vehicle||base.vehicle||'',colour:base.colourCode||'',material:m.name||'',brand:b.name||'',issued,additional,actual,variance,cost,painter:(users||[]).find(x=>x.id===base.mainPainterId)?.name||base.mainPainterId||'—',supervisor:(users||[]).find(x=>x.id===base.allottedSupervisorId)?.name||base.allottedSupervisorId||'—'});
  });
 });
 const sum=k=>Math.round(rows.reduce((n,r)=>n+(Number(r[k])||0),0)*1000)/1000,totalIssued=()=>Math.round((sum('issued')+sum('additional'))*1000)/1000,totalCost=Math.round(rows.reduce((n,r)=>n+r.cost,0)*1000)/1000;
 out.innerHTML='<div class="cons-report-kpis paint"><div><b>'+totalIssued().toFixed(3)+' L</b><span>Total Paint Issued</span></div><div><b>'+sum('actual').toFixed(3)+' L</b><span>Actual Paint Used</span></div><div><b>'+sum('variance').toFixed(3)+' L</b><span>Variance</span></div><div><b>OMR '+totalCost.toFixed(3)+'</b><span>Total Paint Cost</span></div></div><div class="cons-paint-report-list">'+rows.map(r=>'<div class="cons-paint-card"><div class="head"><b>'+esc(r.jc)+'</b><span>'+esc(r.date)+'</span></div><strong>'+esc(r.vehicle||'Vehicle not recorded')+'</strong><small>Colour '+esc(r.colour||'—')+' · '+esc(r.painter)+' · '+esc(r.supervisor)+'</small><div class="metrics"><span>Issued<b>'+r.issued.toFixed(3)+' L</b></span><span>Additional<b>'+r.additional.toFixed(3)+' L</b></span><span>Actual<b>'+r.actual.toFixed(3)+' L</b></span><span>Variance<b>'+r.variance.toFixed(3)+' L</b></span></div><small>'+esc(r.material)+' · '+esc(r.brand)+' · OMR '+r.cost.toFixed(3)+'</small></div>').join('')+'</div><div class="cons-table cons-paint-wide"><table><tr><th>Date</th><th>JC</th><th>Vehicle</th><th>Colour</th><th>Painter</th><th>Supervisor</th><th>Material</th><th>Brand</th><th>Issued L</th><th>Additional L</th><th>Actual L</th><th>Variance L</th><th>Cost</th></tr>'+rows.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.jc)+'</td><td>'+esc(r.vehicle)+'</td><td>'+esc(r.colour)+'</td><td>'+esc(r.painter)+'</td><td>'+esc(r.supervisor)+'</td><td>'+esc(r.material)+'</td><td>'+esc(r.brand)+'</td><td>'+r.issued.toFixed(3)+'</td><td>'+r.additional.toFixed(3)+'</td><td>'+r.actual.toFixed(3)+'</td><td>'+r.variance.toFixed(3)+'</td><td>OMR '+r.cost.toFixed(3)+'</td></tr>').join('')+'</table></div><div class="cons-export-actions"><button class="secondary" onclick="consPrintPaintReport()">PRINT / PDF</button><button class="blue" onclick="consSharePaintReport()">SHARE</button></div>';
};
window.consPrintPaintReport=function(){const x=document.getElementById('prResult');if(!x)return;const copy=x.cloneNode(true);copy.querySelectorAll('.cons-export-actions,button').forEach(n=>n.remove());const w=consPrintableWindow('Painting Consumables Paint Report','<h2>Painting Consumables — Paint Report</h2>'+copy.innerHTML);if(!w)return alert('Allow pop-ups to print.');w.focus();w.print()};
window.consSharePaintReport=async function(){const x=document.getElementById('prResult');if(!x)return;const copy=x.cloneNode(true);copy.querySelectorAll('.cons-export-actions,button').forEach(n=>n.remove());const t='ZUKAIT AUTO — Painting Consumables Paint Report\n'+copy.innerText;if(navigator.share){try{await navigator.share({title:'Paint Report',text:t})}catch(e){}}else{try{await navigator.clipboard.writeText(t);alert('Paint Report copied.')}catch(e){alert('Share is not available on this device.')}}};
window.consPrintReport=function(){const x=document.getElementById('crResult');if(!x)return;const copy=x.cloneNode(true);copy.querySelectorAll('.cons-export-actions,button').forEach(n=>n.remove());const w=consPrintableWindow('Painting Consumables Report','<h2>Painting Consumables — Actual Materials Report</h2>'+copy.innerHTML);if(!w)return alert('Allow pop-ups to print.');w.focus();w.print()};
window.consShareReport=async function(){const x=document.getElementById('crResult');if(!x)return;const copy=x.cloneNode(true);copy.querySelectorAll('.cons-export-actions,button').forEach(n=>n.remove());const text='ZUKAIT AUTO — Painting Consumables Actual Materials Report\n'+copy.innerText;if(navigator.share){try{await navigator.share({title:'Painting Consumables Report',text})}catch(e){}}else{try{await navigator.clipboard.writeText(text);alert('Report copied. You can paste it into WhatsApp or another app.')}catch(e){alert('Share is not available on this device.')}}};

function addLaunchCard(){
 if(!['Supervisor','Manager'].includes(role()))return;
 const host=document.getElementById(role()==='Manager'?'managerView':'supervisorView');
 if(!host)return;
 if(role()==='Supervisor'){
   // Supervisor authority: one compact Consumables tile only, beside the rendered
   // AVAILABLE WORKERS tile shown below Employee Efficiency. Never prepend a
   // separate full-width Consumables launcher.
   host.querySelectorAll('.cons-launch:not(.cons-supervisor-tile)').forEach(x=>x.remove());
   if(host.querySelector('.cons-supervisor-tile'))return;
   const available=[...host.querySelectorAll('button,.card,section,div')].filter(x=>/AVAILABLE\s*WORKERS/i.test((x.textContent||'').trim())).sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];
   if(!available)return;
   const anchor=available.closest('button,.card')||available;
   const parent=anchor.parentElement;if(!parent)return;
   const card=document.createElement('button');card.type='button';card.className='cons-supervisor-tile';card.onclick=openConsumablesModule;
   card.innerHTML='<span class="cons-supervisor-icon">▦</span><span><b>CONSUMABLES</b><small>Painting · Denting · Mechanical</small></span><strong>›</strong>';
   parent.classList.add('cons-supervisor-pair');
   anchor.insertAdjacentElement('afterend',card);
   return;
 }
 // Manager launcher is owned by the authoritative Workshop Control renderer.
 // Do not inject a second .cons-launch at the top of Manager Dashboard.
 // V141 in v74_updates.js repairs/binds the single Workshop Control button.
 return;
}
const css=document.createElement('style');css.id='consumablesUiCss';css.textContent=`
.cons-subnav{display:flex;justify-content:flex-start;margin:0 0 12px}.cons-subnav button{min-height:40px}.cons-launch{width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;margin:8px 0 12px;border:1px solid #d8e0e8;background:linear-gradient(135deg,#fff,#f7fafc);color:#0f1b2b;border-radius:16px;text-align:left;box-shadow:0 4px 14px rgba(15,27,43,.07)}
.cons-supervisor-pair{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;align-items:stretch!important}
.cons-supervisor-tile{width:100%!important;min-width:0!important;min-height:100%!important;margin:0!important;padding:16px!important;border:1px solid #d8c7ee!important;border-radius:16px!important;background:linear-gradient(145deg,#faf5ff,#f3e8ff)!important;color:#5b217a!important;box-shadow:0 5px 14px rgba(91,33,122,.10)!important;display:grid!important;grid-template-columns:auto 1fr auto!important;gap:9px!important;align-items:center!important;text-align:left!important}
.cons-supervisor-tile .cons-supervisor-icon{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:#eadcff;font-size:20px}.cons-supervisor-tile b,.cons-supervisor-tile small{display:block}.cons-supervisor-tile b{font-size:13px;font-weight:950}.cons-supervisor-tile small{font-size:9px;margin-top:4px;line-height:1.25;opacity:.76}.cons-supervisor-tile strong{font-size:22px}
.cons-launch>span{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:#0f1b2b;color:#fff;font-size:22px}.cons-launch div{flex:1}.cons-launch b,.cons-launch small{display:block}.cons-launch b{font-size:17px}.cons-launch small{color:#64748b;margin-top:3px}.cons-launch i{font-size:28px;color:#94a3b8}
.cons-page{max-width:1100px}.cons-depts,.cons-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.cons-actions{grid-template-columns:repeat(2,1fr)}
.cons-dept,.cons-action{min-height:128px;padding:18px;border:1px solid #dfe5ec;background:#fff;color:#0f1b2b;border-radius:18px;text-align:left;box-shadow:0 5px 18px rgba(15,27,43,.07)}
.cons-dept span{display:block;font-size:30px;margin-bottom:12px}.cons-dept b,.cons-dept small,.cons-action b,.cons-action small{display:block}.cons-dept b,.cons-action b{font-size:17px}.cons-dept small,.cons-action small{margin-top:7px;color:#64748b;line-height:1.35}.cons-dept.disabled{opacity:.72}
.cons-action{border-top:4px solid #64748b}.cons-action.issued{border-top-color:#2563eb}.cons-action.actual{border-top-color:#15803d}.cons-action.additional{border-top-color:#ca8a04}.cons-action.search{border-top-color:#7c3aed}.cons-action.manager{border-top-color:#d5a62e}
.cons-entry-shell{display:grid;gap:14px}.cons-sync-pill{margin-left:auto;padding:6px 9px;border-radius:999px;font-size:9px;font-weight:950;white-space:nowrap;border:1px solid #d5dde8}.cons-sync-pill.ok{background:#eaf9ef;color:#166534;border-color:#b8e3c4}.cons-sync-pill.sync{background:#fff7df;color:#7a4c00;border-color:#f2d28f}.cons-sync-pill.off{background:#fee2e2;color:#991b1b;border-color:#fecaca}.cons-vehicle-sticky{position:sticky;top:0;z-index:6}.cons-confirm-total{display:flex;justify-content:space-between;align-items:center;padding:13px 14px;border:2px solid #166534;border-radius:12px;background:#ecfdf5;color:#14532d}.cons-confirm-total b{font-size:18px}.cons-jc-access{display:grid;gap:7px}.cons-jc-access label{font-weight:900;color:#334155}.cons-jc-results{display:grid;gap:5px;max-height:230px;overflow:auto;padding:6px;border:1px solid #dbe3ee;border-radius:12px;background:#f8fafc}.cons-jc-results.hidden{display:none!important}.cons-jc-result{display:grid!important;grid-template-columns:1fr auto!important;width:100%!important;margin:0!important;padding:9px 10px!important;border:1px solid #e2e8f0!important;border-radius:9px!important;background:#fff!important;color:#172033!important;text-align:left!important;box-shadow:none!important}.cons-jc-result b{font-size:12px}.cons-jc-result span{font-size:11px;color:#334155;font-weight:800}.cons-jc-result small{grid-column:1/3;font-size:10px;color:#64748b;margin-top:2px}.cons-jc-empty{padding:10px;text-align:center;color:#64748b}.cons-vehicle-card{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:10px;border:1px solid #a7d7bd;border-radius:12px;background:#f0fdf4}.cons-vehicle-card>div{min-width:0;padding:7px 8px;border-radius:8px;background:#fff;border:1px solid #dcfce7}.cons-vehicle-card .wide{grid-column:1/-1}.cons-vehicle-card small,.cons-vehicle-card b{display:block}.cons-vehicle-card small{font-size:8px;color:#64748b;font-weight:900}.cons-vehicle-card b{font-size:11px;color:#174526;margin-top:2px;overflow-wrap:anywhere}.cons-entry-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cons-entry-grid label{font-weight:800;color:#334155}.cons-entry-grid input,.cons-entry-grid select{width:100%;margin-top:5px}.cons-line-editor{display:grid;grid-template-columns:2fr 1.4fr 1fr auto;gap:8px;align-items:center}.cons-line-editor>*{width:100%}.cons-table{overflow:auto}.cons-table table{min-width:650px;width:100%}.cons-entry-actions{display:flex;justify-content:space-between;gap:10px}.cons-entry-actions button:disabled{opacity:.45;cursor:not-allowed}.cons-draft-cards{display:none}.cons-draft-card{padding:10px;border:1px solid #dfe5ec;border-radius:11px;background:#fff}.cons-draft-card b,.cons-draft-card small,.cons-draft-card strong{display:block}.cons-draft-card small{margin-top:2px;color:#64748b}.cons-draft-card strong{margin-top:6px}.cons-draft-card>div{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.cons-draft-card button{margin:0;min-height:40px}.cons-searchbar{display:grid;grid-template-columns:1fr auto;gap:8px}.cons-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;padding:12px;border:1px solid #dfe5ec;border-radius:12px;background:#f8fafc}.cons-summary b{grid-column:1/-1;font-size:18px}.cons-add-history{display:grid;gap:8px;padding:10px}.cons-add-history>div{padding:10px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}.cons-export-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.cons-master-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;align-items:end}.cons-master-form>*{min-width:0}.cons-master-form button{min-height:46px}.cons-master-form label{font-weight:800;font-size:12px}.cons-master-form label input{width:100%;margin-top:4px}.cons-price-history{margin-top:12px;padding:12px;border:1px solid #dfe5ec;border-radius:12px;overflow:auto}.cons-price-history table{width:100%;border-collapse:collapse}.cons-price-history th,.cons-price-history td{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left}.cons-price-change{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;margin-top:10px}.cons-price-change>*{min-width:0;width:100%;box-sizing:border-box}.cons-price-change button{min-height:46px}.cons-report-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}.cons-report-filters>*{min-width:0}.cons-report-filters label{font-size:12px;font-weight:800}.cons-report-filters label input{width:100%;margin-top:4px}.cons-report-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.cons-report-kpis.paint{grid-template-columns:repeat(4,minmax(0,1fr))}.cons-paint-report-list{display:none}.cons-paint-card{padding:12px;border:1px solid #dfe5ec;border-radius:14px;background:#fff;box-shadow:0 3px 10px rgba(15,27,43,.05)}.cons-paint-card .head{display:flex;justify-content:space-between;gap:8px}.cons-paint-card>strong,.cons-paint-card>small{display:block;margin-top:5px}.cons-paint-card .metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:9px}.cons-paint-card .metrics span{padding:7px;border-radius:9px;background:#f8fafc;font-size:10px}.cons-paint-card .metrics b{display:block;font-size:12px;margin-top:2px}.cons-report-kpis>div{padding:12px;border:1px solid #dfe5ec;border-radius:12px;background:#f8fafc}.cons-report-kpis b,.cons-report-kpis span{display:block}
@media(min-width:901px){
.modal-backdrop:has(#consMasterWorkspace) .modal-box{width:96vw!important;max-width:1500px!important;max-height:92vh!important;padding:24px!important}
.modal-backdrop:has(#consMasterWorkspace){padding:12px!important}
#consMasterWorkspace{width:100%;min-width:0}
#consMasterWorkspace .cons-master-form{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px 14px!important}
#consMasterWorkspace .cons-master-form input,#consMasterWorkspace .cons-master-form select,#consMasterWorkspace .cons-master-form button{min-height:48px!important;font-size:15px!important}
#consMasterWorkspace #cmList{max-height:65vh;overflow:auto}
}
@media(min-width:901px){
body.cons-master-open .modal{width:min(96vw,1500px)!important;max-width:1500px!important}
body.cons-master-open .modal-content,body.cons-master-open .modal-body{max-width:none!important}
body.cons-master-open .cons-page{width:100%}
body.cons-master-open .cons-master-form{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px}
body.cons-master-open .cons-master-form input,body.cons-master-open .cons-master-form select,body.cons-master-open .cons-master-form button{min-height:46px;font-size:15px}
body.cons-master-open #cmList{max-height:62vh;overflow:auto}
}
@media(max-width:700px){.cons-depts,.cons-actions,.cons-entry-grid{grid-template-columns:1fr}.cons-vehicle-card{grid-template-columns:repeat(2,minmax(0,1fr))}.cons-line-editor{grid-template-columns:1fr 1fr}.cons-line-editor input,.cons-line-editor button{min-height:48px}.cons-dept,.cons-action{min-height:105px}.cons-launch{margin-top:6px}}
`;document.head.appendChild(css);
const oldRender=window.render;
if(typeof oldRender==='function')window.render=function(){const r=oldRender.apply(this,arguments);setTimeout(addLaunchCard,0);return r};
setTimeout(addLaunchCard,100);
})();