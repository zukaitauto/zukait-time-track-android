(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const OMR=n=>Number(n||0).toFixed(3);
const fmt=n=>Number(n||0).toFixed(2);
let department='';
let view={page:'balance',items:[],history:[],itemsHasMore:false,historyHasMore:false,loading:false,error:'',busy:false,
  selected:'',mode:'total',pending:null,legacyItems:[],legacyPage:0,legacyHasMore:false,report:null};
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
const catalog=()=>{
  try{
    const c=typeof state!=='undefined'&&window.ZukaitConsumables?.ensureState(state);
    return {materials:(c?.materials||[]).filter(x=>x.active!==false),
      brands:(c?.brands||[]).filter(x=>x.active!==false)};
  }catch(_){return {materials:[],brands:[]}}
};
const label=(r)=>{
  const c=catalog();
  const m=c.materials.find(x=>String(x.id)===String(r.material_id));
  const b=c.brands.find(x=>String(x.id)===String(r.brand_id));
  return (m?.name||r.material_id)+' — '+(b?.name||r.brand_id);
};
const available=x=>Number(x.physical)-Number(x.reserved);
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
 '@media(min-width:720px){.zs-nav{grid-template-columns:repeat(5,minmax(0,1fr))}.zs-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}}'+
 '</style>';
function draw(body) {
  const live=liveStockReady();
  if(!live&&typeof window.openModal!=='function')return;
  const names=[['balance','📦 Stock Balance'],['add','➕ Add Stock'],['history','🕘 Stock History'],
     ['adjust','⚖️ Stock Adjustment'],['reports','📊 Stock Reports']];
  const nav=names.map(([key,name])=>'<button type="button" class="'+(view.page===key?'zs-active':'')+
    '" onclick="zukStockNav(\''+key+'\')">'+name+'</button>').join('');
  const header='<div class="zs"><div class="zs-row">'+
    (live?'<button class="zs-btn secondary" onclick="zukStockLiveHome()">← Stock Management</button>':
      '<button class="zs-btn secondary" onclick="openConsumablesModule()">← Consumables</button>')+
    (live?'<button class="zs-btn secondary" onclick="zukStockPreviewExit(\'dashboard\')">✕ Close</button>':
      '<button class="zs-btn secondary" onclick="closeModal()">✕ Close</button>')+'</div>'+
    '<h2 style="margin:12px 0 6px">Consumables Stock</h2>'+
    '<label for="zs-department">Department</label><select id="zs-department" onchange="openStockManagement(this.value)">'+
    [['','All departments'],['Painting','Paint Consumables'],['Mechanical','Mechanical Consumables']]
      .map(([value,name])=>'<option value="'+value+'"'+(value===department?' selected':'')+'>'+name+'</option>').join('')+'</select>'+
    (department?'<p class="zs-muted">Shared items use the same stock balance in both departments.</p>':'')+
    '<div class="zs-nav">'+nav+'</div>';
  const message=view.error?'<div class="zs-warning">'+esc(view.error)+'</div>':'';
  const markup=css+header+message+(body||'')+'</div>';
  if(live){renderStockScreen(previewHomeCss+markup,view.page);return;}
  window.openModal(markup);
}
function rowCard(r){
 const unit=esc(r.unit||'Liter'),a=available(r);
 const ids=esc(String(r.material_id)+'|'+String(r.brand_id));
 return '<button type="button" class="zs-card" style="display:block;width:100%;text-align:left" data-id="'+ids+
   '" onclick="zukStockDetail(this.dataset.id)"><div class="zs-row"><b>'+esc(label(r))+'</b>'+
   (a<Number(r.minimum)?'<span class="zs-pill">Low stock</span>':'')+'</div>'+
   '<div class="zs-grid" style="margin-top:9px"><div><div class="zs-muted">Physical</div><b>'+fmt(r.physical)+' '+unit+
   '</b></div><div><div class="zs-muted">Reserved</div><b>'+fmt(r.reserved)+' '+unit+
   '</b></div><div><div class="zs-muted">Available</div><b class="zs-available">'+fmt(a)+' '+unit+'</b></div></div>'+
   '<div class="zs-muted" style="margin-top:6px">Average '+OMR(Number(r.physical)>0?Number(r.stock_value)/Number(r.physical):0)+' OMR/'+unit+'</div></button>';
}
function render(){
 if(!allowed())return;
 if(view.loading){draw('<div class="zs-card">Loading the selected stock screen…</div>');return}
 if(view.page==='balance'){
   const rows=view.items,low=rows.filter(x=>available(x)>0&&available(x)<Number(x.minimum)).length,
       out=rows.filter(x=>available(x)<=0).length;
   draw('<div class="zs-grid">'+
       '<div class="zs-metric"><div class="zs-muted">Stock items</div><b>'+rows.length+'</b></div>'+
       '<div class="zs-metric"><div class="zs-muted">Low stock</div><b>'+low+'</b></div>'+
       '<div class="zs-metric"><div class="zs-muted">Out of stock</div><b>'+out+'</b></div></div>'+
       '<div class="zs-row" style="margin-top:12px"><h3>Available Stock</h3>'+
       '<button class="zs-btn secondary" onclick="zukStockNav(\'balance\',true)">Refresh</button></div>'+ 
       (manager()?'<button class="zs-btn secondary" onclick="zukStockLegacyReview()">One-time: Review Older Materials</button>':'')+
       (!rows.length?'<p class="zs-warning">No opening stock recorded. The existing material master remains unchanged.</p>':
          rows.map(rowCard).join(''))+
       (view.itemsHasMore?'<button class="zs-btn secondary" onclick="zukStockMore()">Load more items</button>':''));
   return;
 }
 if(view.page==='legacy'){
   if(!manager()){draw('<p class="zs-warning">Only Manager can review older materials.</p>');return}
   draw('<h3>Older Materials — One-time Setup</h3>'+
     '<p class="zs-muted">The existing Material Master is unchanged. Choose the department for the material (shared by all its brands). Each brand keeps its own stock. A new brand starts at ZERO; prices and job costs are unchanged.</p>'+
     (view.legacyItems.length?view.legacyItems.map((x,i)=>{
       const paint=x.category==='Paint';
       const dept=String(x.department||'Unassigned');
       const options=paint?['Painting']:['Mechanical','Painting','Both'];
       return '<div class="zs-card"><div class="zs-row"><b>'+esc(x.name)+' — '+esc(x.brand)+'</b>'+
         '<span class="zs-muted">'+esc(x.unit)+' · '+esc(x.category)+'</span></div>'+
         '<p class="zs-muted">Current: '+esc(dept)+(x.linked?' · Stock entry exists':' · Not linked')+'</p>'+
         '<div class="zs-two"><div><label>Used in department</label>'+
         '<select id="zs-legacy-origin-'+i+'"><option value="">Choose department</option>'+
         options.map(y=>'<option value="'+y+'">'+y+'</option>').join('')+'</select></div>'+
         '<div style="display:flex;align-items:end"><button class="zs-btn" type="button" onclick="zukStockLegacyLink('+i+')"'+(view.busy?' disabled':'')+'>Link Material</button></div></div></div>';
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
   draw('<button class="zs-btn secondary" onclick="zukStockNav(\'balance\')">← Stock Balance</button>'+
    '<div class="zs-card"><h3>'+esc(label(r))+'</h3>'+
    [['Physical',fmt(r.physical)+' '+unit],['Reserved',fmt(r.reserved)+' '+unit],
     ['Available',fmt(available(r))+' '+unit],['Average cost',OMR(Number(r.physical)?Number(r.stock_value)/Number(r.physical):0)+' OMR/'+unit],
     ['Stock value',OMR(r.stock_value)+' OMR'],['Minimum stock',fmt(r.minimum)+' '+unit]]
     .map(([k,v])=>'<div class="zs-row" style="padding:5px 0"><span class="zs-muted">'+k+'</span><b>'+v+'</b></div>').join('')+'</div>'+
     '<button class="zs-btn" onclick="zukStockNav(\'add\')">Add Purchased Stock</button> '+
     (manager()?'<button class="zs-btn secondary" onclick="zukStockNav(\'adjust\')">Stock Adjustment</button>':''));
   return;
 }
 if(view.page==='add'){
   const c=catalog(),row=view.items.find(x=>String(x.material_id)+'|'+String(x.brand_id)===view.selected);
   if(department&&!view.items.length){draw('<p class="zs-card">No stock items assigned to this department. A Manager can link items from the Stock Balance screen.</p>');return}
   const material=row?.material_id||(department?view.items[0]?.material_id:c.materials[0]?.id)||'';
   const materials=department?c.materials.filter(m=>view.items.some(r=>r.material_id===m.id)):c.materials;
   const mopts=materials.map(m=>'<option value="'+esc(m.id)+'"'+(String(m.id)===String(material)?' selected':'')+'>'+esc(m.name)+'</option>').join('');
   const bopts=stockBrandOptions(material,row?.brand_id);
   draw('<h3>Add / Open Stock</h3>'+
    '<p class="zs-muted">Enter litres directly (not tins or drums). Non-liquid materials retain kg or Piece units.</p>'+
    (manager()?'<label>Entry type</label><select id="zs-entrytype" onchange="zukStockSetEntryType()"><option value="PURCHASE">Purchased Stock</option><option value="OPENING">Opening Stock (one time only)</option></select>':'')+
    '<div class="zs-two"><div><label>Material</label><select id="zs-material" onchange="zukStockUpdateBrands()">'+mopts+'</select></div>'+
    '<div><label>Brand</label><select id="zs-brand">'+bopts+'</select></div></div>'+
    '<label>Quantity (existing material unit)</label><input id="zs-qty" type="number" min="0.0001" step="any" placeholder="Enter physically counted / received quantity">'+
    '<label>Price method</label><select id="zs-method"><option value="total">Total Purchase Price</option><option value="unit">Price per Unit</option></select>'+
    '<label id="zs-price-label">Purchase price (OMR)</label><input id="zs-price" type="number" min="0.001" step="any" placeholder="Enter actual cost">'+
    '<div id="zs-opening-fields" style="display:none" class="zs-card">'+
    '<p class="zs-warning">Opening Stock is recorded once for this material and brand. Use the physical count, never an estimated stock number.</p>'+
    '<label><input id="zs-count-confirmed" type="checkbox" style="width:auto" /> I have physically counted this material and brand</label>'+
    '<label>Count reference / reason</label><textarea id="zs-opening-note" rows="2" maxlength="180" placeholder="e.g. Verified opening count, 21 Nov"></textarea></div>'+
    '<p class="zs-muted">The server calculates weighted average cost after saving. Existing master prices are not overwritten.</p>'+
    '<button class="zs-btn" id="zs-save-entry" onclick="zukStockSavePurchase()"'+(view.busy?' disabled':'')+'>Save Purchased Stock</button>');
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
     if(needsItems){view.items=reply.items||[];view.itemsHasMore=!!reply.hasMore}
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
 const x=view.legacyItems[index];if(!x)return;
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
  'Quantity, weighted-average cost and reorder levels remain unavailable until physical opening stock is verified.</p>'+
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
const trialKey=(materialId,brandId)=>JSON.stringify([String(materialId),String(brandId)]);
function trialNotice(){
 return '<div class="zs-warning" role="status" style="background:#e8f7f2;border-color:#8dceb7;color:#124936">'+
  '<b>TEST MODE · NOT REAL STOCK.</b> Opening counts and purchases work only inside this browser tab. '+
  'Nothing is saved to Supabase, synced to other devices, or used for Job Card costing. '+
  'Closing or reloading clears all test entries.</div>';
}
function trialControls(){
 return '<div class="zs-actions" style="margin:10px 0 16px">'+
 (stockTrial.active?
  '<button type="button" class="zs-ghost" onclick="zukStockTestReset()">Clear test entries</button>':
  '<button type="button" class="zs-ghost" onclick="zukStockTestStart()">Start opening-stock / purchase test</button>')+
 '</div>';
}
function trialBalance(c){
 const rows=[...stockTrial.balances.values()],total=rows.reduce((a,b)=>a+b.value,0);
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
 const matOptions=previewFormOptions(c.materials),brandOptions=previewFormOptions(c.brands);
 return '<div class="zs-panel"><h3>Opening Stock & Purchased Stock · Test Mode</h3>'+
 '<p class="zs-preview-note">Enter quantity in the existing material unit. Convert tins or drums to litres manually. '+
 'Choose either total purchase price or price per unit; the other is calculated automatically.</p>'+
 '<div class="zs-formgrid"><label class="zs-field">Entry type<select id="zs-trial-entry">'+
 (manager()?'<option value="OPENING">Opening Stock — one-time count</option>':'')+
 '<option value="PURCHASE">Purchase</option></select></label>'+
 '<label class="zs-field">Material<select id="zs-trial-material">'+matOptions+'</select></label>'+
 '<label class="zs-field">Brand<select id="zs-trial-brand">'+brandOptions+'</select></label>'+
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
 const events=[...stockTrial.events].reverse();
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
 const rows=[...stockTrial.balances.values()];
 const total=rows.reduce((sum,row)=>sum+row.value,0);
 return '<div class="zs-stats">'+
 [['Test stock value',OMR(total)+' OMR'],['Materials with test opening',String(rows.length)],
 ['Test transactions',String(stockTrial.events.length)]]
 .map(([k,v])=>'<div class="zs-stat"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('')+
 '</div><div class="zs-panel"><h3>Stock Reports · Test Mode</h3>'+
 '<p class="zs-preview-note">Only the current tab test entries are included. Real reporting and printing remain disabled.</p></div>';
}
window.zukStockTestStart=()=>{
 if(!previewOnly()||!allowed())return;
 stockTrial.active=true;stockTrial.message='';
 showPreview();
};
window.zukStockTestReset=()=>{
 if(!stockTrial.active||!allowed()||!window.confirm?.('Clear all test stock entries in this browser tab?'))return;
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
window.zukStockTrialSave=()=>{
 if(!stockTrial.active||!allowed())return;
 const d=document,get=id=>d.getElementById(id),c=catalog();
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
 const row={materialId,brandId,unit:material.unit,qty:(old?.qty||0)+qty,
   value:Math.round(((old?.value||0)+total)*1000)/1000};
 stockTrial.balances.set(key,row);
 stockTrial.events.push({id:stockTrial.events.length+1,kind,materialId,brandId,
  qty,value:Math.round(total*1000)/1000,note});
 stockTrial.message=kind+' test entry recorded: '+fmt(qty)+' '+esc(material.unit)+'.';
 preview.page='balance';showPreview();
};
function previewAdd(c){
 return '<div class="zs-panel"><h3>Add Stock — Preview</h3>'+
  '<p class="zs-preview-note">Enter liquids directly in litres after manual conversion. No tins or drums conversion. Other master items retain their existing unit. '+
  'Prices may be entered per unit or as a total purchase amount. Nothing is posted in preview.</p>'+
  '<div class="zs-formgrid"><label class="zs-field">Entry type<select id="zs-preview-entry">'+
  (manager()?'<option value="OPENING">Opening Stock (verified physical count)</option>':'')+
  '<option value="PURCHASE">Purchased Stock</option></select></label>'+
  '<label class="zs-field">Material<select id="zs-preview-add-material">'+previewFormOptions(c.materials)+'</select></label>'+
  '<label class="zs-field">Brand<select id="zs-preview-add-brand">'+previewFormOptions(c.brands)+'</select></label>'+
  '<label class="zs-field">Quantity (existing material unit)<input id="zs-preview-qty" type="number" min="0" step="any" placeholder="Enter quantity" oninput="zukStockPreviewPrice()"></label>'+
  '<label class="zs-field">Price entry method<select id="zs-preview-method" onchange="zukStockPreviewPrice()">'+
  '<option value="total">Total Purchase Price</option><option value="unit">Price per Unit</option></select></label>'+
  '<label class="zs-field">Price (OMR)<input id="zs-preview-price" type="number" min="0" step="any" placeholder="Enter price" oninput="zukStockPreviewPrice()"></label></div>'+
  '<div class="zs-panel" style="background:#f2f7fc;margin:12px 0">'+
  '<b>Calculated preview only</b><div class="zs-preview-note" id="zs-preview-calculated" role="status">Enter quantity and price to calculate a preview.</div></div>'+
  '<label class="zs-field">Opening count reference / purchase note<textarea rows="2" placeholder="Physical stock confirmation or purchase reference"></textarea></label>'+
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
  '#zs-stock-screen .zs-department-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0}'+
  '#zs-stock-screen .zs-department-card{min-height:160px;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:12px;text-align:left;border:1px solid #235d94;border-radius:15px;padding:16px;color:#fff;background:linear-gradient(135deg,#255ce1,#173f90);font-weight:750;cursor:pointer;min-width:0}'+
  '#zs-stock-screen .zs-department-card.mechanical{background:linear-gradient(135deg,#117c73,#09534d);border-color:#09534d}'+
  '#zs-stock-screen .zs-department-card strong{font-size:clamp(16px,2.1vw,20px);line-height:1.3;color:#fff!important;overflow-wrap:anywhere}'+
  '#zs-stock-screen .zs-department-card small{font-size:12px;line-height:1.45;color:#eefbff!important}'+
  '#zs-stock-screen .zs-department-card:focus-visible{outline:3px solid #142740;outline-offset:3px}'+
  '@media(max-width:600px){#zs-stock-screen .zs-department-grid{gap:10px}#zs-stock-screen .zs-department-card{min-height:142px;padding:12px;gap:8px}#zs-stock-screen .zs-department-card small{font-size:11px}}'+
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
function showLiveHome(){
 if(!allowed()||!liveStockReady())return;
 const tiles=previewHomeTiles.map(t=>
  '<button type="button" class="zs-home-tile '+t[4]+'" onclick="zukStockLiveNavigate(\''+t[0]+'\')">'+
  '<span class="zs-home-icon" aria-hidden="true">'+t[1]+'</span>'+
  '<span class="zs-home-info"><strong>'+t[2]+'</strong><small>'+t[3]+'</small></span>'+
  '<span class="zs-home-chevron" aria-hidden="true">›</span></button>').join('');
 const markup=css+previewCss+previewHomeCss+
  '<section class="zs zs-preview" data-stock-view="home">'+
  '<header class="zs-screen-toolbar">'+
  '<button type="button" class="zs-ghost" onclick="zukStockPreviewExit(\'consumables\')">← Consumables</button>'+
  '<strong class="zs-screen-brand">▣ ZUKAIT · STOCK</strong>'+
  '<button type="button" class="zs-ghost" onclick="zukStockPreviewExit(\'dashboard\')">✕ Close</button></header>'+
  '<div class="zs-home-hero"><h3>Consumables Stock Management</h3>'+
  '<p class="zs-preview-note">Verified live inventory. Select a card to open its detail screen.</p></div>'+
  '<div class="zs-home-grid" aria-label="Stock Management menu">'+tiles+'</div></section>';
 renderStockScreen(markup,'home');
}
window.zukStockLiveHome=()=>showLiveHome();
window.zukStockLiveNavigate=page=>{
 if(!allowed()||!liveStockReady()||!['balance','add','history','adjust','reports'].includes(page))return;
 return load(page,true);
};
function previewHome(){
 return trialControls()+'<div class="zs-home-hero"><h3>Consumables Stock Management</h3><p class="zs-preview-note">Select an option to open its detail screen. No stock data is displayed on this menu.</p></div>'+
  '<div class="zs-home-grid" aria-label="Stock Management menu">'+previewHomeTiles.map(t=>
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
   '<button type="button" class="zs-ghost" onclick="zukStockPreviewExit(\'consumables\')">← Consumables</button>':
   '<button type="button" class="zs-ghost" onclick="zukStockPreviewNavigate(\'home\')">← Stock Management</button>';
 const markup=css+previewCss+previewHomeCss+'<section class="zs zs-preview" data-stock-view="'+esc(preview.page)+'">'+
  '<header class="zs-screen-toolbar">'+back+
  '<strong class="zs-screen-brand">▣ ZUKAIT · STOCK</strong>'+
  '<button type="button" class="zs-ghost" onclick="zukStockPreviewExit(\'dashboard\')">✕ Close</button></header>'+
  (isHome?'':'<h2>'+esc(tabName)+'</h2>')+
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
 output.textContent='Quantity: '+fmt(quantity)+' · Price per unit: '+OMR(cost)+
  ' OMR · Total purchase value: '+OMR(total)+' OMR. Preview only — not saved.';
};
function stockBrandOptions(material,selected){
 const brands=catalog().brands.filter(b=>!department||view.items.some(r=>r.material_id===material&&r.brand_id===b.id));
 return brands.map(b=>'<option value="'+esc(b.id)+'"'+(b.id===selected?' selected':'')+'>'+esc(b.name)+'</option>').join('');
}
window.zukStockUpdateBrands=()=>{
 const material=document.getElementById('zs-material'),brand=document.getElementById('zs-brand');
 if(material&&brand)brand.innerHTML=stockBrandOptions(material.value,brand.value);
};
window.openStockManagement=async(scope='')=>{
 if(!allowed()||view.loading||view.busy)return;
 // Exactly one small, authenticated STATUS request when the user opens Stock.
 // Fail closed for old servers, missing schema, disabled flags, offline access
 // or an expired session. Real inventory writes still require server role checks.
 if(previewOnly()&&window.ZUKAIT_STOCK_LIVE_CHECK_ON_OPEN===true&&
    currentStockSession()){
   const session=currentStockSession();
   try{
     const status=await window.zukaitCloud?.stockRequest?.({operation:'STATUS'});
     liveStockSession=status?.ok===true&&status.live===true&&
       status.ready===true&&status.writes===true&&status.masterLink===true&&
       session===currentStockSession()?session:'';
   }catch(_){liveStockSession='';}
 }
 if(previewOnly()){preview.page='home';window.closeModal?.();showPreview();return}
 department=['Painting','Mechanical'].includes(scope)?scope:'';
 view.items=[];view.history=[];view.report=null;view.selected='';view.itemsHasMore=false;view.historyHasMore=false;
 if(liveStockReady()){
   if(scope)return load('balance',true); // Changed department inside a detail.
   window.closeModal?.();
   return showLiveHome(); // No stock API until a menu card is selected.
 }
 return load('balance',true); // Existing isolated Stock pilot behavior.
};
window.zukStockNav=(page,force=false)=>previewOnly()?window.zukStockPreviewNavigate(page):load(page,force);
window.zukStockDetail=id=>{view.selected=String(id||'');view.page='detail';render()};
window.zukStockMore=async()=>{
  if(view.loading)return;view.loading=true;
  try{
    const reply=await stockRead({operation:'LIST',page:Math.floor(view.items.length/100)});
    if(!reply.ok)throw Error(reply.code||'STOCK_UNAVAILABLE');
    view.items.push(...(reply.items||[]));view.itemsHasMore=!!reply.hasMore;
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
   const reply=await api({operation:'WRITE',command,requestId:view.pending.requestId,data});
   if(!reply.ok)throw Error(reply.code||'STOCK_WRITE_FAILED');
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
window.zukStockSetEntryType=()=>{
 const d=document;
 const opening=manager()&&d.getElementById('zs-entrytype')?.value==='OPENING';
 const detail=d.getElementById('zs-opening-fields');
 if(detail)detail.style.display=opening?'block':'none';
 const button=d.getElementById('zs-save-entry');
 if(button)button.textContent=opening?'Confirm Opening Stock':'Save Purchased Stock';
 const label=d.getElementById('zs-price-label');
 if(label)label.textContent=opening?'Counted stock cost (OMR)':'Purchase price (OMR)';
};
window.zukStockSavePurchase=()=>{
 if(previewOnly())return;
 const d=document;
 const data={materialId:d.getElementById('zs-material')?.value,
    brandId:d.getElementById('zs-brand')?.value,
    quantity:Number(d.getElementById('zs-qty')?.value),
    priceMethod:d.getElementById('zs-method')?.value,
    price:Number(d.getElementById('zs-price')?.value)};
 if(!data.materialId||!data.brandId||!(data.quantity>0)||!(data.price>0))
   {view.error='Enter material, brand, positive quantity and purchase price.';render();return}
 const type=manager()?d.getElementById('zs-entrytype')?.value:'PURCHASE';
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
