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
const consDepartmentMenuStyle="<style>.cons-department-menu{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:4px 0}.cons-department-menu button.cons-action,.cons-department-menu button.mc-cons-tile,.cons-department-menu button.cons-dept{box-sizing:border-box;position:relative;display:flex!important;flex-direction:column;align-items:flex-start;justify-content:center;gap:8px;min-width:0;min-height:100px!important;padding:13px 16px!important;margin:0!important;border:1px solid #e5dfe6!important;border-top:4px solid #db2777!important;border-radius:18px!important;background:linear-gradient(145deg,#fff,#fdf5f9)!important;color:#172033!important;text-align:left;box-shadow:0 4px 12px #17365312;white-space:normal!important}.cons-department-menu button b{font-size:16px!important;font-weight:800;line-height:1.28;color:#172033!important;overflow-wrap:break-word;min-width:0}.cons-department-menu .cons-menu-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#fce7f3;color:#be185d;margin:0!important;flex:0 0 auto}.cons-menu-icon svg{display:block;width:21px;height:21px}.cons-department-menu .cons-menu-arrow{position:absolute;top:18px;right:16px;width:15px;height:15px;color:#b76c90;font-size:18px;line-height:15px;margin:0!important}.cons-department-menu button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}.cons-department-menu button:disabled{opacity:.65;cursor:not-allowed}.cons-department-menu button small{margin:0!important;color:#64748b!important;font-size:12px;line-height:1.35}@media(max-width:600px){.cons-department-menu{grid-template-columns:1fr!important;gap:9px}.cons-department-menu button.cons-action,.cons-department-menu button.mc-cons-tile,.cons-department-menu button.cons-dept{min-height:76px!important;padding:10px 36px 10px 12px!important;display:grid!important;grid-template-columns:36px minmax(0,1fr);align-content:center;column-gap:11px;row-gap:4px}.cons-department-menu .cons-menu-icon{grid-row:1/3;align-self:center}.cons-department-menu button b,.cons-department-menu button small{grid-column:2}.cons-department-menu .cons-menu-arrow{top:50%;transform:translateY(-50%);right:12px}}</style>";
const consMenuGlyphs={"pending":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>","issued":"<path d=\"m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10\"/>","actual":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8 12 3 3 5-6\"/>","additional":"<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"3\"/><path d=\"M12 8v8M8 12h8\"/>","search":"<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m16 16 4 4\"/>","total":"<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/><path d=\"M8 8h8M8 12h8M8 16h8\"/>","reports":"<path d=\"M4 4v16h16M8 16v-5M12 16V7M16 16v-8\"/>","history":"<path d=\"M3 12a9 9 0 1 1 2.7 6.4M3 5v7h7M12 7v5l3 2\"/>","returns":"<path d=\"M9 7 4 12l5 5M4 12h10a5 5 0 0 1 5 5\"/>","painting":"<path d=\"M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H13a1.5 1.5 0 0 1 0-3h4a4 4 0 0 0 4-4c0-4-4-7-9-7z\"/><circle cx=\"7\" cy=\"10\" r=\".8\"/><circle cx=\"10\" cy=\"6.5\" r=\".8\"/><circle cx=\"15\" cy=\"7\" r=\".8\"/>","paint":"<path d=\"M15 3 21 9 11 19l-6-6zM5 13l-2 8 8-2\"/>","denting":"<path d=\"M14 4l6 6-3 3-3-3-8 10-3-3 9-9-2-2z\"/>","mechanical":"<path d=\"M14 6a5 5 0 0 0-6 6l-5 5 4 4 5-5a5 5 0 0 0 6-6l-3 3-4-4z\"/>","stock":"<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 9h18M3 15h18M12 9v11\"/>"};
function consMenuIcon(key){return '<span class="cons-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">'+(consMenuGlyphs[key]||consMenuGlyphs.search)+'</svg></span>'}
const consMenuArrow='<span class="cons-menu-arrow" aria-hidden="true">›</span>';
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
  consMenuIcon(({totals:'total',materialHistory:'history'})[key]||key)+'<b>'+escapeHtml(s.title)+'</b>'+consMenuArrow+'</button>').join('');
 open('',consDepartmentMenuStyle+'<div class="mc-cons-list cons-department-menu">'+entries+'</div>'+
  issueNotice()+(canIssue()?'':'<p class="mc-cons-alert">Mechanical issuing is not active on this server.</p>'));
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

const issueOwner=()=>{const u=typeof me!=='undefined'&&me?me:window.me;return u?.id&&['Manager','Mechanical Supervisor'].includes(u.role)?String(u.id)+'|'+u.role:''};
const issueKey=owner=>'zukait_mechanical_stock_pending_v1:'+encodeURIComponent(owner);
function readIssue(owner){
 if(!owner)throw Error('Staff identity unavailable');
 const raw=window.localStorage.getItem(issueKey(owner));if(!raw)return null;
 const entry=JSON.parse(raw);
 if(entry.owner!==owner||!entry.requestId||!entry.data||entry.fingerprint!==JSON.stringify(entry.data))throw Error('Saved issue receipt needs review');
 return entry;
}
function issueNotice(){
 if(!canIssue()||!issueOwner())return '';
 try{const entry=readIssue(issueOwner());return entry?'<div class="mc-cons-alert" role="alert">Unconfirmed material issue: '+escapeHtml(entry.data.jobCard)+'. Retry the original issue before creating another. <button type="button" onclick="mechanicalConsumablesRetryIssue()"'+(sending?' disabled':'')+'>Retry original issue</button></div>':'';}
 catch(_){return '<div class="mc-cons-alert">Saved issue storage unavailable. Material issuing is blocked.</div>';}
}

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
 if(!/^(?:\d+(?:\.\d{1,4})?|\.\d{1,4})$/.test(raw)||!Number.isFinite(n)||n<=0||n>Number.MAX_SAFE_INTEGER/10000)
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
 const retry=document.getElementById('mcConsRetry');if(retry)retry.innerHTML=issueNotice();
 const submit=document.getElementById('mcConsSubmit');
 if(submit)submit.disabled=!canIssue()||draftLines.length===0||sending||!!pendingIssue;
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
async function sendIssue(data,retry=false){
 if(!canIssue()||sending)return;
 const owner=issueOwner(),session=String(window.zukaitAuth?.getToken?.()||'');
 const current=()=>owner===issueOwner()&&session===String(window.zukaitAuth?.getToken?.()||'');
 const warn=document.getElementById('mcConsWarning');
 const message=msg=>{if(current()&&warn&&document.getElementById('mcConsWarning')===warn)warn.textContent=msg;else if(current())window.alert?.(msg)};
 if(typeof navigator!=='undefined'&&navigator.onLine===false){message('Offline. No new request sent.');return}
 let entry,wasPending=false;
 try{
  entry=readIssue(owner);wasPending=!!entry;
  const fingerprint=JSON.stringify(data);
  if(entry&&entry.fingerprint!==fingerprint)throw Error('Earlier issue is unconfirmed. Retry the original issue first');
  if(!entry){
    if(retry)throw Error('No saved issue to retry');
    entry={owner,data,fingerprint,requestId:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'mechanical-'+Date.now()+'-'+Math.random().toString(36).slice(2)};
    window.localStorage.setItem(issueKey(owner),JSON.stringify(entry));
    if(readIssue(owner)?.requestId!==entry.requestId)throw Error('Cannot preserve issue receipt');
  }
 }catch(e){message(String(e.message||e)+'. No new issue sent.');return}
 pendingIssue=entry;sending=true;renderDraft();
 try{
   if(!current())throw Error('Staff session changed');
   const r=await window.zukaitCloud.stockRequest({operation:'WRITE',command:'MECHANICAL_ISSUE',requestId:entry.requestId,data:entry.data});
   if(!r?.ok||r.receipt?.final!==true||String(r.receipt.jobCard)!==entry.data.jobCard||Number(r.receipt.lineCount)!==entry.data.lines.length){
     const definitive=['mechanical_stock_forbidden','mechanical_stock_not_enabled','stock_write_not_enabled','mechanical_job_not_found','invalid_mechanical_job','invalid_issue_lines','invalid_issue_line','invalid_issue_kind','duplicate_material_brand','piece_whole_required','insufficient_stock','opening_stock_required','stock_master_key_not_found','stock_unit_conflict'];
     if(!wasPending&&definitive.includes(r?.code)){window.localStorage.removeItem(issueKey(owner));pendingIssue=null;}
     throw Error(r?.code||'No confirmed issue receipt');
   }
   if(readIssue(owner)?.requestId===entry.requestId)window.localStorage.removeItem(issueKey(owner));
   if(!current())return;
   draftLines.length=0;pendingIssue=null;
   message('ISSUED — '+entry.data.jobCard+' · '+Number(r.receipt.totalCost||0).toFixed(3)+' OMR. Final.');
   if(!warn)menu();else loadBalance();
 }catch(e){message('Issue not confirmed: '+String(e?.message||e)+'. Retry uses the original receipt.');}
 finally{sending=false;if(current())renderDraft()}
}
async function submitIssue(){
 if(!canIssue()||sending||!draftLines.length)return;
 const jc=String(document.getElementById('mcConsJc')?.value||'').trim().toUpperCase();
 const warn=document.getElementById('mcConsWarning');
 if(!/^[A-Z0-9_. -]{1,36}$/.test(jc)){if(warn)warn.textContent='Enter a valid Mechanical Job Card number.';return}
 return sendIssue({jobCard:jc,kind:currentIssueKind,lines:draftLines.map(x=>({materialId:x.materialId,brandId:x.brandId,quantity:x.quantity}))});
}
window.mechanicalConsumablesRetryIssue=async()=>{
 if(!canIssue()||sending)return;
 try{const entry=readIssue(issueOwner());if(!entry)return;if(typeof window.confirm==='function'&&!window.confirm('Retry original material issue for '+entry.data.jobCard+'?'))return;return await sendIssue(entry.data,true);}
 catch(e){window.alert?.(String(e.message||e))}
};
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
   '<div id="mcConsRetry"></div><p id="mcConsWarning" role="status" class="mc-cons-muted"></p>'+
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
  if(!canIssue()||!issueOwner()){open(s.title,back+'<div class="mc-cons-alert">Mechanical returns are not enabled.</div>');return;}
  open(s.title,back+'<div class="mc-cons-card"><label for="mcConsReturnJc">Mechanical Job Card Number</label>'+
    '<input id="mcConsReturnJc" maxlength="36" autocomplete="off" placeholder="Enter Mechanical JC number">'+
    '<button type="button" id="mcConsReturnFind" onclick="mechanicalConsumablesFindReturnable(0)">Find issued materials</button>'+
    '<div id="mcConsReturnResult" role="status"></div>'+
    '<div id="mcConsReturnForm"></div><div id="mcConsReturnStatus" role="status"></div></div>');
  return;
 }
 if(id==='totals'){
  if(!canIssue()||!issueOwner()){open(s.title,back+'<div class="mc-cons-alert">Mechanical stock totals are not enabled.</div>');return;}
  open(s.title,back+'<div class="mc-cons-card"><label for="mcConsTotalsJc">Mechanical Job Card Number</label>'+
    '<input id="mcConsTotalsJc" type="text" maxlength="36" autocomplete="off" placeholder="Enter Mechanical JC number">'+
    '<button type="button" id="mcConsTotalsGo" onclick="mechanicalConsumablesShowTotals(0)">Show Total</button>'+
    '<div id="mcConsTotalsResult" role="status"></div></div>');
  return;
 }
 if(sending)return;
 draftLines.length=0;pendingIssue=null;currentIssueKind=id;
 if(canIssue()){try{pendingIssue=readIssue(issueOwner())}catch(_){pendingIssue={blocked:true}}}
 open(s.title,back+issueForm()+
   (canIssue()?'':'<div class="mc-cons-alert">Preview only: no materials have been issued or deducted from stock.</div>'));
 renderDraft();loadBalance();
}
let totalsGeneration=0;
async function showTotals(page=0){
 const input=document.getElementById('mcConsTotalsJc'),result=document.getElementById('mcConsTotalsResult'),button=document.getElementById('mcConsTotalsGo');
 if(!input||!result||!canIssue()||!issueOwner()||!Number.isInteger(page)||page<0||page>49)return;
 const jc=String(input.value||'').trim().toUpperCase();
 if(!/^[A-Z0-9_. -]{1,36}$/.test(jc)){result.textContent='Enter a valid Mechanical Job Card number.';return;}
 const owner=issueOwner(),generation=++totalsGeneration,section=sectionRequest,auth=String(window.zukaitAuth?.getToken?.()||'');
 button.disabled=true;result.textContent='Loading verified Mechanical totals…';
 try{
  const response=await window.zukaitCloud.stockRequest({operation:'MECHANICAL_TOTALS',jobCard:jc,page});
  if(generation!==totalsGeneration||section!==sectionRequest||!canIssue()||issueOwner()!==owner||String(window.zukaitAuth?.getToken?.()||'')!==auth||document.getElementById('mcConsTotalsResult')!==result||String(input.value||'').trim().toUpperCase()!==jc)return;
  const t=response?.totals;
  if(response?.ok!==true||t?.readOnly!==true||String(t.jobCard)!==jc||!Array.isArray(t.items))throw Error('Mechanical totals not confirmed');
  const money=n=>Number(n||0).toFixed(3);
  if(![t.grossCost,t.returnCredit,t.netCost].every(v=>Number.isFinite(Number(v))))throw Error('Invalid cost total');
  result.innerHTML='<p><b>JC '+escapeHtml(jc)+'</b></p>'+
   '<p>Total issued: OMR '+money(t.grossCost)+'</p>'+
   '<p>Returned unused: − OMR '+money(t.returnCredit)+'</p>'+
   '<p><b>Net consumables: OMR '+money(t.netCost)+'</b></p>'+
   t.items.map(row=>'<p>'+escapeHtml(row.name||'Material')+' · '+escapeHtml(row.brand||'')+
     ' · '+escapeHtml(row.issuedQty||0)+' '+escapeHtml(row.unit||'')+' issued, '+
     escapeHtml(row.returnedQty||0)+' returned · Net OMR '+money(row.netCost)+'</p>').join('')+
   (page>0?'<button type="button" onclick="mechanicalConsumablesShowTotals('+(page-1)+')">Previous</button>':'')+
   (t.hasMore===true&&page<49?'<button type="button" onclick="mechanicalConsumablesShowTotals('+(page+1)+')">Next 20</button>':'');
 }catch(_){if(generation===totalsGeneration&&section===sectionRequest&&canIssue()&&issueOwner()===owner&&String(window.zukaitAuth?.getToken?.()||'')===auth&&document.getElementById('mcConsTotalsResult')===result)result.textContent='Unable to verify Mechanical Job Card totals. No stock changes were made.';}
 finally{if(generation===totalsGeneration&&document.getElementById('mcConsTotalsGo')===button)button.disabled=false;}
}
let returnLines=[],returnBusy=false,returnPendingBlocked=false;
const returnKey=owner=>'zukait_mechanical_return_pending_v1:'+encodeURIComponent(owner);
function savedReturn(owner){
 if(!owner)throw Error('Staff identity unavailable');
 const raw=window.localStorage.getItem(returnKey(owner));
 if(!raw)return null;
 const entry=JSON.parse(raw);
 if(entry.owner!==owner||!entry.requestId||!entry.data||entry.fingerprint!==JSON.stringify(entry.data)||
    !entry.data.lineId||!entry.data.jobCard||!entry.data.reason)throw Error('Unconfirmed return requires manual review');
 return entry;
}
function returnForm(){
 const target=document.getElementById('mcConsReturnForm');if(!target)return;
 const owner=issueOwner();
 let pending;
 try{pending=savedReturn(owner);returnPendingBlocked=false}
 catch(_){returnPendingBlocked=true}
 if(returnPendingBlocked){target.textContent='Saved return receipt cannot be verified. New returns are blocked; contact Manager.';return}
 if(pending){
  target.innerHTML='<p class="mc-cons-alert">Unconfirmed return for JC '+escapeHtml(pending.data.jobCard)+
   '. Retry the original request only.</p><button type="button" onclick="mechanicalConsumablesRetryReturn()"'+
   (returnBusy?' disabled':'')+'>Retry original return</button>';
  return;
 }
 if(!returnLines.length){target.textContent='No returnable issued lines selected.';return}
 target.innerHTML='<label for="mcConsReturnLine">Original issued line</label><select id="mcConsReturnLine" onchange="mechanicalConsumablesReturnLineChanged()">'+
  returnLines.map((row,i)=>'<option value="'+i+'">'+escapeHtml(row.name||'Material')+' · '+escapeHtml(row.brand||'')+
  ' · '+escapeHtml(row.availableToReturn)+' '+escapeHtml(row.unit||'')+'</option>').join('')+
  '</select><p id="mcConsReturnRemaining"></p>'+
  '<label for="mcConsReturnQty">Unused quantity</label><input id="mcConsReturnQty" type="number" min="0.0001" step="0.0001">'+
  '<label for="mcConsReturnReason">Reason for return</label><input id="mcConsReturnReason" maxlength="180" autocomplete="off">'+
  '<button type="button" onclick="mechanicalConsumablesSubmitReturn()"'+(returnBusy?' disabled':'')+'>Return unused material</button>';
 returnLineChanged();
}
function returnLineChanged(){
 const index=Number(document.getElementById('mcConsReturnLine')?.value),line=returnLines[index];
 const note=document.getElementById('mcConsReturnRemaining'),qty=document.getElementById('mcConsReturnQty');
 if(!line||!note||!qty)return;
 note.textContent='Available to return: '+Number(line.availableToReturn)+' '+String(line.unit||'');
 qty.step=line.unit==='Piece'?'1':'0.0001';
}
async function sendReturn(retry=false){
 if(!canIssue()||!issueOwner()||returnBusy)return;
 const owner=issueOwner(),auth=String(window.zukaitAuth?.getToken?.()||'');
 const current=()=>canIssue()&&issueOwner()===owner&&String(window.zukaitAuth?.getToken?.()||'')===auth;
 const status=document.getElementById('mcConsReturnStatus');
 const show=msg=>{if(current()&&status&&document.getElementById('mcConsReturnStatus')===status)status.textContent=msg};
 if(typeof navigator!=='undefined'&&navigator.onLine===false){show('Offline. No request sent.');return}
 let entry;
 try{
  entry=savedReturn(owner);
  if(!entry){
   if(retry)throw Error('No saved return to retry');
   const jc=String(document.getElementById('mcConsReturnJc')?.value||'').trim().toUpperCase();
   const line=returnLines[Number(document.getElementById('mcConsReturnLine')?.value)];
   const raw=String(document.getElementById('mcConsReturnQty')?.value||'').trim(),quantity=Number(raw);
   const reason=String(document.getElementById('mcConsReturnReason')?.value||'').trim();
   if(!line||String(line.jobCard)!==jc||!line.lineId)throw Error('Find an original issue for this Job Card');
   if(!/^(?:\d+(?:\.\d{1,4})?|\.\d{1,4})$/.test(raw)||!Number.isFinite(quantity)||quantity<=0||
      !Number.isInteger(Math.round(quantity*10000))||quantity>Number(line.availableToReturn))throw Error('Invalid unused quantity');
   if(line.unit==='Piece'&&!Number.isInteger(quantity))throw Error('Whole pieces only');
   if(reason.length<5||reason.length>180)throw Error('Reason must be 5–180 characters');
   const data={jobCard:jc,lineId:line.lineId,quantity,reason};
   entry={owner,data,fingerprint:JSON.stringify(data),requestId:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'mechanical-return-'+Date.now()+'-'+Math.random().toString(36).slice(2)};
   window.localStorage.setItem(returnKey(owner),JSON.stringify(entry));
   if(savedReturn(owner)?.requestId!==entry.requestId)throw Error('Cannot preserve retry receipt');
  }
 }catch(e){show(String(e.message||e)+'. No new return sent.');return}
 returnBusy=true;returnForm();show('Checking audited return receipt…');
 try{
  if(!current())throw Error('Staff session changed');
  const response=await window.zukaitCloud.stockRequest({operation:'WRITE',command:'MECHANICAL_RETURN',requestId:entry.requestId,data:entry.data});
  if(!current())return;
  const receipt=response?.receipt;
  if(response?.ok!==true||receipt?.final!==true||String(receipt.lineId)!==String(entry.data.lineId)||
     String(receipt.jobCard)!==entry.data.jobCard||Number(receipt.quantity)!==Number(entry.data.quantity))
   throw Error(response?.code||'Return receipt not confirmed');
  if(savedReturn(owner)?.requestId===entry.requestId)window.localStorage.removeItem(returnKey(owner));
  returnLines=[];show('RETURNED · '+entry.data.quantity+' · Cost credited OMR '+Number(receipt.credit||0).toFixed(3)+'.');
 }catch(e){show('Return not confirmed. Retry the SAME request. '+String(e.message||e))}
 finally{returnBusy=false;if(current())returnForm()}
}
window.mechanicalConsumablesSubmitReturn=()=>sendReturn(false);
window.mechanicalConsumablesRetryReturn=()=>sendReturn(true);
window.mechanicalConsumablesReturnLineChanged=returnLineChanged;
let returnGeneration=0;
async function findReturnable(page=0){
 const input=document.getElementById('mcConsReturnJc'),result=document.getElementById('mcConsReturnResult'),button=document.getElementById('mcConsReturnFind');
 if(!input||!result||!canIssue()||!issueOwner()||!Number.isInteger(page)||page<0||page>49)return;
 const jc=String(input.value||'').trim().toUpperCase();
 if(!/^[A-Z0-9_. -]{1,36}$/.test(jc)){result.textContent='Enter a valid Mechanical Job Card number.';return;}
 const owner=issueOwner(),generation=++returnGeneration,section=sectionRequest,auth=String(window.zukaitAuth?.getToken?.()||'');
 button.disabled=true;result.textContent='Checking original Mechanical issues…';
 try{
  const response=await window.zukaitCloud.stockRequest({operation:'MECHANICAL_RETURNABLE',jobCard:jc,page});
  if(generation!==returnGeneration||section!==sectionRequest||!canIssue()||issueOwner()!==owner||String(window.zukaitAuth?.getToken?.()||'')!==auth||document.getElementById('mcConsReturnResult')!==result||String(input.value||'').trim().toUpperCase()!==jc)return;
  const data=response?.returnable;
  if(response?.ok!==true||!Array.isArray(data?.items))throw Error('Original issues not confirmed');
  returnLines=data.items.map(row=>({...row,jobCard:jc}));
  result.innerHTML=data.items.length?data.items.map(row=>'<p>'+escapeHtml(row.name||'Material')+' · '+escapeHtml(row.brand||'')+
   ' · Available to return: '+escapeHtml(row.availableToReturn||0)+' '+escapeHtml(row.unit||'')+'</p>').join(''):
   '<p>No unused issued materials available on this page.</p>';
  result.innerHTML+=
   (page>0?'<button type="button" onclick="mechanicalConsumablesFindReturnable('+(page-1)+')">Previous</button>':'')+
   (data.hasMore===true&&page<49?'<button type="button" onclick="mechanicalConsumablesFindReturnable('+(page+1)+')">Next 20</button>':'');
  returnForm();
 }catch(_){if(generation===returnGeneration&&section===sectionRequest&&canIssue()&&issueOwner()===owner&&String(window.zukaitAuth?.getToken?.()||'')===auth&&document.getElementById('mcConsReturnResult')===result)result.textContent='Unable to verify issued materials. No stock changes were made.';}
 finally{if(generation===returnGeneration&&document.getElementById('mcConsReturnFind')===button)button.disabled=false;}
}
window.mechanicalConsumablesFindReturnable=findReturnable;
window.mechanicalConsumablesShowTotals=showTotals;
window.openMechanicalConsumables=menu;
window.openMechanicalConsumablesSection=section;
window.mechanicalConsumablesFilter=renderMaterialRows;
window.mechanicalConsumablesSelectMaterial=brandPreview;
window.mechanicalConsumablesAddLine=addIssueLine;
window.mechanicalConsumablesRemoveLine=removeIssueLine;
window.mechanicalConsumablesRefreshBalance=loadBalance;
window.mechanicalConsumablesSubmitIssue=submitIssue;
})();
