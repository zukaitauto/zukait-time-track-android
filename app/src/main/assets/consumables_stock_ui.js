(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const OMR=n=>Number(n||0).toFixed(3);
const fmt=n=>Number(n||0).toFixed(2);
let view={page:'balance',items:[],history:[],itemsHasMore:false,historyHasMore:false,loading:false,error:'',busy:false,
  selected:'',mode:'total',pending:null,legacyItems:[],legacyPage:0,legacyHasMore:false};
const allowed=()=>typeof me!=='undefined'&&['Manager','Supervisor'].includes(me?.role);
const manager=()=>typeof me!=='undefined'&&me?.role==='Manager';
const api=x=>window.zukaitCloud?.stockRequest?.(x)||Promise.reject(Error('Stock server connection not ready'));
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
 '.zs-card{border:1px solid #d6e2ef;background:white;border-radius:12px;padding:11px;margin:8px 0}'+
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
  if(typeof window.openModal!=='function')return;
  const names=[['balance','📦 Stock Balance'],['add','➕ Add Stock'],['history','🕘 Stock History'],
     ['adjust','⚖️ Stock Adjustment'],['reports','📊 Stock Reports']];
  const nav=names.map(([key,name])=>'<button type="button" class="'+(view.page===key?'zs-active':'')+
    '" onclick="zukStockNav(\''+key+'\')">'+name+'</button>').join('');
  const header='<div class="zs"><div class="zs-row">'+
    '<button class="zs-btn secondary" onclick="openConsumablesModule()">← Consumables</button>'+
    '<button class="zs-btn secondary" onclick="closeModal()">✕ Close</button></div>'+
    '<h2 style="margin:12px 0 6px">Consumables Stock</h2><div class="zs-muted">Manager & Supervisor · Stock balance, not large history snapshots</div>'+
    '<div class="zs-nav">'+nav+'</div>';
  const message=view.error?'<div class="zs-warning">'+esc(view.error)+'</div>':'';
  window.openModal(css+header+message+(body||'')+'<p class="zs-muted">Stock data is loaded only on request. No workshop-state snapshot is saved from this screen.</p></div>');
}
function rowCard(r){
 const unit=esc(r.unit||'Liter'),a=available(r);
 const ids=esc(String(r.material_id)+'|'+String(r.brand_id));
 return '<button type="button" class="zs-card" style="display:block;width:100%;text-align:left" data-id="'+ids+
   '" onclick="zukStockDetail(this.dataset.id)"><div class="zs-row"><b>'+esc(label(r))+'</b>'+
   (a<Number(r.minimum)?'<span class="zs-pill">Low stock</span>':'')+'</div>'+
   '<div class="zs-grid" style="margin-top:9px"><div><div class="zs-muted">Physical</div><b>'+fmt(r.physical)+' '+unit+
   '</b></div><div><div class="zs-muted">Reserved</div><b>'+fmt(r.reserved)+' '+unit+
   '</b></div><div><div class="zs-muted">Available</div><b style="color:#16733b">'+fmt(a)+' '+unit+'</b></div></div>'+
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
   let material=row?.material_id||c.materials[0]?.id||'',brand=row?.brand_id||c.brands[0]?.id||'';
   const mopts=c.materials.map(m=>'<option value="'+esc(m.id)+'"'+(String(m.id)===String(material)?' selected':'')+'>'+esc(m.name)+'</option>').join('');
   const bopts=c.brands.map(b=>'<option value="'+esc(b.id)+'"'+(String(b.id)===String(brand)?' selected':'')+'>'+esc(b.name)+'</option>').join('');
   draw('<h3>Add / Open Stock</h3>'+
    '<p class="zs-muted">Enter litres directly (not tins or drums). Non-liquid materials retain kg or Piece units.</p>'+
    (manager()?'<label>Entry type</label><select id="zs-entrytype"><option value="PURCHASE">Purchased Stock</option><option value="OPENING">Opening Stock (one time only)</option></select>':'')+
    '<div class="zs-two"><div><label>Material</label><select id="zs-material">'+mopts+'</select></div>'+
    '<div><label>Brand</label><select id="zs-brand">'+bopts+'</select></div></div>'+
    '<label>Quantity (existing material unit)</label><input id="zs-qty" type="number" min="0.0001" step="any" value="5">'+
    '<label>Price method</label><select id="zs-method"><option value="total">Total Purchase Price</option><option value="unit">Price per Unit</option></select>'+
    '<label>Purchase price (OMR)</label><input id="zs-price" type="number" min="0.001" step="any" value="30">'+
    '<p class="zs-muted">The server calculates weighted average cost after saving. Existing master prices are not overwritten.</p>'+
    '<button class="zs-btn" onclick="zukStockSavePurchase()"'+(view.busy?' disabled':'')+'>Save Purchased Stock</button>');
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
   const items=view.items,sum=items.reduce((a,x)=>a+Number(x.stock_value||0),0);
   draw('<h3>Stock Reports</h3><div class="zs-card">'+
     '<div class="zs-row"><span>Current stock valuation</span><b>'+OMR(sum)+' OMR</b></div>'+
     '<div class="zs-row"><span>Stocked material/brands (loaded)</span><b>'+items.length+'</b></div>'+
     '<div class="zs-row"><span>Low stock items (loaded)</span><b>'+items.filter(x=>available(x)<Number(x.minimum)).length+'</b></div></div>'+
     '<p class="zs-warning">This is a current-balance preview, not a complete monthly report. Monthly totals and PDF/Excel exports need the dedicated server aggregate before release.</p>'+
     '<button class="zs-btn secondary" onclick="zukStockNav(\'history\')">Open Bounded Stock History</button>');
 }
}
async function load(page,force=false){
 if(!allowed())return;
 if(view.busy)return;
 if(page)view.page=page;
 view.error='';
 const needsItems=['balance','add','adjust','reports'].includes(view.page);
 const needHistory=view.page==='history';
 if((needsItems&&(!view.items.length||force))||(needHistory&&(!view.history.length||force))){
   view.loading=true;render();
   try{
     const request=needsItems?{operation:'LIST',page:0}:{operation:'HISTORY'};
     const reply=await api(request);
     if(!reply.ok)throw Error(reply.code||'STOCK_UNAVAILABLE');
     if(needsItems){view.items=reply.items||[];view.itemsHasMore=!!reply.hasMore}
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
   view.busy=false;await loadLegacy(view.legacyPage);
 }catch(e){
   view.busy=false;view.error=String(e?.message||e);
   render();
 }
};
window.openStockManagement=()=>load('balance',true);
window.zukStockNav=(page,force=false)=>load(page,force);
window.zukStockDetail=id=>{view.selected=String(id||'');view.page='detail';render()};
window.zukStockMore=async()=>{
  if(view.loading)return;view.loading=true;
  try{
    const reply=await api({operation:'LIST',page:Math.floor(view.items.length/100)});
    if(!reply.ok)throw Error(reply.code||'STOCK_UNAVAILABLE');
    view.items.push(...(reply.items||[]));view.itemsHasMore=!!reply.hasMore;
  }catch(e){view.error=String(e.message||e)}finally{view.loading=false;render()}
};
window.zukStockMoreHistory=async()=>{
  if(view.loading||!view.history.length)return;
  const cursor=view.history[view.history.length-1].id;
  view.loading=true;
  try{
    const reply=await api({operation:'HISTORY',cursor:String(cursor)});
    if(!reply.ok)throw Error(reply.code||'STOCK_UNAVAILABLE');
    view.history.push(...(reply.history||[]));view.historyHasMore=!!reply.hasMore;
  }catch(e){view.error=String(e.message||e)}finally{view.loading=false;render()}
};
const request=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():
  'stock-'+Date.now()+'-'+Math.random().toString(36).slice(2);
async function write(command,data){
 if(view.busy)return;
 if(!navigator.onLine){view.error='Offline: stock was not changed.';render();return}
 view.busy=true;view.error='';render();
 // Keep a stable receipt ID if the first request timed out. Never silently retry with a NEW ID.
 const fingerprint=JSON.stringify({command,data});
 if(!view.pending||view.pending.fingerprint!==fingerprint)
   view.pending={fingerprint,requestId:request()};
 try{
   const reply=await api({operation:'WRITE',command,requestId:view.pending.requestId,data});
   if(!reply.ok)throw Error(reply.code||'STOCK_WRITE_FAILED');
   view.pending=null;view.items=[];view.history=[];view.busy=false;
   await load('balance',true);
 }catch(e){
   view.error=String(e.message||e)+'. No success has been confirmed by the server.';
   view.busy=false;render();
 }
}
window.zukStockSavePurchase=()=>{
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
   const cost=data.priceMethod==='total'?data.price/data.quantity:data.price;
   write('OPENING',{materialId:data.materialId,brandId:data.brandId,quantity:data.quantity,unitCost:cost});
 }else write('PURCHASE',data);
};
window.zukStockSaveAdjustment=()=>{
 if(!manager())return;
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
