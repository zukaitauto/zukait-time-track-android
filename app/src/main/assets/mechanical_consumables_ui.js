(function(){
'use strict';
const sections={
  issued:{title:'Issued Materials',desc:'Issue materials directly to a Mechanical Job Card; issuing is final.'},
  additional:{title:'Additional Materials',desc:'Issue extra materials directly to an existing Mechanical Job Card; each issue is final.'},
  search:{title:'Search Material List',desc:'Browse the existing Consumables Materials and Brand Master.'},
  totals:{title:'Total Consumables',desc:'Review Mechanical Job Card material totals when stock integration is active.'}
};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
       material:material.name,brand:brand.name,unit:material.unit||'',id:material.id
     });
   }else{
     rows.push({material:material.name,brand:'Not assigned',unit:material.unit||'',id:material.id});
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
 '.mc-cons label{font-size:13px;font-weight:700;display:block;margin:8px 0 5px}'+
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
 const entries=Object.entries(sections).map(([key,s])=>
  '<button type="button" class="mc-cons-tile" onclick="openMechanicalConsumablesSection(\''+key+'\')">'+
  '<b>'+escapeHtml(s.title)+'</b><small>'+escapeHtml(s.desc)+'</small></button>').join('');
 open('','<p class="mc-cons-muted">Mechanical materials are final when issued. No separate Actual Materials or finalisation step. Painting material records remain separate.</p>'+
  '<div class="mc-cons-list">'+entries+'</div>'+
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
function section(id){
 if(!canView())return;
 const s=sections[id];if(!s)return menu();
 const back='<button class="mc-cons-secondary" type="button" onclick="openMechanicalConsumables()">← Mechanical menu</button>';
 if(id==='search'){
   open(s.title,back+'<p class="mc-cons-muted">Uses the existing Consumables Materials and Brand Master. No extra materials table or Supabase history download.</p>'+catalog());
   renderMaterialRows();return;
 }
 if(id==='totals'){
   open(s.title,back+'<div class="mc-cons-alert">Mechanical material totals cannot be calculated until the Mechanical Job Card material transactions are connected and verified. Existing Painting totals are not shown here.</div>'+
     '<button class="mc-cons-secondary" onclick="openMechanicalConsumablesSection(\'search\')">Browse Material Master</button>');
   return;
 }
 const wording=id==='additional'?'Additional material issue (final immediately)':'Material issue (final immediately)';
 open(s.title,back+'<p class="mc-cons-muted">'+escapeHtml(s.desc)+'</p>'+
  '<div class="mc-cons-card"><label for="mcConsJc">Mechanical Job Card Number</label>'+
  '<input id="mcConsJc" type="text" placeholder="Enter Mechanical JC number" autocomplete="off">'+
  '<p class="mc-cons-muted">This is a screen layout only. '+wording+' cannot be saved until the separate Mechanical Job Card authority is connected. Once enabled, a confirmed issue will immediately deduct physical stock, lock its purchase cost, and count as final consumption.</p></div>'+
  '<div class="mc-cons-alert">No material is issued or deducted from stock on this preview screen. There is no separate Actual Materials finalisation.</div>'+
  '<button class="mc-cons-secondary" onclick="openMechanicalConsumablesSection(\'search\')">View Existing Materials</button>');
}
window.openMechanicalConsumables=menu;
window.openMechanicalConsumablesSection=section;
window.mechanicalConsumablesFilter=renderMaterialRows;
})();
