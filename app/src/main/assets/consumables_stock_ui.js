(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const OMR=n=>Number(n||0).toFixed(3);
const fmt=n=>Number(n||0).toFixed(2);
let department='';
let view={page:'balance',items:[],history:[],itemsHasMore:false,itemsNextPage:1,historyHasMore:false,loading:false,error:'',busy:false,
  selected:'',mode:'total',pending:null,legacyItems:[],legacyPage:0,legacyHasMore:false,report:null,
  balanceQuery:'',balanceFilter:'all',pairQuery:''};
const allowed=()=>typeof me!=='undefined'&&['Manager','Supervisor'].includes(me?.role);
const manager=()=>typeof me!=='undefined'&&me?.role==='Manager';
// The normal app can ask the authenticated server whether a real-data ledger
// is installed and writable. The source preview flag and URL are NOT authority.
// Never cache readiness across changed staff sessions.
let liveStockSession='';
const currentStockSession=()=>String(window.zukaitAuth?.getToken?.()||'');
const liveStockReady=()=>!!liveStockSession&&
  liveStockSession===currentStockSession()&&currentStockSession().length>0;
// A query parameter can never override Stock safety in the staff app.
// The separately packaged QA build opts in at build time instead.
const isolatedStockPilot=()=>window.ZUKAIT_STOCK_ISOLATED_PILOT===true;
const previewOnly=()=>window.ZUKAIT_STOCK_UI_PREVIEW_ONLY===true&&
  !liveStockReady()&&!isolatedStockPilot();
const api=x=>previewOnly()?Promise.reject(Error('Stock preview: transactions not enabled')):
  window.zukaitCloud?.stockRequest?.(x)||Promise.reject(Error('Stock server connection not ready'));
const stockRead=request=>api(department?{...request,department}:request);
window.zukaitStockPickerEnabled=()=>!previewOnly()&&(
  isolatedStockPilot()||
  (liveStockReady()&&window.ZUKAIT_DEPARTMENT_PICKERS_ENABLED===true));
const pickerRequests=new Map();
window.zukaitStockPickerPairs=async scope=>{
  if(!window.zukaitStockPickerEnabled())return null;
  if(!['Painting','Mechanical'].includes(scope))throw Error('Invalid material department');
  const token=window.zukaitAuth?.getToken?.();
  const old=pickerRequests.get(scope);
  if(old?.token===token&&old?.until>Date.now())return old.result;
  const pending={token,until:Infinity,result:readPickerPairs(scope,token)};
  pickerRequests.set(scope,pending);
  try{
    return await pending.result;
  }catch(error){
    if(pickerRequests.get(scope)===pending)pickerRequests.delete(scope);
    throw error;
  }finally{pending.until=Date.now()+30000;}
};
async function readPickerPairs(scope,token){
  const mechanicalSupervisor=typeof me!=='undefined'&&me?.role==='Mechanical Supervisor';
  const keys=new Set();
  for(let page=0;page<=20;page++){
    const request=mechanicalSupervisor?{operation:'CATALOG',page}:{operation:'LIST',department:scope,page};
    const result=await api(request);
    if(!result?.ok||token!==window.zukaitAuth?.getToken?.())throw Error('Department material list unavailable');
    for(const row of result.items||[])keys.add(JSON.stringify([row.material_id??row.materialId,row.brand_id??row.brandId]));
    if(!result.hasMore)return keys;
  }
  throw Error('Department material list exceeds the supported page limit');
}
// The historical Materials Master was exclusively Paint Consumables.
// Treat missing/legacy department as Paint for display and selection without
// rewriting live workshop_state or touching historical Job Card prices.
const stockMaterialDepartment=m=>['Painting','Mechanical','Both'].includes(m?.department)?m.department:'Painting';
const stockMaterialInDepartment=m=>!department||stockMaterialDepartment(m)==='Both'||stockMaterialDepartment(m)===department;
const catalog=()=>{
  try{
    const c=typeof state!=='undefined'&&window.ZukaitConsumables?.ensureState(state);
    return {materials:(c?.materials||[]).filter(x=>x.active!==false&&stockMaterialInDepartment(x)),
      brands:(c?.brands||[]).filter(x=>x.active!==false),
      prices:(c?.prices||[]).filter(x=>x.voided!==true)};
  }catch(_){return {materials:[],brands:[],prices:[]}}
};
// Read-only Material Master overlay; never infer physical stock from saved prices.
function masterInventory(){
 const c=catalog(),materials=new Map(c.materials.map(m=>[String(m.id),m])),
  brands=new Map(c.brands.map(b=>[String(b.id),b])),pairs=new Map(),
  pricedMaterials=new Set();
 for(const p of c.prices){
  const m=materials.get(String(p.materialId)),b=brands.get(String(p.brandId));
  if(!m||!b)continue;
  pricedMaterials.add(String(m.id));
  const key=String(m.id)+'|'+String(b.id);
  if(!pairs.has(key))pairs.set(key,{key,name:String(m.name||m.id),
   brand:String(b.name||b.id),unit:String(m.unit||'')});
 }
 return {pairs:[...pairs.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,
  {numeric:true,sensitivity:'base'})||a.brand.localeCompare(b.brand,undefined,
  {numeric:true,sensitivity:'base'})),
  unpriced:c.materials.filter(m=>!pricedMaterials.has(String(m.id)))};
}
// The Manager can select saved Master pairs directly; only the server-confirmed
// MASTER_LINK operation creates a ledger placeholder, immediately before a valid
// stock entry. Never merge these virtual choices into the balance/report rows.
function addStockChoices(){
 const rows=[...view.items];
 if(!manager()||view.itemsHasMore)return rows;
 const known=new Set(rows.map(x=>String(x.material_id)+'|'+String(x.brand_id)));
 const c=catalog();
 for(const pair of masterInventory().pairs){
  if(known.has(pair.key))continue;
  const [material_id,brand_id]=pair.key.split('|');
  const m=c.materials.find(x=>String(x.id)===material_id);
  if(!m)continue;
  const linkedMaterial=rows.find(x=>String(x.material_id)===material_id);
  const scope=['Painting','Mechanical','Both'].includes(m.department)?m.department:
   linkedMaterial?.material?.department||'Painting';
  if(department&&scope!==department&&scope!=='Both')continue;
  rows.push({material_id,brand_id,unit:pair.unit,needsMasterLink:true,linkOrigin:scope});
  known.add(pair.key);
 }
 return rows;
}
const label=(r)=>{
  const c=catalog();
  const m=c.materials.find(x=>String(x.id)===String(r.material_id));
  const b=c.brands.find(x=>String(x.id)===String(r.brand_id));
  return (m?.name||r.material_id)+' — '+(b?.name||r.brand_id);
};
const available=x=>Number(x.physical)-Number(x.reserved);
// Only an explicit opening, purchase or audited adjustment can establish
// a real ledger zero. New uninitialised catalog rows are placeholders.
// Older servers omit this flag; treat the status as unknown, never as zero.
const countStatus=x=>x?.initialised===true?'counted':x?.initialised===false?'uncounted':'unknown';
const counted=x=>countStatus(x)==='counted';
const css='<style>'+
 '.zs{font-family:inherit;color:#15253c;max-width:1150px;margin:auto}.zs *{box-sizing:border-box}'+
 '.zs-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0}'+
 '.zs button{cursor:pointer}.zs-nav button{padding:12px 8px;border:1px solid #bdd1e4;background:#f7fbff;border-radius:11px;font-weight:750;color:#23446b;text-align:left}'+
 '.zs-nav button.zs-active{background:#dcecff;border-color:#317bd7;color:#1255b3}'+
 '.zs-card{border:1px solid #b8cfe2;background:#fff;border-radius:12px;padding:11px;margin:8px 0;color:#15253c}'+
 'button.zs-card,button.zs-card b,.zs-metric b{color:#15253c!important}button.zs-card{background:#f6faff!important}'+
 'button.zs-card:hover{background:#e7f2ff!important}button.zs-card .zs-muted{color:#435b73!important}'+
 'button.zs-card .zs-available{color:#146239!important}'+
 '.zs button:focus-visible{outline:3px solid #1559a5;outline-offset:2px}'+
 '.zs-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}'+
 '.zs-metric{background:#edf5fb;padding:10px;border-radius:10px}.zs-muted{font-size:12px;color:#596c81}'+
 '.zs-row{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}'+
 '.zs-btn{border:1px solid #1f6fc4;background:#1768bc;color:white;padding:10px;border-radius:8px;font-weight:700}'+
 '.zs-btn.secondary{background:#fff;color:#22598c}.zs-btn:disabled{opacity:.5;cursor:not-allowed}'+
 '.zs input,.zs select,.zs textarea{padding:10px;width:100%;border:1px solid #bacddd;border-radius:8px;background:#fff;color:#14263c;font-size:15px}'+
 '.zs label{display:block;font-size:12px;font-weight:750;margin:12px 0 4px;color:#435b73}'+
 '.zs-pill{border-radius:16px;padding:3px 7px;background:#fff0ce;color:#824900;font-size:11px;font-weight:700}'+
 '.zs-warning{background:#fff3df;border:1px solid #edd3a0;border-radius:8px;padding:10px;color:#6b4916}'+
 '.zs-unlinked{background:#f8fbff;border-color:#c8d7eb}.zs-unlinked-pill{background:#fff1d5;color:#805113}'+
 '.zs-unlinked-grid{margin:10px 0}.zs-unlinked-grid b{display:block;color:#7b8694;font-size:17px}.zs-unlinked-grid small{display:block;color:#5a6e83}'+
 '.zs-link-action,.zs-master-price-action{margin-top:9px}'+
 '.zs-balance-scroll{overflow-x:auto;max-width:100%;margin:8px 0;border:1px solid #cbd8e7;border-radius:9px;background:#fff}'+
 '.zs-balance-table{min-width:900px}'+
 '.zs .zs-balance-line,.zs .zs-balance-head{display:grid!important;grid-template-columns:minmax(180px,2.2fr) repeat(3,minmax(86px,1fr)) minmax(125px,1.3fr) minmax(240px,2.4fr);align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:7px 10px;text-align:left;line-height:1.2;margin:0;border:0;border-radius:0;background:#fff;color:#172940;font-size:12px;min-height:34px}'+
 '.zs .zs-balance-head{background:#e6eef8;font-size:11px;font-weight:800;color:#314b69;min-height:32px}'+
 '.zs .zs-balance-line{border-top:1px solid #e0e8f0}'+
 '.zs .zs-balance-linked{cursor:pointer;background:#f9fbfe!important;color:#172940!important;font-weight:500}'+
 '.zs .zs-balance-linked:hover{background:#e8f2ff!important}'+
 '.zs .zs-balance-linked:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}'+
 '.zs-balance-cell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-variant-numeric:tabular-nums;color:#172940!important}'+
 '.zs-balance-name{font-weight:800}.zs-balance-line .zs-available{font-weight:800;color:#166534!important}'+
 '.zs-balance-status{font-size:10px;font-weight:700;white-space:nowrap;color:#35536f}.zs-balance-status.pending{color:#94540b}.zs-balance-status.out{color:#b91c1c}.zs-balance-status.ok{color:#166534}'+
 '.zs-balance-actions{display:flex;gap:5px;align-items:center;min-width:0;flex-wrap:nowrap;overflow:hidden}.zs-balance-mini{border:1px solid #b7cce3;border-radius:5px;padding:3px 5px;color:#174d87!important;background:#eef5ff!important;font-size:10px;white-space:nowrap;cursor:pointer}'+
 '.zs-balance-tools{display:grid;grid-template-columns:minmax(0,2fr) minmax(140px,1fr);gap:10px;margin:9px 0 12px}'+
 '@media(max-width:480px){.zs-balance-tools{grid-template-columns:minmax(0,1fr)}}'+
 '@media(min-width:720px){.zs-nav{grid-template-columns:repeat(5,minmax(0,1fr))}.zs-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}}'+
 '</style>';
function draw(body) {
  const live=liveStockReady();
  if(!live&&typeof window.openModal!=='function')return;
  // Live Stock screens are independent views; keep legacy nav only for isolated QA.
  const nav=live?'':[['balance','Stock Balance'],['add','Add Stock'],['history','Stock History'],
    ['adjust','Stock Adjustment'],['reports','Stock Reports']]
    .map(([key,name])=>'<button type="button" class="'+(view.page===key?'zs-active':'')+
      '" onclick="zukStockNav(\''+key+'\')">'+name+'</button>').join('');
  const header='<div class="zs"><div class="zs-row">'+
    (live?'<button class="zs-btn secondary" onclick="zukStockLiveHome()">← '+esc(departmentTitle())+'</button>':
      '<button class="zs-btn secondary" onclick="openConsumablesModule()">← Consumables</button>')+
    (live?'<button class="zs-btn secondary" onclick="zukStockPreviewExit(\'dashboard\')">✕ Close</button>':
      '<button class="zs-btn secondary" onclick="closeModal()">✕ Close</button>')+'</div>'+
    '<h2 style="margin:12px 0 6px">'+esc(departmentTitle())+' · Stock</h2>'+
    // The department was chosen on the Stock landing page.
    // Never offer cross-department switching inside a scoped detail form.
    (department?'':'<label for="zs-department">Department</label><select id="zs-department" onchange="openStockManagement(this.value)">'+
      [['','All departments'],['Painting','Paint Consumables'],['Mechanical','Mechanical Consumables']]
      .map(([value,name])=>'<option value="'+value+'"'+(value===department?' selected':'')+'>'+name+'</option>').join('')+'</select>')+
    (department?'<p class="zs-muted">Shared items use the same stock balance in both departments.</p>':'')+
    (live?'':'<div class="zs-nav">'+nav+'</div>');
  const message=view.error?'<div class="zs-warning">'+esc(view.error)+'</div>':'';
  const markup=css+header+message+(body||'')+'</div>';
  if(live){renderStockScreen(previewHomeCss+markup,view.page);return;}
  window.openModal(markup);
}
// One compact row per material/brand; unknown quantities remain unknown.
function balanceCell(value,cls='',title=''){
 return '<span class="zs-balance-cell '+cls+'"'+(title?' title="'+esc(title)+'"':'')+'>'+esc(value)+'</span>';
}
function balanceStatus(label,cls=''){
 return '<span class="zs-balance-status '+cls+'">'+esc(label)+'</span>';
}
function balanceUnknown(){
 return balanceCell('—')+balanceCell('—')+balanceCell('—')+balanceCell('—');
}
function rowCard(r){
 const unit=r.unit||'Liter',isCounted=counted(r),a=available(r),status=countStatus(r);
 const ids=esc(String(r.material_id)+'|'+String(r.brand_id));
 const statusLabel=status==='uncounted'?'Opening stock not counted':'Opening count status unverified';
 const avg=OMR(Number(r.physical)>0?Number(r.stock_value)/Number(r.physical):0)+' OMR/'+unit;
 const quantities=isCounted?balanceCell(fmt(r.physical)+' '+unit)+balanceCell(fmt(r.reserved)+' '+unit)+
  balanceCell(fmt(a)+' '+unit,'zs-available')+balanceCell(avg,'','Average '+avg):balanceUnknown();
 return '<button type="button" class="zs-balance-line zs-balance-linked" data-id="'+ids+
  '" onclick="zukStockDetail(this.dataset.id)">'+balanceCell(label(r),'zs-balance-name',label(r))+
  quantities+balanceStatus(!isCounted?statusLabel:a<=0?'Out of stock':a<Number(r.minimum)?'Low stock':'In stock',
   !isCounted?'pending':a<=0?'out':a<Number(r.minimum)?'pending':'ok')+'</button>';
}
function masterStockCard(x,status){
 const name=x.name+' — '+x.brand;
 return '<div class="zs-balance-line" data-balance-entry data-balance-kind="'+esc(status)+
  '" data-balance-name="'+esc(name)+'">'+balanceCell(name,'zs-balance-name',name)+balanceUnknown()+
  '<span class="zs-balance-actions" title="Stock quantity not recorded">'+
  balanceStatus(status==='pending'?'Link status not checked':'Not linked','pending')+
  (manager()&&status!=='pending'?'<button type="button" class="zs-balance-mini" onclick="zukStockLegacyReview()">Review &amp; Link</button>':'')+'</span></div>';
}
function unpricedMaterialCard(m){
 const name=String(m.name||m.id);
 return '<div class="zs-balance-line" data-balance-entry data-balance-kind="unpriced" data-balance-name="'+esc(name)+'">'+
  balanceCell(name,'zs-balance-name',name)+balanceUnknown()+'<span class="zs-balance-actions">'+
  balanceStatus('Brand & Price needed','pending')+
  (manager()?'<button type="button" class="zs-balance-mini" onclick="zukStockOpenMaterials()">Open Brand &amp; Price</button>':'')+'</span></div>';
}
function render(){
 if(!allowed())return;
 if(view.loading){draw('<div class="zs-card">Loading the selected stock screen…</div>');return}
 if(view.page==='balance'){
  const rows=view.items,known=new Set(rows.map(r=>String(r.material_id)+'|'+String(r.brand_id))),
    master=masterInventory(),incomplete=view.itemsHasMore||!!view.error,
    unlinked=master.pairs.filter(p=>!known.has(p.key)),
    unpriced=master.unpriced.filter(m=>!rows.some(r=>String(r.material_id)===String(m.id))),
    low=rows.filter(x=>counted(x)&&available(x)>0&&available(x)<Number(x.minimum)).length,
    out=rows.filter(x=>counted(x)&&available(x)<=0).length,
    notCounted=rows.filter(x=>countStatus(x)==='uncounted').length,
    unknownCount=rows.filter(x=>countStatus(x)==='unknown').length,
    entries=[
     ...rows.map(r=>({name:label(r),markup:'<div data-balance-entry data-balance-kind="linked" data-balance-name="'+esc(label(r))+'">'+rowCard(r)+'</div>'})),
     ...unlinked.map(p=>({name:p.name+' — '+p.brand,markup:masterStockCard(p,incomplete?'pending':'unlinked')})),
     ...unpriced.map(m=>({name:String(m.name||m.id),markup:unpricedMaterialCard(m)}))
    ].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
  draw('<div class="zs-grid">'+
    '<div class="zs-metric"><div class="zs-muted">Material / Brand items</div><b>'+entries.length+'</b></div>'+
    '<div class="zs-metric"><div class="zs-muted">Linked stock</div><b>'+rows.length+'</b></div>'+
    '<div class="zs-metric"><div class="zs-muted">Needs linking</div><b>'+(incomplete?'—':unlinked.length)+'</b></div></div>'+
    '<p class="zs-muted">'+low+' low · '+out+' out of stock · '+notCounted+' not counted · '+unknownCount+' unverified</p>'+
    '<div class="zs-row" style="margin-top:12px"><h3>Stock Balance &amp; Material Master</h3>'+
    '<button class="zs-btn secondary" onclick="zukStockNav(\'balance\',true)">Refresh</button></div>'+
    '<div class="zs-balance-tools"><label>Search material or brand<input type="search" id="zs-balance-query" autocomplete="off" value="'+esc(view.balanceQuery||'')+
     '" placeholder="Search Paint materials" oninput="zukStockBalanceSearch(this.value)"></label>'+
    '<label>Show<select id="zs-balance-filter" onchange="zukStockBalanceFilter(this.value)">'+
    [['all','All items'],['linked','Linked stock'],['unlinked','Needs linking'],['unpriced','Brand & Price needed']]
      .map(([id,name])=>'<option value="'+id+'"'+(view.balanceFilter===id?' selected':'')+'>'+name+'</option>').join('')+'</select></label></div>'+
    (manager()?'<button class="zs-btn secondary" onclick="zukStockLegacyReview()">One-time: Review Older Materials</button>':'')+
    (view.error?'<p class="zs-warning">Stock link status cannot be verified until the ledger loads successfully. Refresh to retry.</p>':view.itemsHasMore?'<p class="zs-warning">More stock balances may be on later pages. Load them before deciding that unmatched Master items need linking.</p>':'')+
    (entries.length?'<div class="zs-balance-scroll" tabindex="0" aria-label="Stock balance list, scroll horizontally on small screens"><div class="zs-balance-table"><div class="zs-balance-head"><span>Material / Brand</span><span>Physical</span><span>Reserved</span><span>Available</span><span>Avg. Cost / Unit</span><span>Status</span></div>'+entries.map(x=>x.markup).join('')+'</div></div>':
     '<p class="zs-warning">No saved Material Master items or linked Stock records visible. Check the Master and refresh.</p>')+
    (entries.length?'<p class="zs-muted" id="zs-balance-search-empty" hidden>No materials match this search or filter.</p>':'')+
    (incomplete?'<button class="zs-btn secondary" onclick="zukStockMore()">Load more items</button>':''));
  applyBalanceFilters();return;
 }
 if(view.page==='legacy'){
   if(!manager()){draw('<p class="zs-warning">Only Manager can review older materials.</p>');return}
   draw('<h3>Older Materials — One-time Setup</h3>'+ 
     '<button type="button" class="zs-btn secondary" onclick="zukStockNav(\'add\',true)">← Return to Add Stock</button>'+
     '<p class="zs-muted">Already-linked materials need no further linking. For an unlinked material, choose the department used by all its brands. Each brand has a separate stock balance; linking does not prove or set a physical quantity. Verify opening stock separately. Master prices and Job Card costs are unchanged.</p>'+
     (view.legacyItems.length?view.legacyItems.map((x,i)=>{
       const paint=x.category==='Paint';
       const dept=String(x.department||'Unassigned');
       const options=paint?['Painting']:['Mechanical','Painting','Both'];
       return '<div class="zs-card"><div class="zs-row"><b>'+esc(x.name)+' — '+esc(x.brand)+'</b>'+
         '<span class="zs-muted">'+esc(x.unit)+' · '+esc(x.category)+'</span></div>'+
         '<p class="zs-muted">Current: '+esc(dept)+'</p>'+
         (x.linked?
          '<p class="zs-muted" role="status" style="color:#146239;font-weight:750">✓ Already linked to Stock — no setup needed. Check Stock Balance for verified quantities.</p>':
          '<p class="zs-warning">Not linked to Stock. Link this material and brand before entering an opening count.</p>'+
          '<div class="zs-two"><div><label for="zs-legacy-origin-'+i+'">Used in department</label>'+
          '<select id="zs-legacy-origin-'+i+'"><option value="">Choose department</option>'+
          options.map(y=>'<option value="'+y+'">'+y+'</option>').join('')+'</select></div>'+
          '<div style="display:flex;align-items:end"><button class="zs-btn" type="button" onclick="zukStockLegacyLink('+i+')"'+(view.busy?' disabled':'')+'>Link Material</button></div></div>')+'</div>';
     }).join(''):'<div class="zs-card">No older priced material/brand pairs on this page.</div>')+
     '<div class="zs-row">'+
     (view.legacyPage>0?'<button class="zs-btn secondary" onclick="zukStockLegacyPage('+(view.legacyPage-1)+')">Previous</button>':'')+
     (view.legacyHasMore?'<button class="zs-btn secondary" onclick="zukStockLegacyPage('+(view.legacyPage+1)+')">Next 20</button>':'')+'</div>'+
     '<p class="zs-muted">No bulk assignment, no stock purchases, and no automatic conversion of Painting to Mechanical.</p>');
   return;
 }
 if(view.page==='detail'){
   const r=view.items.find(x=>String(x.material_id)+'|'+String(x.brand_id)===view.selected);
   if(!r){view.page='balance';render();return}
   const unit=esc(r.unit);
   const isCounted=counted(r);
   draw('<button class="zs-btn secondary" onclick="zukStockNav(\'balance\')">← Stock Balance</button>'+
    '<div class="zs-card"><h3>'+esc(label(r))+'</h3>'+
    (!isCounted?'<p class="zs-warning">'+(countStatus(r)==='uncounted'?'Opening stock not counted':'Opening count status unavailable')+'. Physical and value totals are not confirmed.</p>':'')+
    [['Physical',isCounted?fmt(r.physical)+' '+unit:'—'],['Reserved',isCounted?fmt(r.reserved)+' '+unit:'—'],
     ['Available',isCounted?fmt(available(r))+' '+unit:'—'],
     ['Average cost',isCounted?OMR(Number(r.physical)?Number(r.stock_value)/Number(r.physical):0)+' OMR/'+unit:'—'],
     ['Stock value',isCounted?OMR(r.stock_value)+' OMR':'—'],
     ['Minimum stock',fmt(r.minimum)+' '+unit]]
     .map(([k,v])=>'<div class="zs-row" style="padding:5px 0"><span class="zs-muted">'+k+'</span><b>'+v+'</b></div>').join('')+'</div>'+
     '<button class="zs-btn" onclick="zukStockNav(\'add\')">Add Purchased Stock</button> '+
     (manager()?'<button class="zs-btn secondary" onclick="zukStockNav(\'adjust\')">Stock Adjustment</button>':''));
   return;
 }
 if(view.page==='add'){
    const choices=addStockChoices(),selected=choices.find(x=>String(x.material_id)+'|'+String(x.brand_id)===view.selected);
    const noAssignedItems=Boolean(!choices.length);
    const pairChoices=choices.map((x,i)=>'<button type="button" class="zs-pair-choice" data-pair-choice data-pair-name="'+esc(label(x))+'" onclick="zukStockChoosePair('+i+')">'+esc(label(x))+
      '<small>'+esc(x.unit||'')+(x.needsMasterLink?' · New stock item':'')+'</small></button>').join(''),
      pairName=selected?label(selected):String(view.pairQuery||'');
    draw('<h3>'+(legacyEntryQA()?'Add / Open Stock':'Opening Stock (one time only)')+'</h3>'+
     (noAssignedItems?'<div class="zs-warning"><b>No linked material and brand pairs available.</b><p>The existing Material Master is separate from Stock. Each material and brand must be reviewed and linked before Opening Stock can be saved.</p>'+
       (manager()?'<button type="button" class="zs-btn" onclick="zukStockLegacyReview()">Review &amp; Link Existing Materials</button>':'Ask the Manager to link existing material and brand pairs.')+'</div>':'')+
     '<p class="zs-muted">Enter litres directly (not tins or drums). Non-liquid materials retain kg or Piece units.</p>'+
     (legacyEntryQA()?(manager()?'<label>Entry type</label><select id="zs-entrytype" onchange="zukStockSetEntryType()"><option value="PURCHASE">Purchased Stock</option><option value="OPENING">Opening Stock (one time only)</option></select>':''):'<input type="hidden" id="zs-entrytype" value="OPENING">')+
     '<label for="zs-material-brand-search">Search Material + Brand</label>'+
     '<div class="zs-pair-picker"><input id="zs-material-brand-search" type="search" inputmode="search" autocomplete="off" autocapitalize="none" aria-controls="zs-pair-results" aria-expanded="false" placeholder="'+(noAssignedItems?'Link a material + brand first':'Type material or brand to search')+'" value="'+esc(pairName)+'"'+(noAssignedItems?' disabled':'')+' oninput="zukStockResolvePair()" onfocus="zukStockShowPairChoices()">'+
     '<div id="zs-pair-results" class="zs-pair-results" role="group" aria-label="Matching stock materials and saved Master pairs" hidden>'+pairChoices+
     '<p id="zs-pair-empty" class="zs-muted" hidden>No matching items on this loaded page. '+(view.itemsHasMore?'Load more linked materials below to continue searching.':'Check the material and brand name.')+'</p></div>'+
     '<p id="zs-pair-hint" class="zs-muted" role="status">'+(selected?'Selected '+esc(label(selected)):'Tap a search result to choose the exact material and brand.')+'</p>'+
     (view.itemsHasMore?'<button type="button" id="zs-pair-more" class="zs-btn secondary zs-pair-more" onclick="zukStockPairMore()">Load next 100 linked materials</button>':'')+'</div>'+
     '<input id="zs-material" type="hidden" value="'+esc(selected?.material_id||'')+'"><input id="zs-brand" type="hidden" value="'+esc(selected?.brand_id||'')+'">'+
     '<label>Quantity (existing material unit)</label><input id="zs-qty" type="number" min="0.0001" step="any" placeholder="Enter physically counted / received quantity" oninput="zukStockCalculatePurchase()">'+
     '<label>Price method</label><select id="zs-method" onchange="zukStockCalculatePurchase()"><option value="total">Total Purchase Price</option><option value="unit">Price per Unit</option></select>'+
     '<label id="zs-price-label">'+(legacyEntryQA()?'Purchase amount (OMR)':'Counted amount (OMR)')+'</label><input id="zs-price" type="number" min="0.001" step="any" placeholder="Enter actual cost" oninput="zukStockCalculatePurchase()">'+
     '<div class="zs-card zs-calculation-card"><b>Calculated amount</b><div id="zs-price-calculated" role="status">Enter quantity and purchase amount.</div></div>'+
     '<div id="zs-opening-fields" style="display:'+(legacyEntryQA()?'none':'block')+'" class="zs-card">'+
     '<p class="zs-warning">Opening Stock is recorded once for this material and brand. Use the physical count, never an estimated stock number.</p>'+
     '<label><input id="zs-count-confirmed" type="checkbox" style="width:auto" /> I have physically counted this material and brand</label>'+
     '<label>Count reference / reason</label><textarea id="zs-opening-note" rows="2" maxlength="180" placeholder="e.g. Verified opening count, 21 Nov"></textarea></div>'+
     '<p class="zs-muted">The server calculates weighted average cost after saving. Existing master prices are not overwritten.</p>'+
     '<button class="zs-btn" id="zs-save-entry" onclick="zukStockSavePurchase()"'+(view.busy||noAssignedItems?' disabled':'')+ '>'+(legacyEntryQA()?'Save Purchased Stock':'Confirm Opening Stock')+'</button>');
    return;
  }
  if(view.page==='history'){
   draw('<div class="zs-row"><h3>Stock History</h3><button class="zs-btn secondary" onclick="zukStockNav(\'history\',true)">Refresh</button></div>'+
   (view.history.length?view.history.map(x=>'<div class="zs-card"><div class="zs-row"><b>'+esc(x.action)+' — '+esc(label(x))+'</b>'+
      '<span class="zs-muted">'+esc(String(x.recorded_at||'').slice(0,10))+'</span></div>'+
      '<div class="zs-muted">Physical '+fmt(x.physical_delta)+' · Reserved '+fmt(x.reserved_delta)+
      ' · Value '+OMR(x.cost_delta)+' OMR</div><div class="zs-muted">'+esc(x.job_card||'')+' '+esc(x.note||'')+'</div></div>').join(''):
      '<p class="zs-card">No stock transactions found.</p>')+
    (view.historyHasMore?'<button class="zs-btn secondary" onclick="zukStockMoreHistory()">Load older 50 records</button>':''));
   return;
 }
 if(view.page==='adjust'){
   if(!manager()){draw('<div class="zs-warning">Only Manager can correct physical stock. Supervisors can add purchases and see history.</div>');return}
   draw('<h3>Manager Stock Adjustment</h3>'+
     '<label>Stock item</label><select id="zs-item">'+view.items.map(r=>{
       const id=String(r.material_id)+'|'+String(r.brand_id);
       return '<option value="'+esc(id)+'">'+esc(label(r))+' · Current '+fmt(r.physical)+' '+esc(r.unit)+'</option>';
     }).join('')+'</select>'+
     '<label>Actual counted quantity (same unit)</label><input id="zs-count" type="number" min="0" step="any" placeholder="Enter counted quantity">'+
     '<label>Reason (required)</label><textarea id="zs-reason" rows="2" placeholder="Physical stock count difference"></textarea>'+
     '<p class="zs-muted">The database rejects corrections below already-reserved stock and records an audit entry.</p>'+
     '<button class="zs-btn" onclick="zukStockSaveAdjustment()"'+(view.busy?' disabled':'')+'>Save Adjustment</button>');
   return;
 }
 if(view.page==='reports'){
   const r=view.report;
   draw('<div class="zs-row"><h3>Stock Reports</h3><button class="zs-btn secondary" onclick="zukStockNav(\'reports\',true)">Refresh</button></div>'+
     (r?'<div class="zs-card">'+
     '<p class="zs-muted">Report totals are server-reported. Verify opening-count status separately before interpreting a zero balance as physically out of stock.</p>'+
     '<div class="zs-row"><span>Current stock valuation</span><b>'+OMR(r.valuation)+' OMR</b></div>'+
     '<div class="zs-row"><span>Tracked material and brand pairs</span><b>'+esc(r.items)+'</b></div>'+
     '<div class="zs-row"><span>Low stock</span><b>'+esc(r.low)+'</b></div>'+
     '<div class="zs-row"><span>Out of stock</span><b>'+esc(r.out)+'</b></div></div>':
     '<p class="zs-warning">Stock report unavailable.</p>')+
     '<button class="zs-btn secondary" onclick="zukStockNav(\'history\')">Open Stock History</button>');
 }
}
async function load(page,force=false){
 if(!allowed())return;
 if(previewOnly()){showPreview();return;}
 if(view.busy||view.loading)return;
 if(page)view.page=page;
 view.error='';
 const needsItems=['balance','add','adjust'].includes(view.page);
 const needReport=view.page==='reports';
 const needHistory=view.page==='history';
 if((needsItems&&(!view.items.length||force))||(needHistory&&(!view.history.length||force))||(needReport&&(!view.report||force))){
   view.loading=true;render();
   try{
     const request=needsItems?{operation:'LIST',page:0}:{operation:needReport?'REPORTS':'HISTORY'};
     const reply=await stockRead(request);
     if(!reply.ok)throw Error(reply.code||'STOCK_UNAVAILABLE');
     if(needsItems){view.items=reply.items||[];view.itemsHasMore=!!reply.hasMore;view.itemsNextPage=1}
     else if(needReport)view.report=reply.report||null;
     else{view.history=reply.history||[];view.historyHasMore=!!reply.hasMore}
   }catch(e){view.error=String(e.message||e)}
   finally{view.loading=false}
 }
 render();
}
async function loadLegacy(page=0){
 if(!manager()||view.busy||view.loading)return;
 if(!Number.isInteger(page)||page<0||page>49)return;
 view.page='legacy';view.legacyPage=page;view.loading=true;view.error='';render();
 try{
   const r=await api({operation:'LEGACY_PREVIEW',page});
   if(!r?.ok||r.preview?.readOnly!==true)throw Error(r?.code||'Legacy materials unavailable');
   view.legacyItems=Array.isArray(r.preview.items)?r.preview.items.slice(0,20):[];
   view.legacyHasMore=r.preview.hasMore===true;
 }catch(e){view.legacyItems=[];view.legacyHasMore=false;view.error=String(e?.message||e)}
 finally{view.loading=false;render()}
}
window.zukStockLegacyReview=()=>loadLegacy(0);
window.zukStockLegacyPage=page=>loadLegacy(page);
window.zukStockLegacyLink=async(index)=>{
 if(!manager()||view.busy||view.loading)return;
 const x=view.legacyItems[index];if(!x||x.linked===true)return;
 const origin=document.getElementById('zs-legacy-origin-'+index)?.value;
 if(!['Mechanical','Painting','Both'].includes(origin)){
   view.error='Choose Mechanical, Painting or Both.';render();return;
 }
 if(x.category==='Paint'&&origin!=='Painting'){
   view.error='Paint category is Painting only.';render();return;
 }
 view.busy=true;view.error='';render();
 try{
   const r=await api({operation:'MASTER_LINK',
     materialId:x.materialId,brandId:x.brandId,origin});
   if(!r?.ok||r.linked?.linked!==true)throw Error(r?.code||'Link not confirmed');
   pickerRequests.clear();
   view.busy=false;await loadLegacy(view.legacyPage);
 }catch(e){
   view.busy=false;view.error=String(e?.message||e);
   render();
 }
};
// UI-only acceptance: show the agreed screens without interpreting the legacy
// Consumables Material Master as a verified stock ledger or making Stock API calls.
const preview={page:'home',query:'',material:'',brand:''};
const previewTabs=[
 ['balance','Stock Balance'],['add','Add Stock'],['history','Stock History'],
 ['adjust','Stock Adjustment'],['reports','Stock Reports']
];
const previewCss='<style>'+
 '.zs-preview{max-width:1160px;margin:0 auto;color:#14263c;font-size:14px}'+
 '.zs-preview h2{font-size:22px;margin:13px 0 4px}.zs-preview h3{font-size:17px;margin:13px 0}'+
 '.zs-preview .zs-pnav{display:flex;gap:7px;flex-wrap:wrap;margin:15px 0}'+
 '.zs-preview .zs-pnav button{border:1px solid #b5cce3;border-radius:9px;background:#f5f9ff;color:#174b78;padding:10px 14px;min-height:42px;font-weight:700}'+
 '.zs-preview .zs-pnav button.active{background:#195dab;border-color:#195dab;color:#fff}'+
 '.zs-preview .zs-panel{background:#fff;border:1px solid #d9e4ef;border-radius:12px;padding:15px;margin:12px 0}'+
 '.zs-preview .zs-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:9px}'+
 '.zs-preview .zs-stat{border:1px solid #dbe6ef;background:#f4f8fd;border-radius:11px;padding:13px}'+
 '.zs-preview .zs-stat small{display:block;color:#52677c;margin-bottom:7px}.zs-preview .zs-stat strong{font-size:19px;overflow-wrap:anywhere}'+
 '.zs-preview .zs-table-wrap{overflow-x:auto;max-width:100%;border:1px solid #dce7f2;border-radius:10px}'+
 '.zs-preview table{border-collapse:collapse;min-width:910px;width:100%;font-size:13px}'+
 '.zs-preview th{background:#eaf2fc;text-align:left;white-space:nowrap;color:#244564;padding:12px 11px}'+
 '.zs-preview td{padding:12px 11px;border-top:1px solid #e5edf6;vertical-align:middle}'+
 '.zs-preview tr:nth-child(even) td{background:#fbfdff}'+
 '.zs-preview .zs-not-ready{font-size:12px;color:#795111;background:#fff2d8;border-radius:7px;padding:4px 7px;display:inline-block}'+
 '.zs-preview .zs-filter{display:grid;grid-template-columns:minmax(160px,2fr) repeat(2,minmax(130px,1fr)) auto;gap:8px;align-items:end}'+
 '.zs-preview .zs-field{display:block;margin:7px 0;color:#344f68;font-weight:700;font-size:13px}'+
 '.zs-preview .zs-field input,.zs-preview .zs-field select,.zs-preview .zs-field textarea{display:block;width:100%;margin-top:5px;min-height:42px;padding:9px 10px;border-radius:8px;border:1px solid #bccfe2;background:white;color:#15283e;font-size:15px}'+
 '.zs-preview .zs-formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}'+
 '.zs-preview .zs-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}'+
 '.zs-preview button{cursor:pointer}.zs-preview button:disabled{cursor:not-allowed;opacity:.65}'+
 '.zs-preview .zs-ghost{background:#eaf2fc;border:1px solid #a6c3e0;color:#18518b;border-radius:8px;padding:11px 15px;font-weight:700}'+
 '.zs-preview .zs-disabled{background:#d4dce5;color:#34475d;border:0;padding:11px 15px;border-radius:8px;font-weight:700}'+
 '.zs-preview .zs-preview-note{font-size:13px;color:#465d74;line-height:1.6}'+
 '@media(max-width:680px){.zs-preview .zs-filter,.zs-preview .zs-formgrid{grid-template-columns:minmax(0,1fr)}.zs-preview .zs-panel{padding:10px}.zs-preview .zs-pnav button{flex:1 1 135px}}'+
 '</style>';
const previewNotReady='<span class="zs-not-ready">Not initialized</span>';
const previewNotice=()=>'<div class="zs-warning" role="status"><b>UI PREVIEW ONLY · LIVE STOCK NOT SET UP.</b> '+
 'Saved material names are available, but physical stock and stock costs have not been verified. '+
 'Purchases, issues, returns and adjustments cannot be saved until the stock database and API are activated.</div>';
function previewPairs(){
 const c=catalog(),rows=[];
 for(const m of c.materials){
  const ids=[...new Set((typeof state!=='undefined'&&state?.consumables?.prices||[])
     .filter(p=>p&&!p.voided&&String(p.materialId)===String(m.id))
     .map(p=>String(p.brandId||'')))];
  if(!ids.length){rows.push({material:m,brand:null});continue}
  for(const id of ids){
   const brand=c.brands.find(b=>String(b.id)===id);
   if(brand)rows.push({material:m,brand});
  }
  if(!rows.some(x=>String(x.material.id)===String(m.id)))rows.push({material:m,brand:null});
 }
 return rows;
}
const previewOptions=(list,selected,placeholder)=>'<option value="">'+esc(placeholder)+'</option>'+
 list.map(x=>'<option value="'+esc(x.id)+'"'+(String(selected)===String(x.id)?' selected':'')+'>'+esc(x.name)+'</option>').join('');
const previewFormOptions=(list)=>list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
function previewBalance(rows,c){
 const filtered=rows.filter(x=>(!preview.query||[x.material.name,x.brand?.name,x.material.unit].join(' ').toLowerCase().includes(preview.query.toLowerCase()))&&
   (!preview.material||String(x.material.id)===preview.material)&&
   (!preview.brand||String(x.brand?.id||'')===preview.brand));
 return '<div class="zs-stats">'+
  [['Material types',String(c.materials.length)],['Material / brand rows',String(rows.length)],
   ['Physical stock','Not initialized'],['Reserved for Job Cards','Not initialized'],
   ['Available stock','Not initialized'],['Low stock items','Not initialized']]
  .map(([k,v])=>'<div class="zs-stat"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+
  '<div class="zs-panel"><h3>Stock Balance</h3><p class="zs-preview-note">Materials and brands below come from the existing master. '+
  'This is NOT a verified department stock list. Older materials are shown under Paint; newly created Mechanical and Shared materials appear in their assigned departments. Quantities and stock costs remain unavailable until opening counts are confirmed.</p>'+
  '<div class="zs-filter">'+
  '<label class="zs-field">Search material or brand<input id="zs-preview-query" placeholder="Search material or brand" value="'+esc(preview.query)+'"></label>'+
  '<label class="zs-field">Material<select id="zs-preview-material">'+previewOptions(c.materials,preview.material,'All materials')+'</select></label>'+
  '<label class="zs-field">Brand<select id="zs-preview-brand">'+previewOptions(c.brands,preview.brand,'All brands')+'</select></label>'+
  '<button type="button" class="zs-ghost" onclick="zukStockPreviewFilter()">Apply filter</button></div>'+
  '<div class="zs-table-wrap"><table aria-label="Stock Balance preview"><thead><tr>'+
  '<th>Material</th><th>Brand</th><th>Unit</th><th>Physical</th><th>Reserved</th><th>Available</th>'+
  '<th>Avg. Cost / Unit</th><th>Min. Level</th><th>Status</th></tr></thead><tbody>'+
  (filtered.length?filtered.map(x=>'<tr><td><b>'+esc(x.material.name)+'</b></td>'+
    '<td>'+esc(x.brand?.name||'Not assigned')+'</td><td>'+esc(x.material.unit||'Not set')+'</td>'+
    '<td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>'+previewNotReady+'</td></tr>').join(''):
   '<tr><td colspan="9">No materials match these filters.</td></tr>')+
  '</tbody></table></div><p class="zs-preview-note">— means no verified stock quantity or stock cost is available; it does not mean zero.</p></div>'+
  '<div class="zs-panel"><h3>Job Card Material Workflows</h3>'+
  '<p class="zs-preview-note">Review the Supervisor Suggest Material and Return Unused Material screens. Neither screen can post a transaction in V405.</p>'+
  '<div class="zs-actions"><button type="button" class="zs-ghost" onclick="zukStockPreviewNavigate(\'suggest\')">Supervisor · Suggest Material</button>'+
  '<button type="button" class="zs-ghost" onclick="zukStockPreviewNavigate(\'return\')">Return Unused Material</button></div></div>';
}
// Phase 1 interactive acceptance, fully isolated from workshop and stock APIs.
// Test entries live in RAM for this browser tab only, never in Supabase or
// workshop_state. This must NOT be confused with production stock activation.
const stockTrial={active:false,balances:new Map(),events:[],message:''};
const trialKey=(materialId,brandId)=>JSON.stringify([department,String(materialId),String(brandId)]);
function trialNotice(){
 return '<div class="zs-warning" role="status" style="background:#e8f7f2;border-color:#8dceb7;color:#124936">'+
  '<b>TEST MODE · NOT REAL STOCK.</b> Opening counts and purchases work only inside this browser tab. '+
  'Nothing is saved to Supabase, synced to other devices, or used for Job Card costing. '+
  'Closing or reloading clears all test entries.</div>';
}
function trialControls(){
 if(window.ZUKAIT_STOCK_QA_SIMULATION!==true)return '<p role="status" class="zs-warning">Real stock is not activated on this server. Opening stock, purchases and adjustments cannot be saved yet. Existing Materials &amp; Brands remain available to Managers.</p>';
 return '<div class="zs-actions" style="margin:10px 0 16px">'+
 (stockTrial.active?
  '<button type="button" class="zs-ghost" onclick="zukStockTestReset()">Clear test entries</button>':
  '<button type="button" class="zs-ghost" onclick="zukStockTestStart()">Start opening-stock / purchase test</button>')+
 '</div>';
}
function trialBalance(c){
 const rows=[...stockTrial.balances.values()].filter(x=>x.department===department),total=rows.reduce((a,b)=>a+b.value,0);
 return '<div class="zs-stats">'+
 [['Test stock items',String(rows.length)],['Test stock value',OMR(total)+' OMR'],['Job Card reservations','Not active']]
 .map(([k,v])=>'<div class="zs-stat"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+
 '<div class="zs-panel"><h3>Stock Balance · Test Mode</h3>'+
 (rows.length?'<div class="zs-table-wrap"><table><thead><tr><th>Material</th><th>Brand</th><th>Unit</th><th>Physical</th><th>Reserved</th><th>Available</th><th>Avg cost</th><th>Stock value</th></tr></thead><tbody>'+
 rows.map(r=>'<tr><td>'+esc(c.materials.find(x=>String(x.id)===r.materialId)?.name||r.materialId)+'</td>'+
 '<td>'+esc(c.brands.find(x=>String(x.id)===r.brandId)?.name||r.brandId)+'</td>'+
 '<td>'+esc(r.unit)+'</td><td>'+fmt(r.qty)+'</td><td>0</td><td>'+fmt(r.qty)+'</td>'+
 '<td>'+OMR(r.qty?r.value/r.qty:0)+'</td><td>'+OMR(r.value)+'</td></tr>').join('')+
 '</tbody></table></div>':
 '<p>No test entries yet. Open <b>Add Stock</b> and record a physically counted opening quantity.</p>')+
 '<p class="zs-preview-note">These are test entries only; production stock balances are still not initialized.</p></div>';
}
function trialAdd(c){
  const pairs=previewPairs().filter(x=>stockMaterialInDepartment(x.material)).map(x=>{
   const title=x.material.name+' — '+(x.brand?.name||'Not assigned');
   return '<option value="'+esc(title)+'"></option>';
  }).join('');
  return '<div class="zs-panel"><h3>Opening Stock & Purchased Stock · Test Mode</h3>'+
  '<p class="zs-preview-note">Enter quantity in the existing material unit. Convert tins or drums to litres manually. '+
  'Choose either total purchase price or price per unit; the other is calculated automatically.</p>'+
  '<div class="zs-formgrid"><label class="zs-field">Entry type<select id="zs-trial-entry">'+
  (manager()?'<option value="OPENING">Opening Stock — one-time count</option>':'')+
  '<option value="PURCHASE">Purchase</option></select></label>'+
  '<label class="zs-field">Search Material + Brand<input id="zs-trial-pair" list="zs-trial-pairs" autocomplete="off" placeholder="Type material or brand name"></label>'+
  '<datalist id="zs-trial-pairs">'+pairs+'</datalist>'+
  '<input id="zs-trial-material" type="hidden" value=""><input id="zs-trial-brand" type="hidden" value="">'+
  '<label class="zs-field">Quantity (material unit)<input id="zs-trial-qty" type="number" min="0" step="any" placeholder="Physically counted or purchased quantity" oninput="zukStockTrialCalculate()"></label>'+
  '<label class="zs-field">Price method<select id="zs-trial-method" onchange="zukStockTrialCalculate()">'+
  '<option value="total">Total value (OMR)</option><option value="unit">Price per unit (OMR)</option></select></label>'+
  '<label class="zs-field">Price (OMR)<input id="zs-trial-price" type="number" min="0" step="any" placeholder="Actual counted cost or purchase price" oninput="zukStockTrialCalculate()"></label></div>'+
  '<div class="zs-panel" style="background:#f2f7fc"><b>Calculated test values</b>'+
  '<p id="zs-trial-calculated" role="status" class="zs-preview-note">Enter quantity and price to calculate cost.</p></div>'+
  '<label class="zs-field">Count / purchase reference<input id="zs-trial-note" maxlength="180" placeholder="Required reason, at least 5 characters"></label>'+
  '<label class="zs-field"><input id="zs-trial-count" type="checkbox" style="width:auto;min-height:auto;display:inline-block;margin-right:7px">Physical count confirmed (Opening Stock only)</label>'+
  '<p class="zs-preview-note">Manager can record the first opening count. Manager/Supervisor can add test purchases after opening. No database changes.</p>'+
  '<div class="zs-actions"><button type="button" class="zs-ghost" onclick="zukStockTrialSave()">Record Test Entry</button></div></div>';
 }
function trialHistory(c){
 const events=[...stockTrial.events].filter(x=>x.department===department).reverse();
 return '<div class="zs-panel"><h3>Stock History · Test Mode</h3>'+
 (events.length?'<div class="zs-table-wrap"><table><thead><tr><th>No.</th><th>Type</th><th>Material</th><th>Brand</th><th>Quantity</th><th>Total (OMR)</th><th>Reference</th></tr></thead><tbody>'+
 events.map(e=>'<tr><td>'+e.id+'</td><td>'+esc(e.kind)+'</td>'+
 '<td>'+esc(c.materials.find(x=>String(x.id)===e.materialId)?.name||e.materialId)+'</td>'+
 '<td>'+esc(c.brands.find(x=>String(x.id)===e.brandId)?.name||e.brandId)+'</td>'+
 '<td>'+fmt(e.qty)+'</td><td>'+OMR(e.value)+'</td><td>'+esc(e.note)+'</td></tr>').join('')+
 '</tbody></table></div>':'<p>No test transactions recorded yet.</p>')+
 '<p class="zs-preview-note">History appears in this browser tab only, not in the production audit trail.</p></div>';
}
function trialReports(c){
 const rows=[...stockTrial.balances.values()].filter(x=>x.department===department);
 const total=rows.reduce((sum,row)=>sum+row.value,0);
 return '<div class="zs-stats">'+
 [['Test stock value',OMR(total)+' OMR'],['Materials with test opening',String(rows.length)],
 ['Test transactions',String(stockTrial.events.filter(x=>x.department===department).length)]]
 .map(([k,v])=>'<div class="zs-stat"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('')+
 '</div><div class="zs-panel"><h3>Stock Reports · Test Mode</h3>'+
 '<p class="zs-preview-note">Only the current tab test entries are included. Real reporting and printing remain disabled.</p></div>';
}
window.zukStockTestStart=()=>{
 if(window.ZUKAIT_STOCK_QA_SIMULATION!==true||!previewOnly()||!allowed())return;
 stockTrial.active=true;stockTrial.message='';
 showPreview();
};
window.zukStockTestReset=()=>{
 if(window.ZUKAIT_STOCK_QA_SIMULATION!==true||!stockTrial.active||!allowed()||!window.confirm?.('Clear all test stock entries in this browser tab?'))return;
 stockTrial.balances.clear();stockTrial.events=[];stockTrial.message='';
 showPreview();
};
window.zukStockTrialCalculate=()=>{
 if(!stockTrial.active||!allowed())return;
 const d=document,qty=Number(d.getElementById('zs-trial-qty')?.value),
 price=Number(d.getElementById('zs-trial-price')?.value),
 method=d.getElementById('zs-trial-method')?.value,
 output=d.getElementById('zs-trial-calculated');
 if(!output)return;
 if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<=0){
  output.textContent='Enter quantity and price to calculate cost.';return;
 }
 const total=method==='unit'?price*qty:price;
 output.textContent='Quantity '+fmt(qty)+' · Unit cost '+OMR(total/qty)+' OMR · Total '+OMR(total)+' OMR. Test mode — not saved to Supabase.';
};
window.zukStockTrialResolvePair=()=>{
 const input=document.getElementById('zs-trial-pair'),value=String(input?.value||'').trim().toLowerCase();
 const pair=previewPairs().find(x=>(x.material.name+' — '+(x.brand?.name||'Not assigned')).trim().toLowerCase()===value);
 const material=document.getElementById('zs-trial-material'),brand=document.getElementById('zs-trial-brand');
 if(material)material.value=pair?.material.id||'';
 if(brand)brand.value=pair?.brand?.id||'';
 return !!pair;
};
window.zukStockTrialSave=()=>{
 if(window.ZUKAIT_STOCK_QA_SIMULATION!==true||!stockTrial.active||!allowed())return;
 const d=document,get=id=>d.getElementById(id),c=catalog();
 window.zukStockTrialResolvePair?.();
 const kind=String(get('zs-trial-entry')?.value||''),
 materialId=String(get('zs-trial-material')?.value||''),
 brandId=String(get('zs-trial-brand')?.value||''),
 qty=Number(get('zs-trial-qty')?.value),price=Number(get('zs-trial-price')?.value),
 priceMethod=get('zs-trial-method')?.value,note=String(get('zs-trial-note')?.value||'').trim();
 const material=c.materials.find(x=>String(x.id)===materialId);
 const isValidPair=previewPairs().some(r=>String(r.material.id)===materialId&&String(r.brand?.id||'')===brandId);
 const total=priceMethod==='unit'?qty*price:price;
 const key=trialKey(materialId,brandId),old=stockTrial.balances.get(key);
 let problem='';
 if(!['OPENING','PURCHASE'].includes(kind)||!material||!isValidPair)problem='Choose a valid material and brand.';
 else if(!Number.isFinite(qty)||qty<=0||qty>100000||!Number.isFinite(price)||price<=0||
   price>1000000||!Number.isFinite(total)||total>1000000)problem='Enter a positive quantity and actual cost.';
 else if(String(material.unit).toLowerCase()==='piece'&&!Number.isInteger(qty))problem='Piece quantities must be whole numbers.';
 else if(!['unit','total'].includes(priceMethod))problem='Choose a valid price method.';
 else if(note.length<5||note.length>180)problem='Enter a reference of 5–180 characters.';
 else if(kind==='OPENING'&&(!manager()||get('zs-trial-count')?.checked!==true))problem='Manager must confirm the physical opening count.';
 else if(kind==='OPENING'&&old)problem='Opening stock already recorded for this test item.';
 else if(kind==='PURCHASE'&&!old)problem='Record opening stock for this material/brand before purchasing.';
 const status=d.getElementById('zs-trial-calculated');
 if(problem){stockTrial.message=problem;if(status)status.textContent=problem;return;}
 const row={department,materialId,brandId,unit:material.unit,qty:(old?.qty||0)+qty,
   value:Math.round(((old?.value||0)+total)*1000)/1000};
 stockTrial.balances.set(key,row);
 stockTrial.events.push({id:stockTrial.events.length+1,department,kind,materialId,brandId,
  qty,value:Math.round(total*1000)/1000,note});
 stockTrial.message=kind+' test entry recorded: '+fmt(qty)+' '+esc(material.unit)+'.';
 preview.page='balance';showPreview();
};
function previewAdd(c){
  const options=previewPairs().filter(x=>stockMaterialInDepartment(x.material)).map(x=>
   '<option value="'+esc(x.material.name+' — '+(x.brand?.name||'Not assigned'))+'" data-pair="'+esc(x.material.id)+'|'+esc(x.brand?.id||'')+'"></option>').join('');
  return '<div class="zs-panel"><h3>Add Stock — Preview</h3>'+
   '<p class="zs-preview-note">Enter liquids directly in litres after manual conversion. No tins or drums conversion. Other master items retain their existing unit. '+
   'Prices may be entered per unit or as a total purchase amount. Nothing is posted in preview.</p>'+
   '<div class="zs-formgrid"><label class="zs-field">Entry type<select id="zs-preview-entry">'+
   (manager()?'<option value="OPENING">Opening Stock (verified physical count)</option>':'')+
   (legacyEntryQA()?'<option value="PURCHASE">Purchased Stock</option>':'')+'</select></label>'+
   '<label class="zs-field">Search Material + Brand<input id="zs-preview-add-pair" list="zs-preview-add-pairs" autocomplete="off" placeholder="Type material or brand name"></label>'+
   '<datalist id="zs-preview-add-pairs">'+options+'</datalist>'+
   '<label class="zs-field">Quantity (existing material unit)<input id="zs-preview-qty" type="number" min="0" step="any" placeholder="Enter quantity" oninput="zukStockPreviewPrice()"></label>'+
   '<label class="zs-field">Price entry method<select id="zs-preview-method" onchange="zukStockPreviewPrice()">'+
   '<option value="total">Total Purchase Price</option><option value="unit">Price per Unit</option></select></label>'+
   '<label class="zs-field" id="zs-preview-price-label">Total Purchase Price (OMR)<input id="zs-preview-price" type="number" min="0" step="any" placeholder="Enter price" oninput="zukStockPreviewPrice()"></label></div>'+
   '<div class="zs-panel zs-calculation-card" style="margin:12px 0">'+
   '<b>Calculated preview only</b><div class="zs-preview-note" id="zs-preview-calculated" role="status">Enter quantity and price to calculate a preview.</div></div>'+
   '<label class="zs-field">Opening count reference<textarea rows="2" placeholder="Physical stock confirmation"></textarea></label>'+
   '<div class="zs-actions"><button type="button" class="zs-disabled" disabled>Save Stock — Not Active</button></div></div>';
 }
function previewHistory(){
 return '<div class="zs-panel"><h3>Stock History</h3><p class="zs-preview-note">This tab will display bounded, audited purchase, issue, return and adjustment records after stock activation.</p>'+
 '<div class="zs-table-wrap"><table aria-label="Stock History preview"><thead><tr><th>Date</th><th>Action</th><th>Material</th><th>Brand</th><th>Quantity</th><th>Value (OMR)</th><th>Reference</th></tr></thead>'+
 '<tbody><tr><td colspan="7">No stock ledger is active. No transaction history is shown.</td></tr></tbody></table></div></div>';
}
function previewAdjust(c){
 return '<div class="zs-panel"><h3>Stock Adjustment — Preview</h3>'+
 (!manager()?'<p class="zs-warning">Stock adjustment is Manager-only. Supervisors can view this description but cannot submit adjustments.</p>':
  '<div class="zs-formgrid"><label class="zs-field">Material<select>'+previewFormOptions(c.materials)+'</select></label>'+
  '<label class="zs-field">Brand<select>'+previewFormOptions(c.brands)+'</select></label>'+
  '<label class="zs-field">Current stock<input value="Not initialized" readonly></label>'+
  '<label class="zs-field">New physical count<input type="number" min="0" step="any" placeholder="Actual counted quantity"></label></div>'+
  '<label class="zs-field">Reason<textarea rows="2" placeholder="Required reason for variance"></textarea></label>'+
  '<p class="zs-preview-note">Stock difference cannot be calculated until a verified opening balance exists. No adjustments can be submitted.</p>'+
  '<button type="button" class="zs-disabled" disabled>Save Adjustment — Not Active</button>')+'</div>';
}
function previewReports(c){
 return '<div class="zs-stats">'+
 [['Material types',String(c.materials.length)],['Current stock valuation','Not initialized'],
 ['Reserved value','Not initialized'],['Low stock items','Not initialized']]
 .map(([k,v])=>'<div class="zs-stat"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+
 '<div class="zs-panel"><h3>Stock Reports</h3><p class="zs-preview-note">Reports will use verified stock transactions and server-side aggregates. '+
 'No inventory valuation is inferred from the old material price list.</p>'+
 '<div class="zs-actions"><button type="button" disabled class="zs-disabled">Print / PDF — Not Active</button>'+
 '<button type="button" disabled class="zs-disabled">Export Excel — Not Active</button></div></div>';
}
function previewJobCard(c,kind){
 const isReturn=kind==='return';
 return '<div class="zs-panel"><h3>'+(isReturn?'Return Unused Material':'Supervisor — Suggest Material')+' · Preview</h3>'+
 '<p class="zs-preview-note">These are workflow controls only. No reservation, issue, return, deduction or Job Card cost will be saved.</p>'+
 '<div class="zs-formgrid"><label class="zs-field">Job Card number<input placeholder="Enter Job Card number"></label>'+
 '<label class="zs-field">Material<select>'+previewFormOptions(c.materials)+'</select></label>'+
 '<label class="zs-field">Brand<select>'+previewFormOptions(c.brands)+'</select></label>'+
 '<label class="zs-field">'+(isReturn?'Unused return quantity':'Suggested quantity')+' (material unit)<input type="number" min="0" step="any" placeholder="Quantity"></label></div>'+
 '<div class="zs-panel" style="background:#f2f7fc"><b>'+(isReturn?'Return credit':'Locked unit cost')+': Not initialized</b>'+
 '<p class="zs-preview-note">'+(isReturn?
  'The return must use the original Job Card locked cost and must not exceed verified issued quantity.':
  'The weighted-average unit cost will lock when first reserved for this Job Card. Later purchases cannot change earlier reserved cost; additional suggestions lock their own cost.')+
 '</p></div><div class="zs-actions"><button class="zs-ghost" type="button" onclick="zukStockPreviewNavigate(\'balance\')">← Stock Balance</button>'+
 '<button class="zs-disabled" type="button" disabled>'+(isReturn?'Confirm Return':'Add Suggestion')+' — Not Active</button></div></div>';
}

const previewHomeCss='<style>'+
 '#zs-stock-screen{position:fixed;inset:0;z-index:2147483000;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:linear-gradient(145deg,#f3f8ff,#ffffff 56%,#e9f4fd);color:#14263c}'+
 '#zs-stock-screen .zs-preview{max-width:1250px;min-height:100%;padding:clamp(15px,3vw,36px);margin:0 auto}'+
 '#zs-stock-screen .zs-screen-toolbar{background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 15px;margin:0 0 16px;border:1px solid #d1e1f1;border-radius:15px;box-shadow:0 5px 18px #25446a0b}'+
 '#zs-stock-screen .zs-screen-brand{font-weight:900;color:#173f75;font-size:18px;letter-spacing:.025em}'+
 '#zs-stock-screen .zs-preview h2{font-size:clamp(23px,3vw,32px);margin:22px 0 12px}'+
 '#zs-stock-screen .zs-preview .zs-home-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0 24px}'+
 '#zs-stock-screen .zs-preview .zs-home-tile{display:flex;flex-direction:column;align-items:flex-start;min-height:190px;padding:22px;gap:12px;transition:transform .15s ease,box-shadow .15s ease;box-shadow:0 8px 23px #194a7914}'+
 '#zs-stock-screen .zs-preview .zs-home-tile:hover{transform:translateY(-2px);box-shadow:0 12px 27px #194a7926}'+
 '#zs-stock-screen .zs-preview .zs-home-icon{font-size:24px;flex:0 0 52px;height:52px;width:52px;border-radius:15px;box-shadow:0 2px 8px #123c5b14}'+
 '#zs-stock-screen .zs-preview .zs-home-info strong{font-size:19px}'+
 '#zs-stock-screen .zs-preview .zs-home-info small{font-size:13px}'+
 '#zs-stock-screen .zs-preview .zs-home-chevron{position:absolute;right:20px;bottom:15px;align-self:auto;font-size:27px}'+
 '#zs-stock-screen .zs-preview .zs-home-tile:last-child{grid-column:auto}'+
 '#zs-stock-screen .zs-preview .zs-panel{padding:clamp(14px,2.5vw,27px);box-shadow:0 3px 15px #194a790a}'+
 '#zs-stock-screen .zs-preview[data-stock-view="history"] .zs-panel{background:#f7f2ff;border-color:#d9c9ee}'+
 '#zs-stock-screen .zs-preview[data-stock-view="history"] .zs-panel h3{color:#62418a}'+
 '#zs-stock-screen .zs-preview[data-stock-view="adjust"] .zs-panel{background:#fff5e9;border-color:#f0d4b1}'+
 '#zs-stock-screen .zs-preview[data-stock-view="adjust"] .zs-panel h3{color:#875521}'+
 '#zs-stock-screen .zs-preview[data-stock-view="reports"] .zs-panel{background:#edf8f6;border-color:#c2e1d9}'+
 '#zs-stock-screen .zs-preview[data-stock-view="reports"] .zs-panel h3{color:#25685f}'+
 '#zs-stock-screen .zs-preview[data-stock-view="add"] .zs-panel{background:#f1f8ef;border-color:#cfe3c7}'+
 '#zs-stock-screen .zs-preview[data-stock-view="add"] .zs-panel h3{color:#42693b}'+
 '#zs-stock-screen .zs-preview .zs-field input:focus,#zs-stock-screen .zs-preview .zs-field select:focus,#zs-stock-screen .zs-preview .zs-field textarea:focus{outline:3px solid #84b7e7;outline-offset:1px;border-color:#367ab6}'+
 '#zs-stock-screen .zs-preview .zs-calculation-card{background:#fff!important;border-left:5px solid #74a96e!important}'+
 '@media(max-width:900px){#zs-stock-screen .zs-preview .zs-home-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#zs-stock-screen .zs-preview .zs-home-tile:last-child{grid-column:auto}}'+
 '@media(max-width:600px){#zs-stock-screen .zs-preview .zs-home-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}#zs-stock-screen .zs-preview .zs-home-tile:last-child{grid-column:auto}#zs-stock-screen .zs-preview .zs-home-tile{min-width:0;min-height:150px;padding:13px;gap:7px}#zs-stock-screen .zs-preview .zs-home-icon{flex:0 0 36px;width:36px;height:36px;font-size:20px}#zs-stock-screen .zs-screen-toolbar{padding:9px 10px;gap:5px}#zs-stock-screen .zs-screen-brand{font-size:14px}}'+

 '.zs-preview .zs-home-hero{border-radius:17px;padding:20px 22px;background:linear-gradient(110deg,#e6f1ff,#f3faff);border:1px solid #bfd8ef;margin:14px 0}'+
 '.zs-preview .zs-home-hero h3{font-size:22px;color:#193f6d;margin:0 0 7px}'+
 '.zs-preview .zs-home-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:15px 0}'+
 '.zs-preview .zs-home-tile{position:relative;text-align:left;display:flex;align-items:flex-start;gap:13px;min-height:132px;padding:18px;border-radius:15px;border:1px solid #bdd4f0;background:#e9f3ff;color:#173f66;box-shadow:0 3px 10px #1b406014;cursor:pointer;white-space:normal}'+
 '.zs-preview .zs-home-tile:focus-visible{outline:3px solid #1769b8;outline-offset:3px}'+
 '.zs-preview .zs-home-icon{font-size:22px;border-radius:13px;display:grid;place-items:center;flex:0 0 46px;height:46px;background:#ffffffd9}'+
 '.zs-preview .zs-home-info{display:block;min-width:0;flex:1}'+
 '.zs-preview .zs-home-info strong{font-size:17px;display:block;margin:1px 0 7px;color:#163354}'+
 '.zs-preview .zs-home-info small{font-size:12px;line-height:1.5;display:block;color:#405875}'+
 '.zs-preview .zs-home-chevron{font-size:21px;font-weight:900;align-self:center}'+
 '.zs-preview .zs-home-tile.green{background:#e8f8ee;border-color:#b7e6c8}'+
 '.zs-preview .zs-home-tile.purple{background:#f2ebfc;border-color:#dac4ef}'+
 '.zs-preview .zs-home-tile.orange{background:#fff2e6;border-color:#efd3b6}'+
 '.zs-preview .zs-home-tile.teal{background:#e6f8f8;border-color:#b7dfdf}'+
 '.zs-preview .zs-home-tile:last-child{grid-column:span 2}'+
 '@media(max-width:620px){.zs-preview .zs-home-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.zs-preview .zs-home-tile:last-child{grid-column:auto}.zs-preview .zs-home-tile{min-height:150px;padding:13px}}'+

 /* Dedicated Stock-card palette: avoid inherited global blue/green/purple
    backgrounds and dark text, including on narrow phones. */
 '#zs-stock-screen .zs-screen-toolbar{background:#142740!important;color:#fff!important;border-color:#142740!important}'+
 '#zs-stock-screen .zs-screen-brand{color:#ffffff!important;text-shadow:none!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile{border:1px solid transparent!important;color:#ffffff!important;box-shadow:0 5px 20px #1e42642d!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile.blue{background:linear-gradient(135deg,#255ce1,#1647b4)!important;border-color:#1647b4!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile.green{background:linear-gradient(135deg,#19824f,#12663f)!important;border-color:#12663f!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile.purple{background:linear-gradient(135deg,#7428d4,#581eaf)!important;border-color:#581eaf!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile.orange{background:linear-gradient(135deg,#b45e16,#914511)!important;border-color:#914511!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile.teal{background:linear-gradient(135deg,#13818a,#0e626b)!important;border-color:#0e626b!important}'+
 '#zs-stock-screen .zs-preview .zs-home-info strong{color:#ffffff!important;font-weight:800!important;text-shadow:none!important}'+
 '#zs-stock-screen .zs-preview .zs-home-info small{color:#f4f7ff!important;font-weight:600!important;font-size:14px!important;line-height:1.5!important}'+
 '#zs-stock-screen .zs-preview .zs-home-chevron{color:#ffffff!important}'+
 '#zs-stock-screen .zs-preview .zs-home-icon{background:#ffffffed!important;color:#194f7d!important;box-shadow:0 3px 9px #163a5a22!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile:hover{box-shadow:0 10px 26px #1e42644d!important;transform:translateY(-2px)}'+
 '#zs-stock-screen .zs-preview .zs-home-tile:focus-visible{outline:3px solid #152b45!important;outline-offset:3px}'+
 '@media(max-width:600px){#zs-stock-screen .zs-screen-brand{order:3;flex:1 0 100%;text-align:center;padding:5px 0 0;font-size:16px!important}#zs-stock-screen .zs-preview .zs-home-info strong{font-size:16px!important;line-height:1.24!important;overflow-wrap:anywhere}#zs-stock-screen .zs-preview .zs-home-info small{font-size:11px!important;line-height:1.4!important}#zs-stock-screen .zs-preview .zs-home-chevron{right:9px;bottom:7px}}'+
  '#zs-stock-screen .zs-manager-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0 8px}'+
 '#zs-stock-screen .zs-manager-actions button{display:flex;flex-direction:column;align-items:flex-start;gap:7px;text-align:left;border:1px solid transparent!important;border-radius:15px;padding:16px;color:#fff!important;font-size:17px!important;font-weight:800!important;min-height:116px;min-width:0;width:100%;white-space:normal;overflow-wrap:anywhere;box-shadow:0 6px 16px #14385a26}'+
 '#zs-stock-screen .zs-manager-actions .zs-create-item{background:linear-gradient(135deg,#7740d2,#55229a)!important}'+
 '#zs-stock-screen .zs-manager-actions .zs-materials-btn{background:linear-gradient(135deg,#087e92,#085a77)!important}'+
 '#zs-stock-screen .zs-manager-actions .zs-action-icon{font-size:21px;line-height:1.2;background:#ffffffeb;border-radius:9px;padding:5px;color:#17395a}'+
 '#zs-stock-screen .zs-manager-actions button small{font-size:12px;line-height:1.35;color:#f4faff!important;font-weight:600}'+
 '#zs-stock-screen .zs-manager-actions button:focus-visible{outline:3px solid #174db2;outline-offset:3px}'+
 '@media(max-width:600px){#zs-stock-screen .zs-manager-actions{gap:9px}#zs-stock-screen .zs-manager-actions button{padding:12px;min-height:116px;font-size:15px!important}#zs-stock-screen .zs-manager-actions button small{font-size:11px}}'+
  '#zs-stock-screen .zs-department-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0}'+
  '#zs-stock-screen .zs-department-card{min-height:160px;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:12px;text-align:left;border:1px solid #235d94;border-radius:15px;padding:16px;color:#fff;background:linear-gradient(135deg,#255ce1,#173f90);font-weight:750;cursor:pointer;min-width:0}'+
  '#zs-stock-screen .zs-department-card.mechanical{background:linear-gradient(135deg,#117c73,#09534d);border-color:#09534d}'+
  '#zs-stock-screen .zs-department-card strong{font-size:clamp(16px,2.1vw,20px);line-height:1.3;color:#fff!important;overflow-wrap:anywhere}'+
  '#zs-stock-screen .zs-department-card small{font-size:12px;line-height:1.45;color:#eefbff!important}'+
  '#zs-stock-screen .zs-department-card:focus-visible{outline:3px solid #142740;outline-offset:3px}'+
  '@media(max-width:600px){#zs-stock-screen .zs-department-grid{gap:10px}#zs-stock-screen .zs-department-card{min-height:142px;padding:12px;gap:8px}#zs-stock-screen .zs-department-card small{font-size:11px}}'+
  /* Clean Stock landing dashboard. Apply ONLY to department chooser;
     five Stock function screens and Stock data services stay untouched. */
 '#zs-stock-screen .zs-entry-home{display:grid;gap:18px;max-width:980px;margin:0 auto;padding-bottom:26px}'+
 '#zs-stock-screen .zs-entry-hero{position:relative;overflow:hidden;background:linear-gradient(116deg,#f7fbff 0%,#fff 64%,#edf5f9 100%);border:1px solid #d5e5f4;border-radius:19px;padding:22px 24px;box-shadow:0 5px 22px #17365a0a}'+
 '#zs-stock-screen .zs-entry-hero:after{content:"";position:absolute;right:-38px;top:-56px;width:160px;height:160px;border-radius:50%;border:26px solid #d9eafb66;pointer-events:none}'+
 '#zs-stock-screen .zs-entry-eyebrow{display:flex;align-items:center;gap:7px;font-weight:850;font-size:12px;letter-spacing:.08em;color:#23629e;margin-bottom:9px}'+
 '#zs-stock-screen .zs-entry-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#20a980}'+
 '#zs-stock-screen .zs-entry-hero h2{position:relative;font-size:clamp(24px,3vw,31px)!important;line-height:1.18!important;letter-spacing:-.025em;color:#173856!important;margin:0 0 8px!important;font-weight:900}'+
 '#zs-stock-screen .zs-entry-hero p{position:relative;font-size:14px;line-height:1.45;color:#4a6179;margin:0;max-width:460px}'+
 '#zs-stock-screen .zs-entry-section{display:grid;gap:10px;min-width:0}'+
 '#zs-stock-screen .zs-entry-section-head{display:flex;gap:11px;align-items:center;padding:0 3px}'+
 '#zs-stock-screen .zs-entry-section-symbol{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border-radius:11px;background:#e9f2fc;color:#225e9a;font-size:21px}'+
 '#zs-stock-screen .zs-entry-setup-section .zs-entry-section-symbol{background:#e8f1fa;color:#34617f}'+
 '#zs-stock-screen .zs-entry-section-head h3{font-size:19px!important;font-weight:850!important;line-height:1.25!important;color:#172e49!important;margin:0!important}'+
 '#zs-stock-screen .zs-entry-section-head p{font-size:13px!important;line-height:1.35!important;color:#536b81!important;margin:3px 0 0!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-grid,#zs-stock-screen .zs-entry-home .zs-manager-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;margin:0!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-card,#zs-stock-screen .zs-entry-home .zs-manager-actions button{position:relative;display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:9px!important;min-height:164px!important;max-width:100%;min-width:0!important;padding:16px!important;text-align:left!important;border:1px solid #c9d9e8!important;border-radius:17px!important;white-space:normal!important;overflow-wrap:anywhere!important;box-shadow:0 4px 12px #2248640e!important;transition:transform .15s ease,box-shadow .15s ease}'+
 '#zs-stock-screen .zs-entry-home .zs-department-card.painting{background:linear-gradient(150deg,#f0f6ff,#e6f0fc)!important;border-top:4px solid #467ebd!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-card.mechanical{background:linear-gradient(150deg,#edf9f6,#e3f3ef)!important;border-top:4px solid #448f84!important}'+
 '#zs-stock-screen .zs-entry-home .zs-manager-actions .zs-create-item{background:linear-gradient(150deg,#f3f6fb,#e9f0f8)!important;border-top:4px solid #6b88a7!important}'+
 '#zs-stock-screen .zs-entry-home .zs-manager-actions .zs-materials-btn{background:linear-gradient(150deg,#eff7fb,#e4f2f8)!important;border-top:4px solid #5d9cb8!important}'+
 '#zs-stock-screen .zs-entry-card-top{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:7px;width:100%;min-height:38px}'+
 '#zs-stock-screen .zs-entry-home .zs-department-icon,#zs-stock-screen .zs-entry-home .zs-action-icon{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:11px;background:#ffffffed!important;color:#174866!important;font-size:20px!important;line-height:1!important;box-shadow:0 2px 8px #0e25331b}'+
 '#zs-stock-screen .zs-entry-arrow{display:grid;place-items:center;color:#365f7a!important;font-size:25px;font-weight:900;width:23px;height:29px;opacity:.95}'+
 '#zs-stock-screen .zs-entry-home .zs-department-card strong,#zs-stock-screen .zs-entry-home .zs-manager-actions button strong{display:block;color:#1a3c56!important;font-size:clamp(16px,1.65vw,19px)!important;font-weight:850!important;line-height:1.24!important;letter-spacing:-.01em;white-space:normal!important;overflow-wrap:anywhere!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-card small,#zs-stock-screen .zs-entry-home .zs-manager-actions button small{display:block;color:#47627a!important;font-size:13px!important;font-weight:550!important;line-height:1.33!important;white-space:normal!important;overflow-wrap:anywhere!important;letter-spacing:0}'+
 '#zs-stock-screen .zs-entry-home button:hover{transform:translateY(-2px)!important;box-shadow:0 8px 20px #15375120!important}'+
 '#zs-stock-screen .zs-entry-home button:focus-visible{outline:3px solid #256aa3!important;outline-offset:3px}'+
 '#zs-stock-screen .zs-screen-toolbar>.zs-ghost{min-height:43px!important;min-width:0!important;max-width:100%;padding:10px 14px!important;font-size:14px!important;font-weight:800!important;line-height:1.2!important;border-radius:10px!important;border:1px solid #6d839c!important;background:#2e4560!important;color:#fff!important;white-space:normal!important}'+
 '#zs-stock-screen .zs-screen-toolbar .zs-screen-brand{display:flex;align-items:center;justify-content:center;color:#fff!important;font-size:16px!important;letter-spacing:.02em!important}'+
 '@media(max-width:600px){#zs-stock-screen .zs-preview{padding:12px!important}#zs-stock-screen .zs-screen-toolbar{gap:8px!important;align-items:center!important;padding:10px!important;margin-bottom:14px!important}#zs-stock-screen .zs-screen-toolbar>.zs-ghost{font-size:13px!important;min-height:43px!important;padding:10px!important}#zs-stock-screen .zs-screen-toolbar .zs-screen-brand{order:3;flex:1 0 100%;text-align:center;padding:0!important;font-size:15px!important}#zs-stock-screen .zs-entry-home{gap:17px}#zs-stock-screen .zs-entry-hero{padding:20px 17px;border-radius:16px}#zs-stock-screen .zs-entry-home .zs-department-grid,#zs-stock-screen .zs-entry-home .zs-manager-actions{gap:10px!important}#zs-stock-screen .zs-entry-home .zs-department-card,#zs-stock-screen .zs-entry-home .zs-manager-actions button{padding:13px!important;min-height:169px!important;gap:8px!important}#zs-stock-screen .zs-entry-home .zs-department-card strong,#zs-stock-screen .zs-entry-home .zs-manager-actions button strong{font-size:17px!important}#zs-stock-screen .zs-entry-home .zs-department-card small,#zs-stock-screen .zs-entry-home .zs-manager-actions button small{font-size:13px!important;line-height:1.32!important}}'+
 /* Light unified palette only on the four-card Stock chooser; preserve detail-screen theme. */
 '#zs-stock-screen:has(.zs-entry-home){background:linear-gradient(160deg,#f5f9fd,#f0f6fa 72%,#ffffff)!important}'+
 '#zs-stock-screen:has(.zs-entry-home) .zs-screen-toolbar{background:#eaf3fa!important;color:#193d58!important;border:1px solid #c8dae9!important;box-shadow:0 3px 12px #214c710a!important}'+
 '#zs-stock-screen:has(.zs-entry-home) .zs-screen-brand{color:#1b4b6d!important;text-shadow:none!important}'+
 '#zs-stock-screen:has(.zs-entry-home) .zs-screen-toolbar>.zs-ghost{background:#ffffff!important;color:#1c4a6c!important;border:1px solid #b8d0e0!important;box-shadow:none!important}'+
 '#zs-stock-screen:has(.zs-entry-home) .zs-screen-toolbar>.zs-ghost:focus-visible{outline:3px solid #2c6da6!important;outline-offset:2px}'+
 '@media(max-width:349px){#zs-stock-screen .zs-entry-home .zs-department-grid,#zs-stock-screen .zs-entry-home .zs-manager-actions{grid-template-columns:minmax(0,1fr)!important}#zs-stock-screen .zs-entry-home .zs-department-card,#zs-stock-screen .zs-entry-home .zs-manager-actions button{min-height:132px!important;padding:15px!important}}'+
 /* Approved Workshop Performance-inspired Stock home, mockup-matched pastel cards. */
 '#zs-stock-screen:has(.zs-entry-home){background:#f9fbfe!important;color:#152b46!important}'+
 '#zs-stock-screen:has(.zs-entry-home) .zs-preview{max-width:1060px!important}'+
 '#zs-stock-screen:has(.zs-entry-home) .zs-screen-toolbar{background:transparent!important;border:0!important;box-shadow:none!important;margin:0 0 14px!important;padding:8px 0!important}'+
 '#zs-stock-screen:has(.zs-entry-home) .zs-screen-toolbar>.zs-ghost:first-child{background:#13466b!important;color:#fff!important;border:1px solid #13466b!important;border-radius:999px!important;padding:11px 16px!important}'+
 '#zs-stock-screen:has(.zs-entry-home) .zs-screen-toolbar>.zs-ghost:last-child{background:#fff!important;color:#17334f!important;border:1px solid #b9c9dc!important;border-radius:999px!important;padding:11px 16px!important}'+
 '#zs-stock-screen:has(.zs-entry-home) .zs-screen-brand{color:#284d6b!important;font-size:13px!important;letter-spacing:0!important}'+
 '#zs-stock-screen .zs-entry-home{max-width:980px!important;gap:26px!important}'+
 '#zs-stock-screen .zs-entry-hero{display:flex;gap:16px;align-items:center;padding:23px 20px!important;background:#fff!important;border:1px solid #e2e9f4!important;border-radius:21px!important;box-shadow:0 3px 13px #263e5c0a!important}'+
 '#zs-stock-screen .zs-entry-hero:after{display:none!important}'+
 '#zs-stock-screen .zs-entry-hero-icon{width:66px;height:66px;flex:0 0 66px;display:grid;place-items:center;border-radius:50%;background:#dff5ff;color:#137bad;font-size:42px;line-height:1}'+
 '#zs-stock-screen .zs-entry-hero-text{min-width:0;flex:1}'+
 '#zs-stock-screen .zs-entry-hero h2{font-size:clamp(23px,3vw,30px)!important;line-height:1.13!important;color:#10263f!important;margin:0 0 8px!important;letter-spacing:-.02em}'+
 '#zs-stock-screen .zs-entry-hero p{font-size:14px!important;line-height:1.5!important;color:#40556f!important;margin:0!important}'+
 '#zs-stock-screen .zs-entry-section{gap:14px!important}'+
 '#zs-stock-screen .zs-entry-section-head{padding:0 5px!important}'+
 '#zs-stock-screen .zs-entry-section-head h3{font-size:24px!important;color:#162b47!important;letter-spacing:-.01em!important}'+
 '#zs-stock-screen .zs-entry-section-head p{font-size:14px!important;color:#4b6077!important;margin:4px 0 0!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-grid,#zs-stock-screen .zs-entry-home .zs-manager-actions{gap:14px!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-card,#zs-stock-screen .zs-entry-home .zs-manager-actions button{justify-content:flex-start!important;min-height:186px!important;gap:10px!important;border:1px solid transparent!important;border-radius:20px!important;padding:18px!important;box-shadow:0 2px 6px #1c396108!important;transform:none!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-card.painting{background:#edf4ff!important;border-color:#cbdffc!important;border-top:1px solid #cbdffc!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-card.mechanical{background:#eef9f0!important;border-color:#d3eed8!important;border-top:1px solid #d3eed8!important}'+
 '#zs-stock-screen .zs-entry-home .zs-manager-actions .zs-create-item{background:#f8edff!important;border-color:#ead5fa!important;border-top:1px solid #ead5fa!important}'+
 '#zs-stock-screen .zs-entry-home .zs-manager-actions .zs-materials-btn{background:#fff7e9!important;border-color:#f9e3b8!important;border-top:1px solid #f9e3b8!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-card strong,#zs-stock-screen .zs-entry-home .zs-manager-actions button strong{font-size:clamp(16px,2vw,21px)!important;font-weight:850!important;line-height:1.23!important;color:#10243d!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-card small,#zs-stock-screen .zs-entry-home .zs-manager-actions button small{font-size:14px!important;line-height:1.44!important;color:#3d546d!important;font-weight:500!important}'+
 '#zs-stock-screen .zs-entry-home .zs-department-icon,#zs-stock-screen .zs-entry-home .zs-action-icon{width:53px!important;height:53px!important;flex:0 0 53px!important;border-radius:50%!important;color:#fff!important;font-size:27px!important;box-shadow:none!important}'+
 '#zs-stock-screen .zs-entry-home .painting .zs-department-icon{background:#318eea!important}'+
 '#zs-stock-screen .zs-entry-home .mechanical .zs-department-icon{background:#75c955!important}'+
 '#zs-stock-screen .zs-entry-home .zs-create-item .zs-action-icon{background:#ae72d1!important}'+
 '#zs-stock-screen .zs-entry-home .zs-materials-btn .zs-action-icon{background:#ffad38!important}'+
 '#zs-stock-screen .zs-entry-home .zs-entry-card-top{min-height:53px!important}'+
 '#zs-stock-screen .zs-entry-home .zs-entry-arrow{color:#3d5979!important;font-size:28px!important}'+
 '#zs-stock-screen .zs-entry-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;padding:17px 18px;background:#edf5ff;border:1px solid #c9dfff;border-radius:22px}'+
 '#zs-stock-screen .zs-entry-summary-item{display:flex;gap:12px;align-items:center;min-width:0}'+
 '#zs-stock-screen .zs-entry-summary-item+.zs-entry-summary-item{border-left:1px solid #c8d7eb;padding-left:18px}'+
 '#zs-stock-screen .zs-entry-summary-icon{height:46px;width:46px;flex:0 0 46px;display:grid;place-items:center;border-radius:50%;font-size:24px}'+
 '#zs-stock-screen .zs-entry-summary-icon.blue{background:#d9f1fe;color:#0b86c8}'+
 '#zs-stock-screen .zs-entry-summary-icon.amber{background:#fff0d5;color:#eda234}'+
 '#zs-stock-screen .zs-entry-summary-item small{display:block;font-size:13px;color:#2d4a65;font-weight:650}'+
 '#zs-stock-screen .zs-entry-summary-item strong{display:block;font-size:26px;line-height:1.2;color:#10233d;font-weight:900;margin-top:4px}'+
 '#zs-stock-screen .zs-entry-summary-note{grid-column:1/-1;font-size:11px;line-height:1.3;color:#516c82;margin:4px 0 0}'+
 '@media(max-width:600px){#zs-stock-screen .zs-entry-home{gap:22px!important}#zs-stock-screen .zs-entry-hero{padding:17px 14px!important;gap:12px!important}#zs-stock-screen .zs-entry-hero-icon{width:49px;height:49px;flex-basis:49px;font-size:31px}#zs-stock-screen .zs-entry-hero h2{font-size:22px!important}#zs-stock-screen .zs-entry-hero p{font-size:13px!important}#zs-stock-screen .zs-entry-section-head h3{font-size:23px!important}#zs-stock-screen .zs-entry-section-head p{font-size:13px!important}#zs-stock-screen .zs-entry-home .zs-department-grid,#zs-stock-screen .zs-entry-home .zs-manager-actions{gap:10px!important}#zs-stock-screen .zs-entry-home .zs-department-card,#zs-stock-screen .zs-entry-home .zs-manager-actions button{padding:12px!important;min-height:190px!important;gap:8px!important}#zs-stock-screen .zs-entry-home .zs-department-card strong,#zs-stock-screen .zs-entry-home .zs-manager-actions button strong{font-size:17px!important}#zs-stock-screen .zs-entry-home .zs-department-card small,#zs-stock-screen .zs-entry-home .zs-manager-actions button small{font-size:13px!important}#zs-stock-screen .zs-entry-home .zs-department-icon,#zs-stock-screen .zs-entry-home .zs-action-icon{height:46px!important;width:46px!important;flex-basis:46px!important;font-size:23px!important}#zs-stock-screen .zs-entry-summary{padding:12px;gap:8px}#zs-stock-screen .zs-entry-summary-item{gap:7px}#zs-stock-screen .zs-entry-summary-item+.zs-entry-summary-item{padding-left:9px}#zs-stock-screen .zs-entry-summary-icon{height:36px;width:36px;flex-basis:36px;font-size:19px}#zs-stock-screen .zs-entry-summary-item strong{font-size:23px}}'+
 '@media(max-width:349px){#zs-stock-screen .zs-entry-home .zs-department-grid,#zs-stock-screen .zs-entry-home .zs-manager-actions{grid-template-columns:minmax(0,1fr)!important}#zs-stock-screen .zs-entry-home .zs-department-card,#zs-stock-screen .zs-entry-home .zs-manager-actions button{min-height:150px!important;padding:17px!important}}'+
 /* V416 follow-up: readable pastel cards, independent Back/Close and mobile search. */
 '#zs-stock-screen .zs-screen-toolbar{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-areas:"back close" "brand brand"!important;align-items:center!important;gap:9px 12px!important;padding:12px!important;background:#f5f9fd!important;border:1px solid #d6e4ef!important;border-radius:14px!important;box-shadow:0 3px 12px #2346610c!important}'+
 '#zs-stock-screen .zs-screen-toolbar>.zs-ghost:first-child{grid-area:back!important;order:initial!important;flex:none!important;justify-self:start!important;min-width:0!important;max-width:100%!important;background:#174d72!important;border:1px solid #174d72!important;color:white!important;padding:11px 14px!important;font-size:14px!important;line-height:1.25!important;border-radius:10px!important;white-space:normal!important}'+
 '#zs-stock-screen .zs-screen-toolbar>.zs-ghost:last-child{grid-area:close!important;order:initial!important;flex:none!important;justify-self:end!important;min-width:0!important;max-width:100%!important;background:#fff!important;border:1px solid #b9d0e1!important;color:#1d4867!important;padding:11px 14px!important;font-size:14px!important;line-height:1.25!important;border-radius:10px!important}'+
 '#zs-stock-screen .zs-screen-toolbar .zs-screen-brand{grid-area:brand!important;order:initial!important;flex:none!important;display:block!important;justify-self:stretch!important;min-width:0!important;text-align:center!important;border-top:1px solid #dae6f0!important;padding:8px 0 0!important;color:#315b78!important;font-size:13px!important;line-height:1.2!important;white-space:normal!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile{background:#f5f9fd!important;color:#1a3a54!important;border:1px solid #d3e2ef!important;box-shadow:0 4px 12px #22455f11!important;transform:none!important;border-radius:17px!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile.blue{background:#edf5ff!important;border-color:#cbdff5!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile.green{background:#eff9ef!important;border-color:#cfe9d5!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile.purple{background:#f5effb!important;border-color:#e5d5f1!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile.orange{background:#fff4e9!important;border-color:#f0ddc9!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile.teal{background:#edf8fa!important;border-color:#cee8ed!important}'+
 '#zs-stock-screen .zs-preview .zs-home-info strong{color:#1b3852!important;text-shadow:none!important;font-weight:850!important;line-height:1.3!important}'+
 '#zs-stock-screen .zs-preview .zs-home-info small{color:#456078!important;text-shadow:none!important;font-size:13px!important;font-weight:550!important;line-height:1.42!important}'+
 '#zs-stock-screen .zs-preview .zs-home-chevron{color:#315b7a!important}'+
 '#zs-stock-screen .zs-preview .zs-home-icon{background:#fff!important;color:#1c629b!important;border:1px solid #d5e6f5!important;border-radius:50%!important;box-shadow:0 2px 7px #27476413!important}'+
 '#zs-stock-screen .zs-preview .zs-home-tile:focus-visible{outline:3px solid #2076b6!important;outline-offset:3px!important}'+
 '#zs-stock-screen .zs-preview .zs-home-hero{background:#f8fbff!important;border:1px solid #dce8f1!important;color:#183954!important}'+
 '#zs-stock-screen .zs-preview .zs-home-hero h3{color:#173650!important}'+
 '#zs-stock-screen .zs-pair-picker{min-width:0;width:100%;position:relative;margin-top:6px}'+
 '#zs-stock-screen #zs-material-brand-search{min-height:50px!important;font-size:16px!important;color:#153952!important;background:#fff!important;border:1px solid #a9c4d7!important}'+
 '#zs-stock-screen .zs-pair-results{margin-top:6px;max-height:240px;overflow-y:auto;overscroll-behavior:contain;background:#fff;border:1px solid #bed4e6;border-radius:12px;box-shadow:0 4px 12px #183a5812;padding:4px}'+
 '#zs-stock-screen .zs-pair-results[hidden],#zs-stock-screen .zs-pair-choice[hidden],#zs-stock-screen #zs-pair-empty[hidden]{display:none!important}'+
 '#zs-stock-screen .zs-pair-choice{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;min-height:49px;padding:12px 10px;background:#fff;color:#1c3e56;border:0;border-bottom:1px solid #e7edf4;border-radius:7px;text-align:left;font-size:15px!important;font-weight:700;white-space:normal;overflow-wrap:anywhere}'+
 '#zs-stock-screen .zs-pair-choice:hover,#zs-stock-screen .zs-pair-choice:focus-visible{background:#eaf4ff;color:#144c78;outline:2px solid #3a87c2;outline-offset:0}'+
 '#zs-stock-screen .zs-pair-choice small{flex:0 0 auto;color:#4b667b;font-size:12px}'+
 '#zs-stock-screen #zs-pair-hint{color:#49647b!important;line-height:1.4!important;font-size:13px!important}'+
 '#zs-stock-screen .zs-pair-more{width:100%!important;margin-top:8px!important;min-height:44px!important;background:#e7f2fc!important;color:#174e77!important;border:1px solid #b8d5e8!important}'+
 '#zs-stock-screen .zs:not(.zs-preview) label{font-size:14px!important;color:#264862!important;font-weight:750!important}'+
 '#zs-stock-screen .zs:not(.zs-preview) input:not([type=hidden]),#zs-stock-screen .zs:not(.zs-preview) select{min-height:48px!important;font-size:16px!important;color:#15334e!important;border-color:#b2c8db!important;border-radius:10px!important}'+
 '@media(max-width:600px){#zs-stock-screen .zs-screen-toolbar{gap:8px!important;padding:10px!important;margin-bottom:14px!important}#zs-stock-screen .zs-screen-toolbar>.zs-ghost:first-child,#zs-stock-screen .zs-screen-toolbar>.zs-ghost:last-child{min-height:45px!important;font-size:14px!important;padding:10px 12px!important}#zs-stock-screen .zs-screen-toolbar .zs-screen-brand{flex:none!important;order:initial!important;font-size:12px!important}#zs-stock-screen .zs-preview .zs-home-tile{min-height:160px!important;padding:14px!important;gap:8px!important}#zs-stock-screen .zs-preview .zs-home-info strong{font-size:16px!important}#zs-stock-screen .zs-preview .zs-home-info small{font-size:12px!important}}'+
 '</style>';
const previewHomeTiles=[
 ['balance','📦','Stock Balance','Available, reserved and total stock, with average cost','blue'],
 ['add','➕','Add Stock','Opening stock and purchases, with price calculation','green'],
 ['history','🕘','Stock History','Purchases, reservations, returns and adjustments','purple'],
 ['adjust','⚖️','Stock Adjustment','Physical stock counts and audit reasons','orange'],
 ['reports','📊','Stock Reports','Stock valuation, low stock and consumption reports','teal']
];
// Share the same full-screen host for preview and real inventory screens.
// One selected detail view replaces the menu; no modal on an activated app.
function renderStockScreen(markup,page){
 let screen=document.getElementById('zs-stock-screen');
 if(!screen){
  screen=document.createElement('main');
  screen.id='zs-stock-screen';
  screen.setAttribute('aria-label','Consumables Stock Management');
  screen.setAttribute('tabindex','-1');
  screen.dataset.savedOverflow=document.body.style.overflow||'';
  document.body.appendChild(screen);
  document.body.style.overflow='hidden';
 }
 screen.dataset.view=page;
 screen.innerHTML=markup;
 screen.scrollTop=0;
 screen.focus({preventScroll:true});
}
function departmentTitle(){
 return department==='Painting'?'Paint Consumables':
   department==='Mechanical'?'Mechanical Consumables':'Consumables Stock Management';
}
// Separate department entry points. A Both item shares one physical stock
// ledger balance; unassigned legacy materials are never auto-classified.
// Material/Brand changes use the existing audited Manager Material Master.
// Stock quantities are separate; the preview cannot create balances.
// Catalog setup belongs on the first Stock screen, not inside the five-card Stock menu.
const stockMasterActions=()=>manager()?
 '<div class="zs-entry-section zs-entry-setup-section">'+
 '<div class="zs-entry-section-head"><div>'+
 '<h3>Material Setup</h3><p>Create materials and manage brands and prices.</p></div></div>'+
 '<div class="zs-manager-actions" aria-label="Manager material setup">'+
 '<button type="button" class="zs-create-item" onclick="zukStockCreateItem()">'+
 '<span class="zs-entry-card-top"><span class="zs-action-icon" aria-hidden="true">＋</span><span class="zs-entry-arrow" aria-hidden="true">›</span></span>'+
 '<strong>Create Material</strong><small>Add new material, unit and department.</small></button>'+
 '<button type="button" class="zs-materials-btn" onclick="zukStockOpenMaterials()">'+
 '<span class="zs-entry-card-top"><span class="zs-action-icon" aria-hidden="true">◇</span><span class="zs-entry-arrow" aria-hidden="true">›</span></span>'+
 '<strong>Brand &amp; Price</strong><small>Assign brands and effective-dated prices.</small></button></div></div>':'';
const legacyEntryQA=()=>window.ZUKAIT_STOCK_QA_SIMULATION===true||isolatedStockPilot();
const departmentTiles=()=>previewHomeTiles.filter(t=>t[0]!=='add'||legacyEntryQA());
function departmentMenu(){
 // Counts describe the saved Material Master, NOT verified physical stock.
 // No mockup example values, remote requests or fabricated inventory.
 const totals=(typeof state!=='undefined'&&state?.consumables)?catalog():null;
 const materials=totals?String(totals.materials.length):'—';
 const brands=totals?String(totals.brands.length):'—';
 return '<div class="zs-entry-home">'+
  '<div class="zs-entry-hero">'+
  '<span class="zs-entry-hero-icon" aria-hidden="true">▱</span>'+
  '<div class="zs-entry-hero-text"><h2>Consumables Stock Management</h2>'+
  '<p>Manage paint and mechanical consumables, materials, brands and pricing.</p></div></div>'+
  '<div class="zs-entry-section"><h3>Central Stock Entry</h3><div class="zs-department-grid" aria-label="Central Stock Entry">'+
  '<button type="button" class="zs-department-card painting" onclick="zukStockCentralPurchase()"><strong>Purchase Entry</strong><small>Purchase invoices</small></button>'+
  (manager()?'<button type="button" class="zs-department-card mechanical" onclick="zukStockCentralOpening()"><strong>Add Stock</strong><small>Opening stock · physical count</small></button>':'')+'</div></div>'+
  '<div class="zs-entry-section zs-entry-department-section">'+
  '<div class="zs-entry-section-head"><div>'+
  '<h3>Stock</h3><p>Open and manage stock for each department.</p></div></div>'+
  '<div class="zs-department-grid" aria-label="Stock departments">'+
  '<button type="button" class="zs-department-card painting" data-department="Painting" onclick="zukStockSelectDepartment(this.dataset.department)">'+
  '<span class="zs-entry-card-top"><span class="zs-department-icon" aria-hidden="true">🎨</span><span class="zs-entry-arrow" aria-hidden="true">›</span></span>'+
  '<strong>Paint Consumables</strong><small>Painting materials and shared stock.</small></button>'+
  '<button type="button" class="zs-department-card mechanical" data-department="Mechanical" onclick="zukStockSelectDepartment(this.dataset.department)">'+
  '<span class="zs-entry-card-top"><span class="zs-department-icon" aria-hidden="true">⚙</span><span class="zs-entry-arrow" aria-hidden="true">›</span></span>'+
  '<strong>Mechanical Consumables</strong><small>Mechanical materials and shared stock.</small></button></div></div>'+
  stockMasterActions()+
  (manager()?'<div class="zs-entry-summary" aria-label="Saved Material Master totals">'+
  '<div class="zs-entry-summary-item"><span class="zs-entry-summary-icon blue" aria-hidden="true">▣</span><div>'+
  '<small>Total Materials</small><strong>'+esc(materials)+'</strong></div></div>'+
  '<div class="zs-entry-summary-item"><span class="zs-entry-summary-icon amber" aria-hidden="true">◇</span><div>'+
  '<small>Total Brands</small><strong>'+esc(brands)+'</strong></div></div>'+
  '<p class="zs-entry-summary-note">Saved Material Master records, not physical stock counts.</p></div>':'')+
  '</div>';
}
function showLiveHome(){
 if(!allowed()||!liveStockReady())return;
 const choosing=!department;
 const tiles=choosing?'':departmentTiles().map(t=>
  '<button type="button" class="zs-home-tile '+t[4]+'" onclick="zukStockLiveNavigate(\''+t[0]+'\')">'+
  '<span class="zs-home-icon" aria-hidden="true">'+t[1]+'</span>'+
  '<span class="zs-home-info"><strong>'+t[2]+'</strong><small>'+t[3]+'</small></span>'+
  '<span class="zs-home-chevron" aria-hidden="true">›</span></button>').join('');
 const content=choosing?departmentMenu():
  '<div class="zs-home-hero"><h3>'+esc(departmentTitle())+'</h3>'+
  '<p class="zs-preview-note">Live department-filtered inventory. Shared materials use one physical balance.</p></div>'+
  '<div class="zs-home-grid" aria-label="'+esc(departmentTitle())+' Stock Management menu">'+tiles+'</div>';
 const markup=css+previewCss+previewHomeCss+
  '<section class="zs zs-preview" data-stock-view="home">'+
  '<header class="zs-screen-toolbar">'+
  (choosing?
    '<button type="button" class="zs-ghost" onclick="zukStockPreviewExit(\'consumables\')">← Consumables</button>':
    '<button type="button" class="zs-ghost" onclick="zukStockResetDepartment()">← Departments</button>')+
  '<strong class="zs-screen-brand">▣ ZUKAIT · STOCK</strong>'+
  '<button type="button" class="zs-ghost" onclick="zukStockPreviewExit(\'dashboard\')">✕ Close</button></header>'+
  content+'</section>';
 renderStockScreen(markup,'home');
}
window.zukStockOpenMaterials=()=>{
 if(!manager())return;
 window.zukStockPreviewExit('dashboard');
 window.consOpenMaster?.(department||'','price');
};
window.zukStockCreateItem=()=>{
 if(!manager())return;
 window.zukStockPreviewExit('dashboard');
 window.consOpenMaster?.(department||'','create');
};
window.zukStockCentralPurchase=()=>{if(!allowed()||view.busy||view.loading)return;window.zukStockPreviewExit('dashboard');window.consOpenPurchaseEntry?.();};
window.zukStockCentralOpening=()=>{if(!allowed()||!manager()||view.busy||view.loading)return;department='';view.items=[];view.selected='';view.pairQuery='';view.itemsHasMore=false;view.itemsNextPage=1;if(previewOnly()){preview.page='add';showPreview();return;}return load('add',true);};
window.zukStockLiveHome=()=>showLiveHome();
window.zukStockLiveNavigate=page=>{
 if(!allowed()||!liveStockReady()||!['balance','add','history','adjust','reports'].includes(page))return;
 if(page==='add'&&!legacyEntryQA())return window.zukStockCentralOpening();
 return load(page,true);
};
function previewHome(){
 if(!department)return departmentMenu();
 return trialControls()+'<div class="zs-home-hero"><h3>'+esc(departmentTitle())+'</h3>'+
  '<p class="zs-preview-note">Choose a stock function. Saved master materials are not yet verified department stock.</p></div>'+
  '<div class="zs-home-grid" aria-label="'+esc(departmentTitle())+' Stock Management menu">'+departmentTiles().map(t=>
    '<button type="button" class="zs-home-tile '+t[4]+'" onclick="zukStockPreviewNavigate(\''+t[0]+'\')">'+
    '<span class="zs-home-icon" aria-hidden="true">'+t[1]+'</span>'+
    '<span class="zs-home-info"><strong>'+t[2]+'</strong><small>'+t[3]+'</small></span>'+
    '<span class="zs-home-chevron" aria-hidden="true">›</span></button>'
  ).join('')+'</div>';
}
// This is a real full-screen in-app page, not a modal. The Stock menu and
// each selected detail screen are mutually exclusive, with explicit Back.
function showPreview(){
 if(!allowed()||!previewOnly())return;
 if(window.ZUKAIT_STOCK_QA_SIMULATION!==true)stockTrial.active=false;
 const isHome=preview.page==='home',c=catalog(),rows=isHome?[]:previewPairs();
 const tabName=previewTabs.find(x=>x[0]===preview.page)?.[1]||
  (preview.page==='suggest'?'Suggest Material':'Return Unused Material');
 let content='';
 if(isHome)content=previewHome();
 else switch(preview.page){
  case 'add':content=stockTrial.active?trialAdd(c):previewAdd(c);break;
  case 'history':content=stockTrial.active?trialHistory(c):previewHistory();break;
  case 'adjust':content=previewAdjust(c);break;
  case 'reports':content=stockTrial.active?trialReports(c):previewReports(c);break;
  case 'suggest':content=previewJobCard(c,'suggest');break;
  case 'return':content=previewJobCard(c,'return');break;
  default:content=stockTrial.active?trialBalance(c):previewBalance(rows,c);
 }
 const back=isHome?
  (department?
    '<button type="button" class="zs-ghost" onclick="zukStockResetDepartment()">← Departments</button>':
    '<button type="button" class="zs-ghost" onclick="zukStockPreviewExit(\'consumables\')">← Consumables</button>'):
  '<button type="button" class="zs-ghost" onclick="zukStockPreviewNavigate(\'home\')">← '+esc(departmentTitle())+'</button>';
 const markup=css+previewCss+previewHomeCss+'<section class="zs zs-preview" data-stock-view="'+esc(preview.page)+'">'+
  '<header class="zs-screen-toolbar">'+back+
  '<strong class="zs-screen-brand">▣ ZUKAIT · STOCK</strong>'+
  '<button type="button" class="zs-ghost" onclick="zukStockPreviewExit(\'dashboard\')">✕ Close</button></header>'+
  (isHome?'':'<h2>'+esc(departmentTitle())+' · '+esc(tabName)+'</h2>')+
  (stockTrial.active?trialNotice():previewNotice())+
  (stockTrial.message?'<p role="alert" class="zs-warning">'+esc(stockTrial.message)+'</p>':'')+content+
  '<p class="zs-preview-note">'+(stockTrial.active?'TEST MODE ONLY · NO STOCK API OR DATABASE WRITES.':'Stock interface preview only. No stock API calls, inventory adjustments or database writes.')+'</p></section>';
 renderStockScreen(markup,preview.page);
}
window.zukStockPreviewExit=destination=>{
 const screen=document.getElementById('zs-stock-screen');
 if(screen){
  document.body.style.overflow=screen.dataset.savedOverflow||'';
  screen.remove();
 }
 if(destination==='consumables')window.openConsumablesModule?.();
};
window.zukStockPreviewNavigate=page=>{
 if(!allowed()||!['home','balance','add','history','adjust','reports','suggest','return'].includes(page))return;
 if(page==='add'&&!legacyEntryQA())return window.zukStockCentralOpening();
 if(!department&&page!=='home')return;
 preview.page=page;showPreview();
};
window.zukStockPreviewFilter=()=>{
 if(!allowed()||!previewOnly())return;
 preview.query=String(document.getElementById('zs-preview-query')?.value||'').trim();
 preview.material=String(document.getElementById('zs-preview-material')?.value||'');
 preview.brand=String(document.getElementById('zs-preview-brand')?.value||'');
 showPreview();
};
window.zukStockPreviewPrice=()=>{
 if(!previewOnly()||!allowed())return;
 const d=document,quantity=Number(d.getElementById('zs-preview-qty')?.value),
 price=Number(d.getElementById('zs-preview-price')?.value),
 method=d.getElementById('zs-preview-method')?.value;
 const output=d.getElementById('zs-preview-calculated');
 if(!output)return;
 if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<=0){
  output.textContent='Enter quantity and price to calculate a preview.';return;
 }
 const cost=method==='unit'?price:price/quantity,total=method==='unit'?price*quantity:price;
 const label=document.getElementById('zs-preview-price-label');
 if(label)label.firstChild.textContent=method==='unit'?'Price per Unit (OMR)':'Total Purchase Price (OMR)';
 output.textContent='Calculated Price per Unit: '+OMR(cost)+' OMR · Total Purchase Price: '+OMR(total)+' OMR · Quantity: '+fmt(quantity)+'. Preview only — not saved.';
};
function stockBrandOptions(material,selected){
 const brands=catalog().brands.filter(b=>!department||view.items.some(r=>r.material_id===material&&r.brand_id===b.id));
 return brands.map(b=>'<option value="'+esc(b.id)+'"'+(b.id===selected?' selected':'')+'>'+esc(b.name)+'</option>').join('');
}
window.zukStockUpdateBrands=()=>{
 const material=document.getElementById('zs-material'),brand=document.getElementById('zs-brand');
 if(material&&brand)brand.innerHTML=stockBrandOptions(material.value,brand.value);
};
window.zukStockSelectDepartment=scope=>{
 if(!allowed()||!['','Painting','Mechanical'].includes(scope)||view.busy||view.loading)return;
 department=scope;
 preview.page='home';stockTrial.message='';
 view.items=[];view.history=[];view.report=null;view.selected='';
 view.itemsNextPage=1;view.balanceQuery='';view.balanceFilter='all';view.pairQuery='';
 view.itemsHasMore=false;view.historyHasMore=false;
 if(previewOnly())return showPreview();
 if(liveStockReady())return showLiveHome();
 if(scope)return load('balance',true); // Isolated QA client only.
};
window.zukStockResetDepartment=()=>window.zukStockSelectDepartment('');
window.openStockManagement=async(scope='')=>{
 if(!allowed()||view.loading||view.busy)return;
 // The normal app asks the authenticated API whether complete secured Stock is ready.
 if(previewOnly()&&window.ZUKAIT_STOCK_LIVE_CHECK_ON_OPEN===true&&currentStockSession()){
   const session=currentStockSession();
   try{
     const status=await window.zukaitCloud?.stockRequest?.({operation:'STATUS'});
     liveStockSession=status?.ok===true&&status.live===true&&
       status.ready===true&&status.writes===true&&status.masterLink===true&&
       session===currentStockSession()?session:'';
   }catch(_){liveStockSession='';}
 }
 department=['Painting','Mechanical'].includes(scope)?scope:'';
 if(previewOnly()){preview.page='home';window.closeModal?.();showPreview();return}
 view.items=[];view.history=[];view.report=null;view.selected='';
 view.itemsNextPage=1;view.balanceQuery='';view.balanceFilter='all';view.pairQuery='';
 view.itemsHasMore=false;view.historyHasMore=false;
 if(liveStockReady()){window.closeModal?.();return showLiveHome()}
 return load('balance',true); // Existing isolated stock QA behavior unchanged.
};
function applyBalanceFilters(){
 const root=document.getElementById?.('zs-stock-screen')||document;
 if(typeof root.querySelectorAll!=='function')return;
 const query=String(view.balanceQuery||'').trim().toLocaleLowerCase(),filter=view.balanceFilter||'all';
 let visible=0;
 for(const node of root.querySelectorAll('[data-balance-entry]')){
  const name=String(node.getAttribute('data-balance-name')||'').toLocaleLowerCase(),
    kind=node.getAttribute('data-balance-kind'),shown=(!query||name.includes(query))&&(filter==='all'||kind===filter);
  node.hidden=!shown;if(shown)visible++;
 }
 const empty=root.querySelector('#zs-balance-search-empty');if(empty)empty.hidden=visible>0;
}
window.zukStockBalanceSearch=value=>{view.balanceQuery=String(value||'').slice(0,180);if(view.page==='balance')applyBalanceFilters();};
window.zukStockBalanceFilter=value=>{if(!['all','linked','unlinked','unpriced'].includes(value))return;view.balanceFilter=value;if(view.page==='balance')applyBalanceFilters();};
window.zukStockNav=(page,force=false)=>page==='add'&&!legacyEntryQA()?window.zukStockCentralOpening():previewOnly()?window.zukStockPreviewNavigate(page):load(page,force);
window.zukStockDetail=id=>{view.selected=String(id||'');view.page='detail';render()};
window.zukStockMore=async()=>{
  if(view.loading)return;view.loading=true;
  try{
    const reply=await stockRead({operation:'LIST',page:view.itemsNextPage});
    if(!reply.ok)throw Error(reply.code||'STOCK_UNAVAILABLE');
    view.items.push(...(reply.items||[]));view.itemsHasMore=!!reply.hasMore;view.itemsNextPage++;
  }catch(e){view.error=String(e.message||e)}finally{view.loading=false;render()}
};
window.zukStockMoreHistory=async()=>{
  if(view.loading||!view.history.length)return;
  const cursor=view.history[view.history.length-1].id;
  view.loading=true;
  try{
    const reply=await stockRead({operation:'HISTORY',cursor:String(cursor)});
    if(!reply.ok)throw Error(reply.code||'STOCK_UNAVAILABLE');
    view.history.push(...(reply.history||[]));view.historyHasMore=!!reply.hasMore;
  }catch(e){view.error=String(e.message||e)}finally{view.loading=false;render()}
};
const request=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():
  'stock-'+Date.now()+'-'+Math.random().toString(36).slice(2);
async function write(command,data){
 if(view.busy)return;
 if(!navigator.onLine){view.error='Offline: stock was not changed.';render();return}
 const fields=['entrytype','material','brand','qty','method','price','count-confirmed','opening-note','item','count','reason'];
 const form=fields.flatMap(key=>{
   const input=document.getElementById('zs-'+key);
   return input?[[key,input.value,input.checked]]:[];
 });
 view.busy=true;view.error='';render();
 // Keep a stable receipt ID if the first request timed out. Never silently retry with a NEW ID.
 const fingerprint=JSON.stringify({command,data});
 if(!view.pending||view.pending.fingerprint!==fingerprint)
   view.pending={fingerprint,requestId:request()};
 try{
   // Link only the exact, already-saved pair after the user submits a validated
   // stock entry. The existing authenticated Manager RPC validates master IDs,
   // department and unit. A retry reuses the same transaction receipt ID.
   if(['OPENING','PURCHASE'].includes(command)&&manager()){
     const selected=addStockChoices().find(x=>String(x.material_id)===String(data.materialId)&&String(x.brand_id)===String(data.brandId));
     if(selected?.needsMasterLink){
       const linked=await api({operation:'MASTER_LINK',materialId:data.materialId,brandId:data.brandId,origin:selected.linkOrigin});
       if(!linked?.ok||linked.linked?.linked!==true)throw Error(linked?.code||'Stock link not confirmed');
       pickerRequests.clear();
     }
   }
   const reply=await api({operation:'WRITE',command,requestId:view.pending.requestId,data});
   if(!reply.ok){
     if(reply.code==='purchase_invoice_required'){
       view.pending=null;view.busy=false;
       if(typeof window.consOpenPurchaseEntry==='function'){
        window.zukStockPreviewExit('dashboard');window.consOpenPurchaseEntry();return;
       }
       throw Error('Use Consumables → Purchase Entry for purchases.');
     }
     throw Error(reply.code||'STOCK_WRITE_FAILED');
   }
   view.pending=null;view.items=[];view.history=[];view.report=null;view.busy=false;
   await load('balance',true);
 }catch(e){
   view.error=String(e.message||e)+'. No success has been confirmed by the server.';
   view.busy=false;render();
   for(const [key,value,checked] of form){
     const input=document.getElementById('zs-'+key);
     if(input){input.value=value;if(typeof checked==='boolean')input.checked=checked;}
   }
   window.zukStockSetEntryType();
 }
}
function filterPairChoices(){
 const root=document.getElementById('zs-pair-results'),input=document.getElementById('zs-material-brand-search');
 if(!root||typeof root.querySelectorAll!=='function')return;
 const query=String(input?.value||'').trim().toLocaleLowerCase();
 let matched=0;
 for(const button of root.querySelectorAll('[data-pair-choice]')){
  const name=String(button.getAttribute('data-pair-name')||'').toLocaleLowerCase();
  const shown=(!query||name.includes(query))&&matched<12;
  button.hidden=!shown;if(shown)matched++;
 }
 const empty=document.getElementById('zs-pair-empty');
 if(empty)empty.hidden=matched>0;
 root.hidden=false;
 if(input)input.setAttribute?.('aria-expanded','true');
}
window.zukStockShowPairChoices=()=>filterPairChoices();
window.zukStockResolvePair=()=>{
 const input=document.getElementById('zs-material-brand-search');
 const value=String(input?.value||'').trim(),normalized=value.toLocaleLowerCase();
 view.pairQuery=value.slice(0,180);
 const exact=addStockChoices().filter(x=>label(x).trim().toLocaleLowerCase()===normalized);
 // Labels may duplicate; only a unique typed label may select an item.
 const row=exact.length===1?exact[0]:null;
 const material=document.getElementById('zs-material'),brand=document.getElementById('zs-brand');
 if(material)material.value=row?.material_id||'';
 if(brand)brand.value=row?.brand_id||'';
 view.selected=row?String(row.material_id)+'|'+String(row.brand_id):'';
 const hint=document.getElementById('zs-pair-hint');
 if(hint)hint.textContent=row?'Selected '+label(row):
    exact.length>1?'More than one matching item. Tap the correct result to select its exact IDs.':
    'Tap a matching result to choose the exact material and brand.';
 filterPairChoices();
 return !!row;
};
window.zukStockChoosePair=index=>{
 const row=addStockChoices()[index],input=document.getElementById('zs-material-brand-search');
 if(!row||!input)return;
 // Use the clicked item's underlying IDs, never a reverse name lookup.
 const m=document.getElementById('zs-material'),b=document.getElementById('zs-brand');
 input.value=label(row);view.pairQuery=input.value.slice(0,180);
 if(m)m.value=String(row.material_id);
 if(b)b.value=String(row.brand_id);
 view.selected=String(row.material_id)+'|'+String(row.brand_id);
 const hint=document.getElementById('zs-pair-hint');
 if(hint)hint.textContent='Selected '+label(row);
 const panel=document.getElementById('zs-pair-results');
 if(panel)panel.hidden=true;
 input.setAttribute?.('aria-expanded','false');
};
window.zukStockPairMore=async()=>{
 if(view.loading||view.busy||view.page!=='add'||!view.itemsHasMore)return;
 // Only explicit user action loads the next page. Typing never scans the database.
 const page=view.itemsNextPage;
 if(!Number.isInteger(page)||page>20){view.error='Further stock pages require an administrator review.';render();return}
 const el=id=>document.getElementById('zs-'+id);
 const query=String(el('material-brand-search')?.value||view.pairQuery||'');
 // Load More is a read action: never discard an unfinished stock entry.
 const form={selected:view.selected,entrytype:el('entrytype')?.value,
  qty:el('qty')?.value,method:el('method')?.value,
  price:el('price')?.value,confirmed:el('count-confirmed')?.checked,
  note:el('opening-note')?.value};
 view.pairQuery=query;view.busy=true;
 const button=document.getElementById('zs-pair-more');if(button)button.disabled=true;
 try{
  const response=await stockRead({operation:'LIST',page});
  if(!response?.ok)throw Error(response?.code||'Stock materials unavailable');
  const known=new Set(view.items.map(x=>String(x.material_id)+'|'+String(x.brand_id)));
  for(const row of response.items||[]){
   const key=String(row.material_id)+'|'+String(row.brand_id);
   if(!known.has(key)){view.items.push(row);known.add(key)}
  }
  view.itemsHasMore=!!response.hasMore;
  view.itemsNextPage=page+1;
  view.error='';
 }catch(error){view.error=String(error?.message||error)}
 finally{
  view.busy=false;
  render();
  const input=el('material-brand-search');
  if(input)input.value=query;
  // Re-render keeps the selected ID in view.selected, including duplicate labels.
  for(const [key,value] of [['entrytype',form.entrytype],['qty',form.qty],
    ['method',form.method],['price',form.price],['opening-note',form.note]]){
   const field=el(key);if(field&&value!==undefined)field.value=value;
  }
  const box=el('count-confirmed');
  if(box&&form.confirmed!==undefined)box.checked=form.confirmed;
  window.zukStockSetEntryType();
  window.zukStockCalculatePurchase();
  if(input&&!view.selected)window.zukStockResolvePair();
 }
};
window.zukStockCalculatePurchase=()=>{
 const d=document,qty=Number(d.getElementById('zs-qty')?.value),price=Number(d.getElementById('zs-price')?.value),
  method=d.getElementById('zs-method')?.value,output=d.getElementById('zs-price-calculated');
 const labelNode=d.getElementById('zs-price-label');
 if(labelNode)labelNode.textContent=manager()&&d.getElementById('zs-entrytype')?.value==='OPENING'?'Counted amount (OMR)':(method==='unit'?'Price per Unit (OMR)':'Total Purchase Price (OMR)');
 if(!output)return;
 if(!(qty>0)||!(price>0)){output.textContent='Enter quantity and purchase amount.';return}
 const unit=method==='unit'?price:price/qty,total=method==='unit'?price*qty:price;
 output.textContent=method==='unit'?'Calculated Total Purchase Price: '+OMR(total)+' OMR':'Calculated Price per Unit: '+OMR(unit)+' OMR';
};
window.zukStockSetEntryType=()=>{
 const d=document;
 const opening=manager()&&d.getElementById('zs-entrytype')?.value==='OPENING';
 const detail=d.getElementById('zs-opening-fields');
 if(detail)detail.style.display=opening?'block':'none';
 const button=d.getElementById('zs-save-entry');
 if(button)button.textContent=opening?'Confirm Opening Stock':'Save Purchased Stock';
 const label=d.getElementById('zs-price-label');
 if(label)label.textContent=opening?'Counted amount (OMR)':'Purchase amount (OMR)';
};
window.zukStockSavePurchase=()=>{
 if(previewOnly())return;
 const d=document;
 const typed=String(d.getElementById('zs-material-brand-search')?.value||'').trim();
 const chosen=addStockChoices().find(x=>String(x.material_id)+'|'+String(x.brand_id)===view.selected);
 // Keep an exact clicked ID even when multiple rows share the same name.
 // Resolve text again only if the search was edited after the selection.
 if(!chosen||typed!==label(chosen).trim())window.zukStockResolvePair?.();
 const data={materialId:d.getElementById('zs-material')?.value,
    brandId:d.getElementById('zs-brand')?.value,
    quantity:Number(d.getElementById('zs-qty')?.value),
    priceMethod:d.getElementById('zs-method')?.value,
    price:Number(d.getElementById('zs-price')?.value)};
 if(!data.materialId||!data.brandId||!(data.quantity>0)||!(data.price>0))
   {view.error='Enter material, brand, positive quantity and purchase price.';render();return}
 const type=legacyEntryQA()?(manager()?d.getElementById('zs-entrytype')?.value:'PURCHASE'):'OPENING';
 if(!legacyEntryQA()&&(!manager()||department))return;
 if(type==='OPENING'){
   const confirmed=d.getElementById('zs-count-confirmed')?.checked===true;
   const reason=String(d.getElementById('zs-opening-note')?.value||'').trim();
   if(!confirmed||reason.length<5||reason.length>180){
     view.error='Confirm the physical count and enter a short count reference (5–180 characters).';
     render();return;
   }
   const cost=data.priceMethod==='total'?data.price/data.quantity:data.price;
   write('OPENING',{materialId:data.materialId,brandId:data.brandId,quantity:data.quantity,
      unitCost:cost,countConfirmed:true,reason});
 }else write('PURCHASE',data);
};
window.zukStockSaveAdjustment=()=>{
 if(previewOnly()||!manager())return;
 const d=document,item=String(d.getElementById('zs-item')?.value||''),ix=item.indexOf('|');
 const data={materialId:item.slice(0,ix),brandId:item.slice(ix+1),
   countedQuantity:Number(d.getElementById('zs-count')?.value),
   reason:String(d.getElementById('zs-reason')?.value||'').trim()};
 if(ix<1||!data.reason||!String(d.getElementById('zs-count')?.value||'').trim()||
     !Number.isFinite(data.countedQuantity)||data.countedQuantity<0)
   {view.error='Enter actual quantity and a reason.';render();return}
 write('ADJUST',data);
};
})();
