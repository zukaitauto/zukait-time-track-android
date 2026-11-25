(function(){
'use strict';
// Dedicated Accounts adapter: never loads or writes the legacy workshop state.
window.zukaitCreateAccountStock=function({request,getUser,project,canWrite,notify}){
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const omr=x=>Number(x||0).toFixed(3),today=()=>new Date(Date.now()+14400000).toISOString().slice(0,10);
 let dialog=null,owner='',generation=0,busy=false,ready=false,invoiceReady=false,readinessError='',checking=null,tab='home',department='',catalog=[],catalogPage=0,moreCatalog=false,lines=[],invoices=[],editing=null,masterMaterials=[],masterPrices=[],masterSelected=null,masterReview=null,priceIntent=null;
 const identity=()=>{const u=getUser();return ['Manager','Accountant'].includes(u?.role)?String(u.id)+'|'+u.role:''};
 const key=who=>'zukait-account-stock-intent-v1:'+encodeURIComponent(project)+':'+encodeURIComponent(who);
 const pending=()=>{const raw=localStorage.getItem(key(identity()));return raw?JSON.parse(raw):null};
 const current=()=>dialog&&identity()&&identity()===owner;
 const field=id=>dialog?.querySelector('#'+id);
 const val=id=>String(field(id)?.value||'').trim();
 const status=x=>{if(current()&&field('as-status')){field('as-status').textContent=x;field('as-status').hidden=!x;}};
 const valid=(g,who)=>current()&&generation===g&&owner===who;
 const btn=(label,action)=>'<button type="button" data-as="'+action+'">'+label+'</button>';
 const departmentTitle=()=>department==='Painting'?'Paint Consumables':department==='Mechanical'?'Mechanical Consumables':'Consumables Stock Management';
 // Render the exact Manager menu, but bind its buttons to this scoped adapter.
 const sharedMenu=scope=>{
  const menu=window.zukaitSharedStockMenu({scope});
  return menu.styles+'<style>#as-dialog #as-body:has(.as-shared-menu){max-width:none}#as-dialog .as-shared-menu #zs-stock-screen{position:static;overflow:visible;min-height:0;background:none}#as-dialog .as-shared-menu .zs-preview{min-height:0}</style>'+
   '<div class="as-shared-menu"><div id="zs-stock-screen"><section class="zs zs-preview" data-stock-view="home">'+menu.html+'</section></div></div>';
 };
 // The Manager templates are shared; only the host-specific action bindings differ.
 const purchaseMarkup=(html)=>{
  const ids={cpInvoice:'as-number',cpSupplier:'as-supplier',cpDate:'as-date',cpSearch:'as-search',cpResults:'as-results',cpSelected:'as-selected',cpLineEditor:'as-line-editor',cpQty:'as-qty',cpMethod:'as-method',cpUnit:'as-unit-price',cpAmount:'as-total-price',cpLines:'as-lines',cpTotal:'as-total',cpFinish:'as-finish',cpSaveStatus:'as-save-status',cpError:'as-line-error',cpHistoryQuery:'as-history-query',cpHistoryFrom:'as-history-from',cpHistoryTo:'as-history-to',cpHistory:'as-invoice-history'};
  const actions={'consOpenPurchaseInvoices()':'invoices','consOpenPurchaseEntry()':'purchase','consPurchaseAddLine()':'add-line','consPurchaseSave()':'save-invoice','consPurchaseLoadHistory(0)':'invoice-search'};
  return window.ZukaitStockCore.purchaseStyle+html.replace(/id="([^"]+)"/g,(_,id)=>'id="'+(ids[id]||id)+'"')
   .replace(/onclick="([^"]+)"/g,(_,handler)=>{if(!Object.prototype.hasOwnProperty.call(actions,handler))throw Error('Unmapped purchase action');return 'data-as="'+actions[handler]+'"'})
   .replace(/on(?:input|change)="[^"]+"/g,'');
 };
 let purchasePair=null,purchaseMethod='unit';
 const homeMenu=()=>sharedMenu('');
 const departmentMenu=()=>sharedMenu(department);
 const nav=()=>'<header class="as-toolbar">'+(tab==='home'?'':btn('← '+(department&&tab!=='department'?'Department':'Stock'),'back'))+'<span>▣ ZUKAIT · STOCK</span>'+btn('✕ Close','close')+'</header>';
 function show(body){
  if(!current())return;
  dialog.innerHTML='<style>#as-dialog{position:fixed;box-sizing:border-box;width:100%;max-width:none;height:100%;max-height:none;inset:0;margin:0;overflow:auto;border:0;border-radius:0;background:#f5f8fc;color:#173653;padding:16px}#as-dialog .as-toolbar{position:sticky;top:0;z-index:10;background:#f5f8fc;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:8px 0 16px}#as-dialog .as-toolbar span{font-size:12px;font-weight:800;margin-right:auto}#as-dialog #as-body{max-width:1040px;margin:auto}#as-dialog .as-hero{display:flex;align-items:center;gap:14px;border:1px solid #dce6f1;background:white;border-radius:16px;padding:16px;margin-bottom:24px}#as-dialog .as-hero h2{font-size:23px;line-height:1.2;margin:0}#as-dialog .as-hero-icon{font-size:30px;color:#376caa}#as-dialog h3{font-size:18px;margin:24px 0 12px}#as-dialog .as-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#as-dialog .as-grid .as-tile{display:flex;flex-direction:column;align-items:flex-start;gap:12px;text-align:left;min-width:0;min-height:154px;padding:15px;border-radius:16px;overflow-wrap:anywhere}#as-dialog .as-tile-top{display:flex;justify-content:space-between;align-items:center;width:100%;font-size:20px}#as-dialog .as-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:50%;background:#2878ca;color:white}#as-dialog .as-tile strong{font-size:16px;line-height:1.25}#as-dialog .as-tile small{font-size:12px;font-weight:500;color:#4f6479;line-height:1.4}#as-dialog .as-tile.blue{background:#eaf2ff;border-color:#c6d9f5}#as-dialog .as-tile.green{background:#edf7e9;border-color:#cfe3c9}#as-dialog .as-tile.green .as-icon{background:#58a43d}#as-dialog .as-tile.purple{background:#f2edfa;border-color:#ddd1f0}#as-dialog .as-tile.purple .as-icon{background:#8056b6}#as-dialog .as-tile.amber{background:#fff5e4;border-color:#ead9b9}#as-dialog .as-tile.amber .as-icon{background:#bd792c}#as-dialog .as-tile:disabled{opacity:.75}#as-dialog #as-status:not(:empty){position:sticky;top:56px;z-index:9;max-width:1040px;margin:0 auto 12px;color:#183e61;background:#fff5dd;border:1px solid #e2c987;padding:12px;border-radius:8px;font-size:15px;font-weight:700}#as-dialog button{min-height:42px;border:1px solid #b8d3e7;border-radius:9px;background:#eaf2fb;color:#173653;padding:9px;font-weight:700}#as-dialog label{display:grid;gap:4px;margin:9px 0;font-weight:700}#as-dialog input,#as-dialog select{width:100%;min-width:0;box-sizing:border-box;min-height:42px;border:1px solid #b8cde0;border-radius:8px;padding:7px;color:#173653;background:white}#as-dialog .as-row{border:1px solid #d4e2ee;border-radius:10px;padding:10px;margin:7px 0;background:#f7fafc;overflow-wrap:anywhere}#as-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere}#as-dialog button:disabled{opacity:.5}#as-dialog .as-close{float:right}</style>'+nav()+'<p id="as-status" role="status" aria-live="polite"></p><section id="as-body">'+body+'</section>';dialog.scrollTop=0;
  dialog.onclick=e=>{const b=e.target.closest('[data-as]');if(b)act(b.dataset.as).catch(err=>status(err.message));};
  dialog.oninput=e=>{
   if(e.target.id==='as-search'){if(tab==='purchase'){purchasePair=null;if(field('as-line-editor'))field('as-line-editor').hidden=true;if(field('as-selected'))field('as-selected').innerHTML='';}filterCatalog();}
   if(['as-qty','as-price','as-unit-price','as-total-price'].includes(e.target.id))calculate();
  };
  dialog.onchange=e=>{if(e.target.id==='as-method'){if(tab==='purchase')changePurchaseMethod();else calculate();}};
  const p=pending();if(p&&['home','opening','purchase','edit','adjust','master-create','master-price','master-correct','master-review','price-review'].includes(tab)){field('as-body').innerHTML='<div class="as-row"><b>Previous stock transaction awaiting confirmation</b><p>'+esc(p.operation)+' · '+esc(p.data?.invoiceNumber||p.data?.invoiceId||p.data?.materialId||'')+'</p>'+btn('Retry exact saved request','retry')+'</div>';status('Resolve the previous transaction before entering another.');}
 }
 function reset(){generation++;if(dialog){dialog.remove();dialog=null;}owner='';ready=false;invoiceReady=false;readinessError='';checking=null;tab='home';department='';catalog=[];lines=[];editing=null;masterMaterials=[];masterPrices=[];masterSelected=null;masterReview=null;priceIntent=null;purchasePair=null;invoiceFilters={query:'',from:'',to:''};}
 async function open(){
  if(!identity())return;
  if(dialog){dialog.focus();return;}
  owner=identity();dialog=document.createElement('dialog');dialog.id='as-dialog';dialog.setAttribute('aria-label','Accounts Stock');document.body.appendChild(dialog);
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(!busy)reset()});
  dialog.showModal();show(homeMenu());status('Checking Stock permissions…');
  generation++;await refreshReadiness();
 }
 function refreshReadiness(){
  if(checking)return checking;
  const opened=dialog,who=owner;const stillOpen=()=>dialog===opened&&current()&&owner===who;
  const p=(async()=>{
   let stock=false,invoice=false,err='';
   try{const r=await request({operation:'STATUS'});stock=r.ready===true&&r.writes===true;if(!stock)err='Stock writes are disabled or the server is not ready.';}catch(e){err='Stock status: '+e.message;}
   if(!stillOpen())return;
   // Invoice readiness is separate. A failed general Stock check must not hide invoice history.
   try{const v=await request({operation:'INVOICE_STATUS'});invoice=v.ready===true;if(!invoice&&!err)err='Purchase invoice writes are disabled.';}catch(e){if(!err)err='Invoice status: '+e.message;}
   if(!stillOpen())return;
   ready=stock;invoiceReady=invoice;readinessError=err;
   if(tab==='home')status(err||'');
  })();
  checking=p;void p.finally(()=>{if(checking===p)checking=null;});return p;
 }
 function filterCatalog(){
  const q=val('as-search').toLowerCase().split(/\s+/).filter(Boolean),select=field('as-pair');
  if(tab==='purchase'){
   const out=field('as-results');if(!out)return;
   const matches=q.length?catalog.map((x,i)=>({x,i})).filter(({x})=>q.every(k=>(x.material+' '+x.brand+' '+x.unit).toLowerCase().includes(k))).slice(0,30):[];
   out.innerHTML=(matches.map(({x,i})=>'<button type="button" data-as="select-pair:'+i+'"><b>'+esc(x.material)+' · '+esc(x.brand)+'</b><small>'+esc(x.unit)+'</small></button>').join('')||(q.length?'<div class="cp-info">No matching material and brand on loaded pages.</div>':''));
   if(moreCatalog)out.innerHTML+=btn('Load more materials','catalog-more');
   return;
  }
  if(!select)return;
  const selected=select.value;select.innerHTML='<option value="">Select exact material and brand</option>'+catalog.map((x,i)=>({x,i})).filter(({x})=>q.every(k=>(x.material+' '+x.brand+' '+x.department).toLowerCase().includes(k))).map(({x,i})=>'<option value="'+i+'">'+esc(x.material)+' · '+esc(x.brand)+' · '+esc(x.unit)+'</option>').join('');
  if([...select.options].some(o=>o.value===selected))select.value=selected;
 }
 async function loadCatalog(page=0){
  const g=generation,who=owner;const r=await request({operation:'ENTRY_CATALOG',page,...(tab==='adjust'&&department?{department}:{})});if(!valid(g,who))return false;
  catalog=page===0?r.items:catalog.concat(r.items);catalogPage=page;moreCatalog=r.hasMore===true;return true;
 }
 const lineFields=()=>'<label>Search Material + Brand<input id="as-search" type="search" autocomplete="off"></label><label>Material and brand<select id="as-pair"></select></label>'+(moreCatalog?btn('Load more materials','catalog-more'):'')+'<label>Quantity<input id="as-qty" type="number" min="0" step="0.0001"></label><label>Price method<select id="as-method"><option value="unit">Price per Unit</option><option value="total">Total Amount</option></select></label><label>Amount (OMR)<input id="as-price" type="number" min="0" step="0.001"></label><p id="as-calculated"></p>';
 function getLine(){
  const i=val('as-pair'),x=tab==='purchase'?purchasePair:i===''?null:catalog[Number(i)];if(!x)throw Error('Select exact material and brand.');
  const method=val('as-method');
  return {...window.ZukaitStockCore.purchaseLine({materialId:x.materialId,brandId:x.brandId,unit:x.unit,quantity:val('as-qty'),priceMethod:method,price:val(tab==='purchase'?(method==='unit'?'as-unit-price':'as-total-price'):'as-price')}),material:x.material,brand:x.brand};
 }
 function calculate(){
  if(tab==='purchase'){const out=field(val('as-method')==='unit'?'as-total-price':'as-unit-price');if(!out)return;try{const l=getLine();out.value=omr(val('as-method')==='unit'?l.totalAmount:l.unitPrice);}catch{out.value='';}return;}
  try{const l=getLine();field('as-calculated').textContent='Unit OMR '+omr(l.unitPrice)+' · Total OMR '+omr(l.totalAmount)}catch{if(field('as-calculated'))field('as-calculated').textContent='';}
 }
 function changePurchaseMethod(){
  const select=field('as-method'),method=select.value,unit=field('as-unit-price'),total=field('as-total-price');
  if(method!==purchaseMethod&&purchasePair&&unit.value&&total.value){
   try{const p={...purchasePair,quantity:val('as-qty')},before=window.ZukaitStockCore.purchaseLine({...p,priceMethod:purchaseMethod,price:purchaseMethod==='unit'?unit.value:total.value}),after=getLine();if(before.totalMills!==after.totalMills&&!confirm('Changing price method changes the invoice total. Continue?')){select.value=purchaseMethod;return;}}catch{}
  }
  purchaseMethod=method;unit.readOnly=method!=='unit';total.readOnly=method!=='total';calculate();
 }
 const rawLine=({materialId,brandId,unit,quantity,priceMethod,price})=>({materialId,brandId,unit,quantity,priceMethod,price});
 function renderLines(){const out=field('as-lines');if(!out)return;
  out.innerHTML=lines.length?'<div class="cp-line"><b>Material / Brand</b><b>Qty</b><b>Rate</b><b>OMR</b><span></span></div>'+lines.map((l,i)=>'<div class="cp-line"><b>'+esc(l.material)+' · '+esc(l.brand)+'</b><span>'+esc(l.quantity)+'</span><span>'+omr(l.unitPrice)+'</span><b>'+omr(l.totalAmount)+'</b><button type="button" class="cp-action" data-as="remove:'+i+'" aria-label="Remove item">×</button></div>').join(''):'<p class="cp-info">No items added.</p>';
  if(field('as-total'))field('as-total').textContent='Total Invoice Amount: OMR '+omr(lines.reduce((n,l)=>n+l.totalMills,0)/1000);
 }
 const header=(i={})=>'<label>Invoice number<input id="as-number" maxlength="100" value="'+esc(i.invoice_number||'')+'"></label><label>Supplier<input id="as-supplier" maxlength="160" value="'+esc(i.supplier||'')+'"></label><label>Invoice date<input id="as-date" type="date" max="'+today()+'" value="'+esc(i.invoice_date||today())+'"></label>';
 function renderEntry(){
  if(tab==='opening'){show('<h3>Opening Stock (one time only)</h3><p>Physical count only. No supplier or invoice number.</p>'+lineFields()+'<label><input id="as-count" type="checkbox" style="width:auto"> Physical count confirmed</label><label>Count reference<input id="as-reason" maxlength="180"></label>'+btn('Confirm Opening Stock','save-opening'));}
  else{purchasePair=null;purchaseMethod='unit';show(purchaseMarkup(window.ZukaitStockCore.purchaseEntryMarkup({invoiceNumber:'',supplier:'',invoiceDate:today()},today())));renderLines();}
  filterCatalog();
 }
 let invoiceFilters={query:'',from:'',to:''};
 async function readPage(which,page=0){
  const g=++generation,who=owner;tab=which;
  show('<p>Loading verified Stock records…</p>');
  if(which==='invoices'){
   const filters=invoiceFilters;
   show(purchaseMarkup(window.ZukaitStockCore.purchaseHistoryMarkup()));
   field('as-history-query').value=filters.query;field('as-history-from').value=filters.from;field('as-history-to').value=filters.to;
   const r=await request({operation:'INVOICE_LIST',page,data:filters});if(!valid(g,who))return;invoices=r.invoices||[];
   const action=(label,id)=>'<button type="button" class="cp-action" data-as="'+id+'">'+label+'</button>';
   field('as-invoice-history').innerHTML=(invoices.length?invoices.map((i,k)=>'<details class="cp-panel"><summary><b>'+esc(i.invoice_number)+' · '+esc(i.supplier)+'</b><div>'+esc(i.invoice_date)+' · '+(i.status==='cancelled'?'CANCELLED · Original OMR ':'OMR ')+omr(i.total_amount)+'</div></summary><div class="cp-lines">'+(i.lines||[]).map(l=>'<div class="cp-line"><b>'+esc(l.materialName)+' · '+esc(l.brandName)+'</b><span>'+esc(l.quantity)+' '+esc(l.unit)+'</span><span>'+omr(l.unitPrice)+'</span><b>'+omr(l.totalAmount)+'</b></div>').join('')+'</div><div class="cp-two">'+(i.status==='cancelled'?'':action('Edit Invoice Details','header:'+k)+action('Correct Quantity / Price','lines:'+k)+action('Cancel Invoice','cancel:'+k)+action('Review Brands &amp; Price','price-review:'+k))+action('Audit History','audit:'+k)+'</div></details>').join(''):'No invoices found.')+'<div class="cp-head">'+(page?action('Previous','invoices:'+(page-1)):'')+(r.hasMore?action('Next','invoices:'+(page+1)):'')+'</div>';
  }else{
   const operation=which==='balance'?'LIST':which==='history'?'HISTORY':'REPORTS';
   const r=await request({operation,...(department?{department}:{}),...(which==='balance'?{page}:which==='history'&&page?{cursor:String(page)}:{})});if(!valid(g,who))return;
   const list=r.items||r.history||[];
   const known=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
   const number=v=>known(v)?String(Number(v)):'—';
   const money=v=>known(v)?Number(v).toFixed(3)+' OMR':'—';
   const names=new Map();
   if(which!=='reports'&&list.length){
    for(let p=0;p<21;p++){
     const c=await request({operation:'ENTRY_CATALOG',page:p,...(department?{department}:{})});
     if(!valid(g,who))return;
     for(const x of c.items||[])names.set(JSON.stringify([String(x.materialId),String(x.brandId)]),x);
     if(!c.hasMore)break;
    }
   }
   const title=x=>{const n=names.get(JSON.stringify([String(x.material_id),String(x.brand_id)]));return (x.material_name||n?.material||x.material_id)+' · '+(x.brand_name||n?.brand||x.brand_id);};
   const report=r.report;
   let body='<h3>'+({balance:'Stock Balance',history:'Stock History',reports:'Stock Reports'}[which])+'</h3>'+btn('Refresh',which)+(department?'<p>Shared materials use one balance across both departments. Do not add department totals together.</p>':'');
   if(which==='reports'){
    body+=report?'<div class="as-row"><b>Current stock valuation</b><p>'+esc(money(report.valuation))+'</p></div><div class="as-row">Tracked material / brand pairs: '+esc(number(report.items))+'</div><div class="as-row">Low stock: '+esc(number(report.low))+'</div><div class="as-row">Out of stock: '+esc(number(report.out))+'</div><p>Opening count status: '+esc(number(report.uncounted))+' not counted. In stock: '+esc(number(report.in_stock))+'.</p>':'<p>Stock report unavailable.</p>';
   }else{
    body+=list.length?list.map(x=>{
     const counted=x.initialised===true;
     const a=counted&&known(x.physical)&&known(x.reserved)?Number(x.physical)-Number(x.reserved):null;
     const unit=x.unit||names.get(JSON.stringify([String(x.material_id),String(x.brand_id)]))?.unit||'';
     const qty=v=>esc(number(v)+(known(v)&&unit?' '+unit:''));
     return '<div class="as-row"><b>'+esc(title(x))+'</b>'+(which==='balance'?
      '<p>Physical: '+qty(counted?x.physical:null)+' · Reserved: '+qty(counted?x.reserved:null)+' · Available: '+qty(a)+'</p><p>Stock value: '+esc(money(counted?x.stock_value:null))+' · Minimum: '+qty(x.minimum)+'</p><p>'+esc(!counted?(x.initialised===false?'Opening stock not counted':'Opening count status unverified'):a===null?'Quantity unavailable':a<=0?'Out of stock':known(x.minimum)&&a<Number(x.minimum)?'Low stock':'In stock')+'</p>':
      '<p>'+esc(x.action)+' · '+esc(x.recorded_at?new Date(x.recorded_at).toLocaleString('en-GB',{timeZone:'Asia/Muscat'}):'Date unavailable')+'</p><p>Physical change: '+qty(x.physical_delta)+' · Reserved change: '+qty(x.reserved_delta)+' · Value: '+esc(money(x.cost_delta))+'</p><p>'+esc([x.job_card,x.note,x.actor_id?'Staff ID '+x.actor_id:''].filter(Boolean).join(' · '))+'</p>')+'</div>';
    }).join(''):'<p>No stock records found.</p>';
    if(which==='balance'&&page>0)body+=btn('Previous page','balance:'+(page-1));
    if(r.hasMore&&which==='balance')body+=btn('Next page','balance:'+(page+1));
    if(r.hasMore&&which==='history'&&list.length)body+=btn('Older movements','history:'+list.at(-1).id);
   }
   show(body);
  }
 }
 function edit(i,mode){
  if(!i?.id||i.status==='cancelled'||!Number.isInteger(i.revision))throw Error('Reload invoice history.');
  editing={i,mode};tab='edit';
  show('<h3>Edit invoice · '+esc(i.invoice_number)+'</h3>'+(mode==='cancel'?'<p>Cancel this invoice only if the stock can be reversed safely. A price-applied invoice requires reconciliation first.</p>':mode==='header'?header(i):i.lines.map((l,k)=>'<div class="as-row"><b>'+esc(l.materialName)+' · '+esc(l.brandName)+'</b><label>Quantity<input id="as-eq'+k+'" type="number" step="0.0001" value="'+esc(l.quantity)+'"></label><label>Price method<select id="as-em'+k+'"><option value="unit"'+(l.priceMethod==='unit'?' selected':'')+'>Unit</option><option value="total"'+(l.priceMethod==='total'?' selected':'')+'>Total</option></select></label><label>Amount<input id="as-ep'+k+'" type="number" step="0.001" value="'+esc(l.price)+'"></label></div>').join(''))+'<label>Reason (required)<input id="as-reason" maxlength="500"></label>'+btn('Save correction','save-edit'));
 }
 const rejection=new Set(['invoice_price_apply_not_enabled','invoice_price_reconciliation_not_enabled','invalid_price_application','invalid_price_reconciliation','stale_price_reconciliation_review','invoice_price_application_not_found','invoice_price_already_reconciled','invoice_price_already_applied_reconciliation_required','invoice_price_changed_since_application','invoice_price_actual_changed_since_application','invoice_price_reconciliation_no_fallback','price_review_blocked','no_price_changes','master_invalid_input','stock_master_not_enabled','material_duplicate','brand_duplicate','material_not_found','brand_not_found','invalid_price','price_date_duplicate','price_not_found','invoice_price_owned','master_no_change','stale_workshop_revision','stale_price_review','request_id_conflict','invalid_material_department','paint_only_material','invalid_unit','effective_date_required','stock_forbidden','stock_write_not_enabled','stock_invoice_not_enabled','invalid_invoice','invalid_invoice_date','invalid_invoice_lines','invalid_invoice_line','invoice_reference_required','duplicate_invoice','duplicate_material_brand','stock_pair_not_linked','stock_unit_conflict','piece_whole_required','invalid_line_total','invalid_invoice_total','invoice_revision_conflict','invoice_stock_used_or_changed','invoice_stock_correction_unsafe','invoice_price_reconciliation_required','count_below_reserved','invalid_minimum','manager_only','no_invoice_change','invoice_cancelled','invalid_invoice_correction','invalid_stock_identity','invoice_not_found','invoice_line_correction_requires_review','invoice_pair_set_change_requires_review','opening_already_recorded','stock_master_key_not_found','reason_required','invalid_stock_payload']);
 async function send(command,retry=false){
  if(busy||!current()||!canWrite())throw Error('Finish other pending financial work first.');
  const who=owner,k=key(who);let p=pending();
  if(!retry){if(p)throw Error('Retry the saved request first.');await refreshReadiness();if(!current()||owner!==who||busy)throw Error('Account changed or another request is running.');if(command.operation!=='MASTER_SAVE'&&(command.operation==='WRITE'?!ready:!invoiceReady))throw Error(readinessError||'Stock write permission unavailable.');p={...command,requestId:crypto.randomUUID()};if(p.operation.startsWith('PRICE_'))p.data={...p.data,requestId:p.requestId};if(!confirm('Confirm this stock transaction?'))return;localStorage.setItem(k,JSON.stringify(p));}
  if(!p)throw Error('No pending request.');
  busy=true;show('');status('Submitting saved request…');
  try{const r=await request(p);if(p.operation==='PRICE_APPLY_APPLY'?r.ok!==true: ['WRITE','MASTER_SAVE'].includes(p.operation)?!r.receipt:!r.invoice?.id)throw Error('Confirmation unavailable');localStorage.removeItem(k);if(current()&&owner===who){lines=[];editing=null;tab='home';department='';show(homeMenu());status('Saved successfully.');}}
  catch(e){if(rejection.has(e.message)){localStorage.removeItem(k);if(current()&&owner===who){show('<p>Server rejected transaction. Reopen the entry and check the values.</p>');status(e.message==='invoice_price_reconciliation_required'?'Price reconciliation is required. Reopen the invoice and review the costing changes. No invoice change was made.':e.message);}}else if(current()&&owner===who){status('Unconfirmed: '+e.message+' · Retry the exact saved request.');}}
  finally{busy=false;}
 }
 async function masterList(page=0,query=''){
  tab='master-list';const g=++generation,who=owner;show('<h2>Brand &amp; Price</h2><p>Loading materials…</p>');
  try{const r=await request({operation:'MASTER_LIST',page,query});if(!valid(g,who))return;masterMaterials=r.materials||[];
   show('<h2>Brand &amp; Price</h2><label>Search material<input id="as-master-search" value="'+esc(query)+'" maxlength="120"></label>'+btn('Search','master-search')+masterMaterials.map((m,i)=>'<div class="as-row"><b>'+esc(m.name)+'</b><p>'+esc(m.unit)+' · '+esc(m.department||'Unassigned')+'</p>'+btn('Open prices','master-material:'+i)+'</div>').join('')+(page?btn('Previous','master-page:'+(page-1)):'')+(r.hasMore?btn('Next','master-page:'+(page+1)):''));
  }catch(e){if(valid(g,who)){show('<h2>Brand &amp; Price</h2>'+btn('Retry','master-list'));status(e.message);}}
 }
 async function masterHistory(page=0){
  const m=masterSelected;if(!m)return masterList();tab='master-price';const g=++generation,who=owner;show('<h2>'+esc(m.name)+'</h2><p>Loading price history…</p>');
  try{const r=await request({operation:'MASTER_LIST',materialId:m.id,page});if(!valid(g,who))return;masterPrices=r.prices||[];
   show('<h2>'+esc(m.name)+' · Brand &amp; Price</h2><label>Brand name<input id="as-brand-name" maxlength="120"></label><label>Price per '+esc(m.unit)+' (OMR)<input id="as-master-rate" type="number" min="0" step="0.001"></label><label>Effective from (Oman)<input id="as-master-date" type="date" value="'+today()+'"></label><label>Reason<input id="as-reason" maxlength="500"></label>'+btn('Review new price','master-price-review')+'<h3>Price history</h3>'+masterPrices.map((p,i)=>'<div class="as-row"><b>'+esc(p.brandName)+' · OMR '+omr(p.price)+'</b><p>'+esc(p.date)+'</p>'+(p.invoiceOwned?'<p>Invoice-owned period · reconcile through invoice history</p>':btn('Correct price','master-correct:'+i))+'</div>').join('')+(page?btn('Previous','master-history:'+(page-1)):'')+(r.pricesHasMore?btn('Next','master-history:'+(page+1)):''));
  }catch(e){if(valid(g,who)){show('<h2>Brand &amp; Price</h2>'+btn('Retry','master-history:0'));status(e.message);}}
 }
 async function reviewMaster(data){
  const g=++generation,who=owner;status('Checking changes and affected job costs…');
  try{const r=await request({operation:'MASTER_REVIEW',data});if(!valid(g,who))return;masterReview={data,expectedRevision:r.revision,impact:r.impact};tab='master-review';
   show('<h2>Confirm '+esc(data.command.replaceAll('_',' ').toLowerCase())+'</h2><div class="as-row"><b>'+esc(data.name||masterSelected?.name||'Price correction')+'</b><p>'+esc(data.reason)+'</p>'+(data.price!==undefined?'<p>New price: OMR '+omr(data.price)+(data.date?' · '+esc(data.date):'')+'</p>':'')+'<p>Affected Actual Materials records: '+esc(r.impact.affected)+'</p><p>Previous total OMR '+omr(r.impact.oldTotal)+' · Revised total OMR '+omr(r.impact.newTotal)+'</p></div>'+btn('Confirm & save','master-save')+btn('Cancel','master-list'));
  }catch(e){if(valid(g,who))status(e.message);}
 }
 async function reviewInvoiceCorrection(i,mode,data){
  const command={operation:mode==='cancel'?'INVOICE_CANCEL':mode==='header'?'INVOICE_CORRECT_HEADER':'INVOICE_CORRECT_LINES',data};
  if(mode==='header'&&data.invoiceDate===i.invoice_date)return send(command);
  const g=++generation,who=owner;status('Checking invoice price ownership…');
  let r;
  try{r=await request({operation:'PRICE_RECONCILE_PREVIEW',data:{mode,correction:data}});}
  catch(e){if(!valid(g,who))return;if(e.message==='invoice_price_reconciliation_not_enabled')return send(command);throw e;}
  if(!valid(g,who))return;
  if(r.required===false)return send(command);
  if(r.required!==true||!r.applicationRequestId||!r.review)throw Error('Price reconciliation preview unavailable.');
  priceIntent={operation:'PRICE_RECONCILE_APPLY',data:{mode,correction:data,applicationRequestId:r.applicationRequestId,review:r.review}};
  tab='price-review';show('<h2>Confirm invoice price reconciliation</h2><p>The invoice correction and historical price reversal will be saved together.</p><pre>'+esc(JSON.stringify(r.review,null,2))+'</pre>'+btn('Confirm reconciliation','price-confirm')+btn('Cancel','invoices'));
 }
 async function reviewInvoicePrice(i){
  if(!i?.id||i.status==='cancelled'||!Number.isInteger(i.revision))throw Error('Reload invoice history.');
  tab='price-review';const g=++generation,who=owner;show('<h2>Review Brands &amp; Price</h2><p>Loading authoritative invoice prices…</p>');
  try{
   const r=await request({operation:'PRICE_APPLY_REVIEW',data:{invoiceId:i.id,invoiceRevision:i.revision}});if(!valid(g,who))return;
   if(!Array.isArray(r.review)||!r.review.length)throw Error('Price review unavailable.');
   const eligible=r.review.some(p=>['create','correct'].includes(p.action))&&!r.review.some(p=>p.action==='blocked');
   priceIntent=eligible?{operation:'PRICE_APPLY_APPLY',data:{invoiceId:i.id,invoiceRevision:i.revision,review:r.review}}:null;
   show('<h2>Review Brands &amp; Price · '+esc(i.invoice_number)+'</h2>'+r.review.map(p=>'<div class="as-row"><b>'+esc(p.materialName)+' · '+esc(p.brandName)+'</b><p>'+esc(p.action)+' · '+esc(p.date)+' · OMR '+omr(p.oldRate)+' → '+omr(p.rate)+'</p><p>Affected records: '+esc(p.affected||0)+'</p><p>'+esc(p.reason||'')+'</p></div>').join('')+(eligible?'<label>Reason<input id="as-reason" maxlength="500"></label>'+btn('Confirm price change','price-confirm'):'<p>No eligible price change. Resolve blocked periods before proceeding.</p>')+btn('Back to invoice list','invoices'));
  }catch(e){if(valid(g,who))status(e.message);}
 }
 async function act(action){
  if(!current()||busy)return;
  if(action==='close'){reset();return;}if(action==='retry')return send(null,true);
  const [op,index]=action.split(':');
  if(op==='price-review')return reviewInvoicePrice(invoices[Number(index)]);
  if(op==='price-confirm'&&priceIntent){const p=priceIntent;if(p.operation==='PRICE_APPLY_APPLY'){const reason=val('as-reason');if(reason.length<5)throw Error('Enter a reason.');return send({...p,data:{...p.data,reason}});}return send(p);}
  if(op==='master-create'){
   tab='master-create';generation++;masterSelected=null;show('<h2>Create Material</h2><label>Material name<input id="as-material-name" maxlength="120"></label><label>Unit<select id="as-unit"><option>Liter</option><option>kg</option><option>Piece</option></select></label><label>Category<select id="as-category"><option>Consumable</option><option>Paint</option></select></label><label>Department<select id="as-department"><option value="">Select department</option><option>Painting</option><option>Mechanical</option><option>Both</option></select></label><label>Reason<input id="as-reason" maxlength="500"></label>'+btn('Review material','master-create-review'));return;
  }
  if(op==='master-create-review')return reviewMaster({command:'CREATE_MATERIAL',name:val('as-material-name'),unit:val('as-unit'),category:val('as-category'),department:val('as-department'),reason:val('as-reason')});
  if(op==='master-list')return masterList();
  if(op==='master-search'||op==='master-page')return masterList(op==='master-page'?Number(index):0,val('as-master-search'));
  if(op==='master-material'){masterSelected=masterMaterials[Number(index)];return masterHistory();}
  if(op==='master-history')return masterHistory(Number(index||0));
  if(op==='master-price-review'){
   if(!masterSelected||val('as-master-rate')==='')throw Error('Select material and enter a price.');
   return reviewMaster({command:'SET_PRICE',materialId:masterSelected.id,brandName:val('as-brand-name'),price:Number(val('as-master-rate')),date:val('as-master-date'),reason:val('as-reason')});
  }
  if(op==='master-correct'){
   const p=masterPrices[Number(index)];if(!p||p.invoiceOwned)throw Error('Invoice-owned price requires reconciliation.');
   tab='master-correct';generation++;show('<h2>Correct price · '+esc(p.brandName)+'</h2><p>Effective date: '+esc(p.date)+'</p><label>Corrected price (OMR)<input id="as-master-rate" type="number" min="0" step="0.001" value="'+esc(p.price)+'"></label><label>Reason<input id="as-reason" maxlength="500"></label>'+btn('Review correction','master-correct-review:'+Number(index)));return;
  }
  if(op==='master-correct-review'){
   const p=masterPrices[Number(index)];if(!p||p.invoiceOwned||val('as-master-rate')==='')throw Error('Select an eligible price.');
   return reviewMaster({command:'CORRECT_PRICE',priceId:p.id,price:Number(val('as-master-rate')),reason:val('as-reason')});
  }
  if(op==='master-save'&&masterReview)return send({operation:'MASTER_SAVE',...masterReview});
  if(op==='department'&&['Painting','Mechanical'].includes(index)){generation++;department=index;tab='department';show(departmentMenu());return;}
  if(op==='back'){if(tab==='purchase'&&lines.length&&!confirm('Discard unsaved invoice items?'))return;generation++;if(department&&tab!=='department'){tab='department';show(departmentMenu());}else{department='';tab='home';show(homeMenu());}return;}
  if(op==='invoice-search'){invoiceFilters={query:val('as-history-query'),from:val('as-history-from'),to:val('as-history-to')};return readPage('invoices',0);}
  if(['balance','invoices','history','reports'].includes(op))return readPage(op,op==='history'?(index||0):Number(index||0));
  if(op==='adjust'){
   tab='adjust';const g=++generation,who=owner;show('<h2>Stock Adjustment</h2><p>Loading department catalog…</p>');
   try{if(!await loadCatalog()||!valid(g,who))return;show('<h2>'+departmentTitle()+' · Stock Adjustment</h2><label>Search Material + Brand<input id="as-search" type="search"></label><label>Material and brand<select id="as-pair"></select></label>'+(moreCatalog?btn('Load more materials','catalog-more'):'')+'<label>Counted quantity<input id="as-counted" type="number" min="0" step="0.0001"></label><label>Minimum quantity<input id="as-minimum" type="number" min="0" step="0.0001"></label><label>Reason<input id="as-reason" maxlength="160"></label>'+btn('Save physical count','save-adjust')+btn('Save minimum','save-minimum'));filterCatalog();}catch(e){if(valid(g,who))status(e.message);}return;
  }
  if(op==='save-adjust'||op==='save-minimum'){
   const idx=val('as-pair'),x=idx===''?null:catalog[Number(idx)],raw=val(op==='save-adjust'?'as-counted':'as-minimum'),reason=val('as-reason');
   if(!x||raw===''||!Number.isFinite(Number(raw))||Number(raw)<0||reason.length<5)throw Error('Select material and brand, enter a valid quantity and reason.');
   return send({operation:'WRITE',command:op==='save-adjust'?'ADJUST':'MINIMUM',data:{materialId:x.materialId,brandId:x.brandId,[op==='save-adjust'?'countedQuantity':'minimum']:Number(raw),reason}});
  }
  if(op==='opening'||op==='purchase'){
   department='';tab=op;lines=[];const g=++generation,who=owner;
   // Open the selected workspace immediately, independent of readiness or catalog failures.
   const title=op==='opening'?'Add Stock':'Purchase Entry';
   const history=op==='purchase'?btn('Invoice List','invoices'):'';
   show('<h2>'+title+'</h2>'+history+'<p>Loading material catalog…</p>');
   if(pending())return;
   try{if(!await loadCatalog()||!valid(g,who))return;renderEntry();}
   catch(e){if(valid(g,who)){show('<h2>'+title+'</h2>'+history+'<p>Unable to load the material catalog.</p>'+btn('Retry loading',op));status(e.message);}return;}
   await refreshReadiness();
   if(!valid(g,who))return;
   if(op==='purchase'&&field('as-finish')){field('as-finish').disabled=!invoiceReady;field('as-save-status').textContent=invoiceReady?'Save posts invoice lines and stock movements together. Historical costing prices are not changed.':readinessError||'Purchase invoice posting is not enabled.';}
   if(op==='opening'&&!ready||op==='purchase'&&!invoiceReady)status(readinessError||'Entry cannot be saved until the server enables it. Existing records can still be viewed.');
   return;
  }
  if(op==='catalog-more'){const before=field(tab==='purchase'?'as-results':'as-pair');if(await loadCatalog(catalogPage+1)&&before===field(tab==='purchase'?'as-results':'as-pair')){filterCatalog();if(!moreCatalog)dialog.querySelector('[data-as="catalog-more"]')?.remove();}return;}
  if(op==='select-pair'&&tab==='purchase'){
   const x=catalog[Number(index)];if(!x)return;purchasePair=x;purchaseMethod='unit';
   field('as-results').innerHTML='';field('as-search').value=x.material+' · '+x.brand;field('as-selected').innerHTML='<b>'+esc(x.material)+' · '+esc(x.brand)+'</b><div class="cp-info">Unit: '+esc(x.unit)+'</div>';
   field('as-line-editor').hidden=false;field('as-qty').value='';field('as-qty').step=x.unit==='Piece'?'1':'0.0001';
   field('as-method').value='unit';field('as-unit-price').value='';field('as-total-price').value='';field('as-unit-price').readOnly=false;field('as-total-price').readOnly=true;return;
  }
  if(op==='add-line'){const l=getLine();if(lines.length>=50||lines.some(x=>x.materialId===l.materialId&&x.brandId===l.brandId))throw Error('Duplicate pair or maximum 50 lines.');lines.push(l);renderLines();field('as-qty').value='';if(tab==='purchase'){purchasePair=null;field('as-search').value='';field('as-selected').innerHTML='';field('as-line-editor').hidden=true;filterCatalog();}return;}
  if(op==='remove'){lines.splice(Number(index),1);renderLines();return;}
  if(op==='save-opening'){
   const l=getLine(),reason=val('as-reason');if(!field('as-count').checked||reason.length<5)throw Error('Confirm physical count and enter a count reference.');
   return send({operation:'WRITE',command:'OPENING',data:{materialId:l.materialId,brandId:l.brandId,quantity:l.quantity,unitCost:l.priceMethod==='total'?l.price/l.quantity:l.price,countConfirmed:true,reason}});
  }
  if(op==='save-invoice'){
   const supplier=val('as-supplier'),invoiceNumber=val('as-number'),invoiceDate=val('as-date');if(!supplier||!invoiceNumber||!invoiceDate||invoiceDate>today()||!lines.length)throw Error('Complete invoice details and add items.');
   return send({operation:'INVOICE_SAVE',data:{supplier,invoiceNumber,invoiceDate,lines:lines.map(rawLine)}});
  }
  if(op==='header'||op==='lines'||op==='cancel'){if(pending())throw Error('Resolve the saved request first.');return edit(invoices[Number(index)],op);}
  if(op==='save-edit'&&editing){
   const {i,mode}=editing,reason=val('as-reason');if(reason.length<5)throw Error('Enter a correction reason.');
   const data={invoiceId:i.id,expectedRevision:i.revision,reason};
   if(mode==='cancel')return reviewInvoiceCorrection(i,mode,data);
   if(mode==='header'){Object.assign(data,{supplier:val('as-supplier'),invoiceNumber:val('as-number'),invoiceDate:val('as-date')});if(!data.supplier||!data.invoiceNumber||!data.invoiceDate||data.invoiceDate>today())throw Error('Complete invoice fields.');}
   else data.lines=i.lines.map((l,k)=>rawLine(window.ZukaitStockCore.purchaseLine({...l,quantity:val('as-eq'+k),priceMethod:val('as-em'+k),price:val('as-ep'+k)})));
   return reviewInvoiceCorrection(i,mode,data);
  }
  if(op==='audit'){
   const i=invoices[Number(index)],page=Number(action.split(':')[2]||0);
   if(!i||!Number.isInteger(page)||page<0||page>100)return;
   tab='audit';
   const g=++generation,who=owner;
   const r=await request({operation:'INVOICE_AUDIT',page,data:{invoiceId:i.id}});
   if(!valid(g,who))return;
   const rows=r.audit.map(a=>'<details class="as-row"><summary>'+esc(a.event_type)+' · '+esc(a.reason)+' · '+esc(a.actor_id)+' · '+esc(a.created_at)+'</summary><pre>'+esc(JSON.stringify({before:a.before_header,after:a.after_header},null,2))+'</pre></details>').join('');
   const prev=page>0?btn('Newer entries','audit:'+index+':'+(page-1)):'';
   const next=r.hasMore&&page<100?btn('Older entries','audit:'+index+':'+(page+1)):'';
   show('<h3>Audit history · '+esc(i.invoice_number)+'</h3>'+rows+prev+next);
  }
 }
 return {open,reset,blocked:()=>busy||Boolean(identity()&&pending())||Boolean(dialog)};
};
})();
