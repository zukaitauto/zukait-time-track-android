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
 return r==='Manager'||r==='Supervisor';
};
function master(){
 // Read the existing Material and Brand Master. Never store a duplicate catalog.
 const c=(typeof state!=='undefined'&&state?.consumables)||{};
 const materials=(Array.isArray(c.materials)?c.materials:[]).filter(x=>x&&x.active!==false);
 const brands=(Array.isArray(c.brands)?c.brands:[]).filter(x=>x&&x.active!==false);
 const prices=Array.isArray(c.prices)?c.prices:[];
 const rows=[];
 for(const material of materials){
   const linked=new Set(prices.filter(p=>p&&!p.voided&&p.materialId===material.id).map(p=>String(p.brandId)));
   if(linked.size){
     for(const brand of brands.filter(x=>linked.has(String(x.id))))rows.push({
       material:material.name,brand:brand.name,unit:material.unit||'',id:material.id,brandId:brand.id
     });
   }else{
     rows.push({material:material.name,brand:'Not assigned',unit:material.unit||'',id:material.id,brandId:''});
   }
 }
 return rows.sort((a,b)=>a.material.localeCompare(b.material)||a.brand.localeCompare(b.brand));
}
const style='<style>'+
 '.mc-cons{max-width:920px;margin:auto;color:#1e3046;font-family:inherit}'+
 '.mc-cons .mc-cons-toolbar{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}'+
 '.mc-cons button{min-height:44px;border-radius:10px;cursor:pointer;font-weight:700}'+
 '.mc-cons .mc-cons-secondary{background:#f2f7fc;color:#15528b;border:1px solid #b6cee2;padding:8px 12px}'+
 '.mc-cons .mc-cons-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}'+
 '.mc-cons .mc-cons-tile{padding:14px;border:1px solid #bad1e2;background:#f6faff;color:#1e4266;text-align:left}'+
 '.mc-cons .mc-cons-tile b,.mc-cons .mc-cons-tile small{display:block}'+
 '.mc-cons .mc-cons-tile b{font-size:15px}.mc-cons .mc-cons-tile small{margin-top:8px;font-size:12px;color:#4a647b;line-height:1.4}'+
 '.mc-cons .mc-cons-card{border:1px solid #d1deeb;border-radius:11px;padding:13px;margin:10px 0;background:#fff}'+
 '.mc-cons .mc-cons-muted{color:#4d657b;font-size:13px;line-height:1.5}'+
 '.mc-cons .mc-cons-alert{border-left:4px solid #e1a640;background:#fff8e8;padding:12px;margin:12px 0;color:#694b18}'+
 '.mc-cons input{display:block;border:1px solid #aebfd1;border-radius:9px;padding:10px;font-size:16px;width:100%;box-sizing:border-box;background:white;color:#1e3046}'+
 ' .mc-cons label{font-size:13px;font-weight:700;display:block;margin:8px 0 5px}'+
 '.mc-cons select{display:block;border:1px solid #aebfd1;border-radius:9px;padding:10px;font-size:16px;width:100%;box-sizing:border-box;background:white;color:#1e3046}'+
 '@media(max-width:360px){.mc-cons .mc-cons-list{grid-template-columns:1fr}}'+
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
 const entries=Object.entries(sections).filter(([,s])=>!s.managerOnly||canManage()).map(([key,s])=>
  '<button type="button" class="mc-cons-tile" onclick="openMechanicalConsumablesSection(\''+key+'\')">'+
  '<b>'+escapeHtml(s.title)+'</b><small>'+escapeHtml(s.desc)+'</small></button>').join('');
 open('','<p class="mc-cons-muted">Mechanical materials are final when issued. No separate Actual Materials or finalisation step. Painting material records remain separate.</p>'+
  '<div class="mc-cons-list">'+entries+'</div>'+ 
  '<div class="mc-cons-card"><b>Mechanical unit examples</b><p class="mc-cons-muted">Engine Oil 5W-30, 20W-40, 5W-40 — Litre (L)<br>WD-40 — Piece (can)<br>Coolant — gallon container (pack size identified in material name)</p></div>'+ 
  '<p class="mc-cons-alert">Mechanical issuing and immediate stock deduction are not connected yet. All issue screens remain read-only until the secure Mechanical Job Card and stock integration is enabled.</p>');
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
  '<select id="mcConsBrand">'+brands.map(x=>'<option value="'+escapeHtml(x.brandId)+'">'+escapeHtml(x.brand)+'</option>').join('')+'</select>'+
  '<p id="mcConsUnit" class="mc-cons-muted">Unit: '+escapeHtml(first?.unit||'Not available')+'</p>'+
  '<p class="mc-cons-muted">Every material and brand combination will have its own stock balance and purchase cost. Save remains disabled until the secure Mechanical issue workflow is connected.</p></div>';
}

const draftLines=[];
function addIssueLine(){
 if(!canView())return;
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
 if(!canView()||!Number.isInteger(index)||index<0||index>=draftLines.length)return;
 draftLines.splice(index,1);
 renderDraft();
}
function renderDraft(){
 const target=document.getElementById('mcConsDraft');if(!target)return;
 target.innerHTML=!draftLines.length?'<p class="mc-cons-muted">No materials added yet.</p>':
   draftLines.map((x,i)=>'<div class="mc-cons-toolbar" style="padding:8px 0;border-bottom:1px solid #dce6f1">'+
   '<span><b>'+escapeHtml(x.material)+'</b> — '+escapeHtml(x.brand)+' · '+escapeHtml(x.quantity)+' '+escapeHtml(x.unit)+'</span>'+
   '<button class="mc-cons-secondary" type="button" onclick="mechanicalConsumablesRemoveLine('+i+')">Remove</button></div>').join('');
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
   '<button type="button" disabled title="Secure stock issuing is not enabled yet" style="display:block;width:100%;background:#94a3b8;color:white;padding:12px;margin-top:12px">ISSUE MATERIALS (not enabled)</button>'+
   '<p class="mc-cons-muted">Once enabled, one server-confirmed issue will be final. No separate Actual or finalisation.</p></div>';
}
function section(id){
 if(!canView())return;
 const s=sections[id];if(!s||s.managerOnly&&!canManage())return menu();
 if(id==='master')return window.consOpenMaster?.('mechanical');
 if(id==='materialHistory')return window.consOpenMaterialSearch?.('mechanical');
 const back='<button class="mc-cons-secondary" type="button" onclick="openMechanicalConsumables()">← Mechanical menu</button>';
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
 draftLines.length=0;
 open(s.title,back+issueForm()+
   '<div class="mc-cons-alert">Preview only: no materials have been issued or deducted from stock.</div>');
}
window.openMechanicalConsumables=menu;
window.openMechanicalConsumablesSection=section;
window.mechanicalConsumablesFilter=renderMaterialRows;
window.mechanicalConsumablesSelectMaterial=brandPreview;
window.mechanicalConsumablesAddLine=addIssueLine;
window.mechanicalConsumablesRemoveLine=removeIssueLine;
})();
