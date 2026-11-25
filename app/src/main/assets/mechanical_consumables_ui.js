(function(){
'use strict';
const sections={
  issued:{title:'Issued Materials',desc:'Issue materials directly to a Mechanical Job Card; issuing is final.'},
  additional:{title:'Additional Materials',desc:'Issue extra materials directly to an existing Mechanical Job Card; each issue is final.'},
  returns:{title:'Return Materials',desc:'Return unused issued quantities with audited cost credit.'},
  search:{title:'Search Material List',desc:'Browse the existing Consumables Materials and Brand Master.'},
  totals:{title:'Total Consumables',desc:'Review Mechanical Job Card material totals when stock integration is active.'},
  master:{title:'Brands & Price',desc:'Manager: create material, add brands, set unit, category, price and effective date.',managerOnly:true},
  materialHistory:{title:'Search Material / Price History',desc:'Manager: view shared brands, unit and complete price history.',managerOnly:true}
};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canManage=()=>{const user=typeof me!=='undefined'&&me?me:window.me;return user?.role==='Manager'};
const canView=()=>{
 const r=(typeof me!=='undefined'&&me?me.role:window.me?.role);
 return r==='Manager'||r==='Supervisor'||r==='Mechanical Supervisor';
};
let departmentPairs=null;
let sectionRequest=0;
function master(){
 // Read the existing Material and Brand Master. Never store a duplicate catalog.
 const c=(typeof state!=='undefined'&&state?.consumables)||{};
 const materials=(Array.isArray(c.materials)?c.materials:[]).filter(x=>x&&x.active!==false&&(departmentPairs!==null||['Mechanical','Both'].includes(x.department)));
 const brands=(Array.isArray(c.brands)?c.brands:[]).filter(x=>x&&x.active!==false);
 const prices=Array.isArray(c.prices)?c.prices:[];
 const rows=[];
 for(const material of materials){
   const linked=new Set(prices.filter(p=>p&&!p.voided&&p.materialId===material.id&&(!departmentPairs||departmentPairs.has(JSON.stringify([p.materialId,p.brandId])))).map(p=>String(p.brandId)));
   if(linked.size){
     for(const brand of brands.filter(x=>linked.has(String(x.id))))rows.push({
       material:material.name,brand:brand.name,unit:material.unit||'',id:material.id,brandId:brand.id
     });
   }else if(!departmentPairs){
     rows.push({material:material.name,brand:'Not assigned',unit:material.unit||'',id:material.id,brandId:''});
   }
 }
 return rows.sort((a,b)=>a.material.localeCompare(b.material)||a.brand.localeCompare(b.brand));
}
const consDepartmentMenuStyle="<style>.cons-department-menu{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:4px 0}.cons-department-menu button.cons-action,.cons-department-menu button.mc-cons-tile{position:relative;display:flex!important;flex-direction:column;align-items:flex-start;justify-content:center;gap:9px;min-width:0;min-height:106px!important;padding:13px!important;border:1px solid #b5c9df!important;border-bottom:4px solid #b5c9df!important;border-radius:16px!important;background:#eaf2fb!important;color:#173653!important;text-align:left;box-shadow:0 4px 12px #17365312}.cons-department-menu button.actual{background:#e6f5ed!important;border-color:#add6bd!important;color:#18563b!important}.cons-department-menu button.additional{background:#fff1d9!important;border-color:#e5c582!important;color:#70460e!important}.cons-department-menu button.search{background:#f1eafa!important;border-color:#cdb8e5!important;color:#53347c!important}.cons-department-menu button.manager{background:#e8f5f6!important;border-color:#afd5d8!important;color:#20555e!important}.cons-department-menu b{font-size:16px!important;font-weight:800;line-height:1.28;color:inherit!important;overflow-wrap:anywhere}.cons-department-menu .cons-menu-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#ffffffaa;font-size:19px;color:inherit}.cons-department-menu button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}@media(max-width:360px){.cons-department-menu{gap:8px}.cons-department-menu button{padding:10px!important}.cons-department-menu b{font-size:14px!important}}</style>";
const style='<style>'+
 '.mc-cons{max-width:1100px;margin:auto;color:#1e3046;font-family:inherit}'+
 '.mc-cons .mc-cons-toolbar{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}'+
 '.mc-cons button{min-height:44px;border-radius:10px;cursor:pointer;font-weight:700}'+
 '.mc-cons .mc-cons-secondary{background:#f2f7fc;color:#15528b;border:1px solid #b6cee2;padding:8px 12px}'+
 '.mc-cons .mc-cons-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}'+
 '.mc-cons .mc-cons-tile{min-height:96px;padding:12px;border:1px solid #dfe5ec;border-top:4px solid #64748b;background:#fff!important;color:#0f1b2b!important;border-radius:18px;text-align:left;box-shadow:0 5px 18px rgba(15,27,43,.07)}.mc-cons .mc-cons-tile.issued{border-top-color:#2563eb}.mc-cons .mc-cons-tile.actual{border-top-color:#15803d}.mc-cons .mc-cons-tile.additional{border-top-color:#ca8a04}.mc-cons .mc-cons-tile.search{border-top-color:#7c3aed}.mc-cons .mc-cons-tile.manager{border-top-color:#d5a62e}'+
 '.mc-cons .mc-cons-tile b,.mc-cons .mc-cons-tile small{display:block}'+
 '.mc-cons .mc-cons-tile b{font-size:17px;color:#0f1b2b!important}.mc-cons .mc-cons-tile small{margin-top:7px;font-size:12px;color:#64748b!important;line-height:1.35}'+
 '.mc-cons .mc-cons-card{border:1px solid #d1deeb;border-radius:11px;padding:13px;margin:10px 0;background:#fff}'+
 '.mc-cons .mc-cons-muted{color:#4d657b;font-size:13px;line-height:1.5}'+
 '.mc-cons .mc-cons-alert{border-left:4px solid #e1a640;background:#fff8e8;padding:12px;margin:12px 0;color:#694b18}'+
 '.mc-cons input{display:block;border:1px solid #aebfd1;border-radius:9px;padding:10px;font-size:16px;width:100%;box-sizing:border-box;background:white;color:#1e3046}'+
 ' .mc-cons label{font-size:13px;font-weight:700;display:block;margin:8px 0 5px}'+
 '.mc-cons select{display:block;border:1px solid #aebfd1;border-radius:9px;padding:10px;font-size:16px;width:100%;box-sizing:border-box;background:white;color:#1e3046}'+
 '@media(max-width:700px){.mc-cons .mc-cons-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mc-cons .mc-cons-tile{min-height:105px}}'+
 '</style>';
function open(title,body){
 if(typeof window.openModal!=='function')return;
 window.openModal(style+'<section class="mc-cons">'+
  '<div class="mc-cons-toolbar"><button class="mc-cons-secondary" type="button" onclick="openConsumablesModule()">← Consumables</button>'+
  '<button class="mc-cons-secondary" type="button" onclick="closeModal()">✕ Close</button></div>'+
  '<h2>⚙️ Mechanical Consumables</h2>'+
  (title?'<h3>'+escapeHtml(title)+'</h3>':'')+body+'</section>');
}
function menu(){
 if(!canView())return;
 sectionRequest++;
 // Stock has its own department chooser; do not duplicate the shortcut here.
 const tileColor={issued:'issued',additional:'additional',returns:'actual',search:'search',totals:'search',master:'manager',materialHistory:'manager'};
 const entries=Object.entries(sections).filter(([key,s])=>key!=='master'&&(!s.managerOnly||canManage())).map(([key,s])=>
  '<button type="button" class="mc-cons-tile '+tileColor[key]+'" onclick="openMechanicalConsumablesSection(\''+key+'\')">'+
  '<span class="cons-menu-icon" aria-hidden="true">'+({issued:'📦',additional:'＋',returns:'↩',search:'⌕',totals:'▤',materialHistory:'◷'}[key]||'◇')+'</span><b>'+escapeHtml(s.title)+'</b></button>').join('');
 open('',consDepartmentMenuStyle+'<div class="mc-cons-list cons-department-menu">'+entries+'</div>'+
  (canIssue()?'':'<p class="mc-cons-alert">Mechanical issuing is not active on this server.</p>'));
}
function catalog(){
 return '<label for="mcConsFilter">Search material or brand</label>'+
 '<input id="mcConsFilter" type="search" placeholder="Type material or brand" oninput="mechanicalConsumablesFilter()">'+
 '<div id="mcConsRows" class="mc-cons-card" aria-live="polite"></div>';
}
function renderMaterialRows(){
 if(!canView())return;
 const input=document.getElementById('mcConsFilter'),output=document.getElementById('mcConsRows');
 if(!output)return;
 const q=String(input?.value||'').trim().toLowerCase();
 const all=master(),filtered=all.filter(x=>(x.material+' '+x.brand+' '+x.unit).toLowerCase().includes(q));
 const limited=filtered.slice(0,30);
 output.innerHTML='<p class="mc-cons-muted">'+filtered.length+' matching material/brand combinations'+
  (filtered.length>30?' · showing first 30 — refine your search':'')+'</p>'+
  (limited.length?limited.map(x=>'<div style="padding:9px 0;border-top:1px solid #e7eef5">'+
    '<b>'+escapeHtml(x.material)+'</b> <span class="mc-cons-muted"> — '+escapeHtml(x.brand)+' · '+escapeHtml(x.unit)+'</span></div>').join(''):
   '<p class="mc-cons-muted">No matching materials in the current master.</p>');
}
function brandPreview() {
 if(!canView())return;
 const material=document.getElementById('mcConsMaterial');
 const target=document.getElementById('mcConsBrand');
 const unit=document.getElementById('mcConsUnit');
 if(!material||!target)return;
 const records=master().filter(x=>String(x.id)===String(material.value)&&x.brandId);
 target.innerHTML=records.length
   ? records.map(x=>'<option value="'+escapeHtml(x.brandId)+'">'+escapeHtml(x.brand)+'</option>').join('')
   : '<option value="">No brand recorded for this material</option>';
 if(unit)unit.textContent='Unit: '+(records[0]?.unit||'Select a material with a brand');
 loadBalance();
 const qtyLabel=document.querySelector?.('label[for="mcConsQuantity"]');
 if(qtyLabel)qtyLabel.textContent='Quantity ('+(records[0]?.unit||'—')+')';
}
function issueSelector(){
 // A single material can have many selectable brands; never coalesce stock by name.
 const rows=master(),unique=[...new Map(rows.map(x=>[String(x.id),x])).values()];
 const materialOpts=unique.map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.material)+'</option>').join('');
 const first=unique[0],brands=first?rows.filter(x=>String(x.id)===String(first.id)&&x.brandId):[];
 return '<div class="mc-cons-card"><b>Material / brand (read-only selection preview)</b>'+
  '<label for="mcConsMaterial">Material / Grade</label>'+
  '<select id="mcConsMaterial" onchange="mechanicalConsumablesSelectMaterial()">'+materialOpts+'</select>'+
  '<label for="mcConsBrand">Brand</label>'+
  '<select id="mcConsBrand" onchange="mechanicalConsumablesRefreshBalance()">'+brands.map(x=>'<option value="'+escapeHtml(x.brandId)+'">'+escapeHtml(x.brand)+'</option>').join('')+'</select>'+
  '<p id="mcConsUnit" class="mc-cons-muted">Unit: '+escapeHtml(first?.unit||'Not available')+'</p>'+
  '<p class="mc-cons-muted">Every material and brand combination will have its own stock balance and purchase cost. Save remains disabled until the secure Mechanical issue workflow is connected.</p></div>';
}

const draftLines=[];
let currentIssueKind='issued',pendingIssue=null,sending=false,balanceRead=0;
const canIssue=()=>{
 const u=typeof me!=='undefined'&&me?me:window.me;
 return ['Manager','Mechanical Supervisor'].includes(u?.role)&&
   window.ZUKAIT_MECHANICAL_STOCK_ENABLED===true&&
   typeof window.zukaitCloud?.stockRequest==='function';
};
function addIssueLine(){
 if(!canView())return;
 if(pendingIssue||sending)return;
 const m=document.getElementById('mcConsMaterial')?.value;
 const b=document.getElementById('mcConsBrand')?.value;
 const raw=String(document.getElementById('mcConsQuantity')?.value||'').trim();
 const row=master().find(x=>String(x.id)===m&&String(x.brandId)===b);
 const n=Number(raw);
 const warn=document.getElementById('mcConsWarning');
 const fail=msg=>{if(warn)warn.textContent=msg};
 if(!row||!b)return fail('Choose a material and its brand.');
 if(!raw||!Number.isFinite(n)||n<=0||!Number.isInteger(n*10000))
   return fail('Enter a valid quantity, up to four decimal places.');
 if(row.unit==='Piece'&&!Number.isInteger(n))return fail('Pieces must be whole numbers.');
 if(draftLines.length>=20)return fail('Maximum 20 lines per issue.');
 if(draftLines.some(x=>x.materialId===m&&x.brandId===b))return fail('Material and brand already added. Remove it before changing the quantity.');
 draftLines.push({materialId:m,brandId:b,material:row.material,brand:row.brand,unit:row.unit,quantity:n});
 if(warn)warn.textContent='';
 const qty=document.getElementById('mcConsQuantity');if(qty)qty.value='';
 renderDraft();
}
function removeIssueLine(index){
 if(!canView()||pendingIssue||sending||!Number.isInteger(index)||index<0||index>=draftLines.length)return;
 draftLines.splice(index,1);
 renderDraft();
}
function renderDraft(){
 const target=document.getElementById('mcConsDraft');if(!target)return;
 target.innerHTML=!draftLines.length?'<p class="mc-cons-muted">No materials added yet.</p>':
   draftLines.map((x,i)=>'<div class="mc-cons-toolbar" style="padding:8px 0;border-bottom:1px solid #dce6f1">'+
   '<span><b>'+escapeHtml(x.material)+'</b> — '+escapeHtml(x.brand)+' · '+escapeHtml(x.quantity)+' '+escapeHtml(x.unit)+'</span>'+
   '<button class="mc-cons-secondary" type="button" onclick="mechanicalConsumablesRemoveLine('+i+')">Remove</button></div>').join('');
 const submit=document.getElementById('mcConsSubmit');
 if(submit)submit.disabled=!canIssue()||draftLines.length===0||sending;
}

async function loadBalance(){
 const out=document.getElementById('mcConsAvailable');
 if(!out||!canIssue())return;
 const materialId=document.getElementById('mcConsMaterial')?.value;
 const brandId=document.getElementById('mcConsBrand')?.value;
 const generation=++balanceRead;
 if(!materialId||!brandId){out.textContent='Choose a material and brand.';return}
 out.textContent='Checking available stock…';
 try{
   const r=await window.zukaitCloud.stockRequest({operation:'BALANCE',materialId,brandId});
   if(generation!==balanceRead||!document.getElementById('mcConsAvailable'))return;
   if(!r?.ok)throw Error(r?.code||'Stock not available');
   const item=r.item;
   out.textContent=item?'Available: '+Number(item.physical-item.reserved).toFixed(2)+' '+item.unit:
     'No opening stock recorded for this brand.';
 }catch(_){
   if(generation===balanceRead&&out)out.textContent='Stock unavailable. No issue has been made.';
 }
}
async function submitIssue(){
 if(!canIssue()||sending||!draftLines.length)return;
 const jc=String(document.getElementById('mcConsJc')?.value||'').trim().toUpperCase();
 const warn=document.getElementById('mcConsWarning');
 if(!/^[A-Z0-9_. -]{1,36}$/.test(jc)){if(warn)warn.textContent='Enter a valid Mechanical Job Card number.';return}
 if(typeof navigator!=='undefined'&&navigator.onLine===false){
   if(warn)warn.textContent='Offline. Nothing was issued.';return;
 }
 const data={jobCard:jc,kind:currentIssueKind,
    lines:draftLines.map(x=>({materialId:x.materialId,brandId:x.brandId,quantity:x.quantity}))};
 const fingerprint=JSON.stringify(data);
 if(pendingIssue&&pendingIssue.fingerprint!==fingerprint){
   if(warn)warn.textContent='Issue details changed after an uncertain save. Reopen the screen and review the Job Card before retrying.';return;
 }
 if(!pendingIssue){
   const id=(typeof crypto!=='undefined'&&crypto.randomUUID)?
     crypto.randomUUID():'mechanical-'+Date.now()+'-'+Math.random().toString(36).slice(2);
   pendingIssue={requestId:id,fingerprint};
 }
 sending=true;renderDraft();
 try{
   const r=await window.zukaitCloud.stockRequest({
     operation:'WRITE',command:'MECHANICAL_ISSUE',
     requestId:pendingIssue.requestId,data
   });
   if(!r?.ok||r.receipt?.final!==true||String(r.receipt.jobCard)!==jc
      ||Number(r.receipt.lineCount)!==draftLines.length)throw Error(r?.code||'No confirmed issue receipt');
   draftLines.length=0;pendingIssue=null;
   if(warn)warn.textContent='ISSUED — '+jc+' · '+Number(r.receipt.totalCost||0).toFixed(3)+' OMR. Final.';
   loadBalance();
 }catch(e){
   if(warn)warn.textContent='Issue not confirmed: '+String(e?.message||e)+'. Retry uses the same request ID.';
 }finally{sending=false;renderDraft()}
}
function issueForm(){
 // Local draft only; stock and JC costs are not changed until a server transaction is available.
 const rows=master(),first=rows[0],unique=[...new Map(rows.map(x=>[String(x.id),x])).values()];
 const brands=first?rows.filter(x=>String(x.id)===String(first.id)&&x.brandId):[];
 return '<div class="mc-cons-card">'+
   '<label for="mcConsJc">Mechanical Job Card</label>'+
   '<input id="mcConsJc" autocomplete="off" placeholder="JC number">'+
   '<label for="mcConsMaterial">Material</label>'+
   '<select id="mcConsMaterial" onchange="mechanicalConsumablesSelectMaterial()">'+
   unique.map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.material)+'</option>').join('')+'</select>'+
   '<label for="mcConsBrand">Brand</label>'+
   '<select id="mcConsBrand">'+brands.map(x=>'<option value="'+escapeHtml(x.brandId)+'">'+escapeHtml(x.brand)+'</option>').join('')+'</select>'+
   '<label for="mcConsQuantity">Quantity'+(first?.unit?' ('+escapeHtml(first.unit)+')':'')+'</label>'+
   '<input id="mcConsQuantity" inputmode="decimal" type="number" min="0.0001" step="any" placeholder="Enter quantity">'+
   '<p id="mcConsUnit" class="mc-cons-muted">Unit: '+escapeHtml(first?.unit||'—')+'</p>'+
   '<button class="mc-cons-secondary" type="button" onclick="mechanicalConsumablesAddLine()">+ Add Material</button>'+
   '<p id="mcConsWarning" role="status" class="mc-cons-muted"></p>'+
   '<div id="mcConsDraft"></div>'+
   '<p id="mcConsAvailable" class="mc-cons-muted">'+(canIssue()?'Checking available stock…':'Available stock will show when issuing is enabled.')+'</p>'+ 
   '<button id="mcConsSubmit" type="button" '+(canIssue()?'onclick="mechanicalConsumablesSubmitIssue()"':'title="Secure stock issuing is not enabled yet"')+' disabled style="display:block;width:100%;background:#64748b;color:white;padding:12px;margin-top:12px">ISSUE MATERIALS'+(canIssue()?'':' (not enabled)')+'</button>'+ 
   '<p class="mc-cons-muted">Once enabled, one server-confirmed issue will be final. No separate Actual or finalisation.</p></div>';
}
async function section(id){
 if(!canView())return;
 const s=sections[id];if(!s||s.managerOnly&&!canManage())return menu();
 if(id==='master')return window.consOpenMaster?.('mechanical');
 if(id==='materialHistory')return window.consOpenMaterialSearch?.('mechanical');
 const back='<button class="mc-cons-secondary" type="button" onclick="openMechanicalConsumables()">← Mechanical menu</button>';
 if(['search','issued','additional'].includes(id)&&window.zukaitStockPickerEnabled?.()){
   const request=++sectionRequest;
   departmentPairs=new Set();
   open(s.title,back+'<p id="mcConsLoading" class="mc-cons-muted">Loading Mechanical materials…</p>');
   try{
     const pairs=await window.zukaitStockPickerPairs('Mechanical');
     if(request!==sectionRequest||!canView()||!document.getElementById('mcConsLoading'))return;
     departmentPairs=pairs??new Set();
   }catch{
     if(request===sectionRequest&&canView()&&document.getElementById('mcConsLoading'))open(s.title,back+'<p class="mc-cons-alert">Mechanical materials could not be loaded. Try again.</p>');
     return;
   }
 }else{
   sectionRequest++;
   departmentPairs=null;
 }
 if(id==='search'){
   open(s.title,back+'<p class="mc-cons-muted">Uses the existing Consumables Materials and Brand Master. No extra materials table or Supabase history download.</p>'+catalog());
   renderMaterialRows();return;
 }
 if(id==='returns'){
   open(s.title,back+'<p class="mc-cons-muted">Unused Mechanical materials return to stock against the original final issue; the original issue remains in history.</p>'+ 
     '<div class="mc-cons-card"><label for="mcConsJc">Mechanical Job Card Number</label>'+ 
     '<input id="mcConsJc" type="text" placeholder="Enter Mechanical JC number" autocomplete="off">'+ 
     '<p class="mc-cons-muted">After backend integration, choose the original issued line, enter return quantity and reason, and confirm an audited reversal at the locked issue cost.</p></div>'+ 
     '<div class="mc-cons-alert">Returns are not active yet. No material quantity, cost or Job Card has been changed.</div>');
   return;
 }
 if(id==='totals'){
   open(s.title,back+'<div class="mc-cons-alert">Mechanical material totals cannot be calculated until the Mechanical Job Card material transactions are connected and verified. Existing Painting totals are not shown here.</div>'+
     '<button class="mc-cons-secondary" onclick="openMechanicalConsumablesSection(\'search\')">Browse Material Master</button>');
   return;
 }
 draftLines.length=0;pendingIssue=null;sending=false;currentIssueKind=id;
 open(s.title,back+issueForm()+
   (canIssue()?'':'<div class="mc-cons-alert">Preview only: no materials have been issued or deducted from stock.</div>'));
 renderDraft();loadBalance();
}
window.openMechanicalConsumables=menu;
window.openMechanicalConsumablesSection=section;
window.mechanicalConsumablesFilter=renderMaterialRows;
window.mechanicalConsumablesSelectMaterial=brandPreview;
window.mechanicalConsumablesAddLine=addIssueLine;
window.mechanicalConsumablesRemoveLine=removeIssueLine;
window.mechanicalConsumablesRefreshBalance=loadBalance;
window.mechanicalConsumablesSubmitIssue=submitIssue;
})();
