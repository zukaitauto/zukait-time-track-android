(function(){
'use strict';
// Dedicated Accounts adapter: never loads or writes the legacy workshop state.
window.zukaitCreateAccountStock=function({request,getUser,project,canWrite,notify}){
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const omr=x=>Number(x||0).toFixed(3),today=()=>new Date(Date.now()+14400000).toISOString().slice(0,10);
 let dialog=null,owner='',generation=0,busy=false,ready=false,invoiceReady=false,readinessError='',checking=null,tab='home',department='',catalog=[],catalogPage=0,moreCatalog=false,lines=[],invoices=[],editing=null;
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
 const tile=(title,desc,icon,tone,action,restricted=false)=>'<button type="button" class="as-tile '+tone+'" '+(restricted?'aria-disabled="true" disabled':'data-as="'+action+'"')+'><span class="as-tile-top"><span class="as-icon" aria-hidden="true">'+icon+'</span><span aria-hidden="true">'+(restricted?'🔒':'›')+'</span></span><strong>'+title+'</strong><small>'+desc+'</small></button>';
 const homeMenu=()=>'<div class="as-hero"><span class="as-hero-icon" aria-hidden="true">▱</span><h2>Consumables Stock Management</h2></div>'+
  '<h3>Central Stock Entry</h3><div class="as-grid">'+tile('Purchase Entry','Purchase invoices','🛒','blue','purchase')+tile('Add Stock','Opening stock · physical count','＋','green','opening')+'</div>'+
  '<h3>Stock</h3><div class="as-grid">'+tile('Paint Consumables','Painting materials and shared stock','🎨','blue','department:Painting')+tile('Mechanical Consumables','Mechanical materials and shared stock','⚙','green','department:Mechanical')+'</div>'+
  '<h3>Material Setup</h3><div class="as-grid">'+tile('Create Material','Manager only','＋','purple','',true)+tile('Brand &amp; Price','Manager only','◇','amber','',true)+'</div>';
 const departmentMenu=()=>'<h2>'+departmentTitle()+'</h2><div class="as-grid">'+tile('Stock Balance','Available, reserved and total stock','📦','blue','balance')+tile('Stock History','Stock movement history','◷','purple','history')+tile('Stock Adjustment','Manager only','⚖','amber','',true)+tile('Stock Reports','Stock valuation and consumption','▤','green','reports')+'</div>';
 const nav=()=>'<header class="as-toolbar">'+(tab==='home'?'':btn('← '+(department&&tab!=='department'?'Department':'Stock'),'back'))+'<span>▣ ZUKAIT · STOCK</span>'+btn('✕ Close','close')+'</header>';
 function show(body){
  if(!current())return;
  dialog.innerHTML='<style>#as-dialog{position:fixed;box-sizing:border-box;width:100%;max-width:none;height:100%;max-height:none;inset:0;margin:0;overflow:auto;border:0;border-radius:0;background:#f5f8fc;color:#173653;padding:16px}#as-dialog .as-toolbar{position:sticky;top:0;z-index:10;background:#f5f8fc;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:8px 0 16px}#as-dialog .as-toolbar span{font-size:12px;font-weight:800;margin-right:auto}#as-dialog #as-body{max-width:1040px;margin:auto}#as-dialog .as-hero{display:flex;align-items:center;gap:14px;border:1px solid #dce6f1;background:white;border-radius:16px;padding:16px;margin-bottom:24px}#as-dialog .as-hero h2{font-size:23px;line-height:1.2;margin:0}#as-dialog .as-hero-icon{font-size:30px;color:#376caa}#as-dialog h3{font-size:18px;margin:24px 0 12px}#as-dialog .as-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#as-dialog .as-grid .as-tile{display:flex;flex-direction:column;align-items:flex-start;gap:12px;text-align:left;min-width:0;min-height:154px;padding:15px;border-radius:16px;overflow-wrap:anywhere}#as-dialog .as-tile-top{display:flex;justify-content:space-between;align-items:center;width:100%;font-size:20px}#as-dialog .as-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:50%;background:#2878ca;color:white}#as-dialog .as-tile strong{font-size:16px;line-height:1.25}#as-dialog .as-tile small{font-size:12px;font-weight:500;color:#4f6479;line-height:1.4}#as-dialog .as-tile.blue{background:#eaf2ff;border-color:#c6d9f5}#as-dialog .as-tile.green{background:#edf7e9;border-color:#cfe3c9}#as-dialog .as-tile.green .as-icon{background:#58a43d}#as-dialog .as-tile.purple{background:#f2edfa;border-color:#ddd1f0}#as-dialog .as-tile.purple .as-icon{background:#8056b6}#as-dialog .as-tile.amber{background:#fff5e4;border-color:#ead9b9}#as-dialog .as-tile.amber .as-icon{background:#bd792c}#as-dialog .as-tile:disabled{opacity:.75}#as-dialog #as-status:not(:empty){position:sticky;top:56px;z-index:9;max-width:1040px;margin:0 auto 12px;color:#183e61;background:#fff5dd;border:1px solid #e2c987;padding:12px;border-radius:8px;font-size:15px;font-weight:700}#as-dialog button{min-height:42px;border:1px solid #b8d3e7;border-radius:9px;background:#eaf2fb;color:#173653;padding:9px;font-weight:700}#as-dialog label{display:grid;gap:4px;margin:9px 0;font-weight:700}#as-dialog input,#as-dialog select{width:100%;min-width:0;box-sizing:border-box;min-height:42px;border:1px solid #b8cde0;border-radius:8px;padding:7px;color:#173653;background:white}#as-dialog .as-row{border:1px solid #d4e2ee;border-radius:10px;padding:10px;margin:7px 0;background:#f7fafc;overflow-wrap:anywhere}#as-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere}#as-dialog button:disabled{opacity:.5}#as-dialog .as-close{float:right}</style>'+nav()+'<p id="as-status" role="status" aria-live="polite"></p><section id="as-body">'+body+'</section>';dialog.scrollTop=0;
  dialog.onclick=e=>{const b=e.target.closest('[data-as]');if(b)act(b.dataset.as).catch(err=>status(err.message));};
  dialog.oninput=e=>{if(e.target.id==='as-search')filterCatalog();if(e.target.id==='as-qty'||e.target.id==='as-price'||e.target.id==='as-method')calculate();};
  const p=pending();if(p&&['home','opening','purchase','edit'].includes(tab)){field('as-body').innerHTML='<div class="as-row"><b>Previous stock transaction awaiting confirmation</b><p>'+esc(p.operation)+' · '+esc(p.data?.invoiceNumber||p.data?.invoiceId||p.data?.materialId||'')+'</p>'+btn('Retry exact saved request','retry')+'</div>';status('Resolve the previous transaction before entering another.');}
 }
 function reset(){generation++;if(dialog){dialog.remove();dialog=null;}owner='';ready=false;invoiceReady=false;readinessError='';checking=null;tab='home';department='';catalog=[];lines=[];editing=null;}
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
  const q=val('as-search').toLowerCase().split(/\s+/).filter(Boolean),select=field('as-pair');if(!select)return;
  const selected=select.value;select.innerHTML='<option value="">Select exact material and brand</option>'+catalog.map((x,i)=>({x,i})).filter(({x})=>q.every(k=>(x.material+' '+x.brand+' '+x.department).toLowerCase().includes(k))).map(({x,i})=>'<option value="'+i+'">'+esc(x.material)+' · '+esc(x.brand)+' · '+esc(x.unit)+'</option>').join('');
  if([...select.options].some(o=>o.value===selected))select.value=selected;
 }
 async function loadCatalog(page=0){
  const g=generation,who=owner;const r=await request({operation:'ENTRY_CATALOG',page});if(!valid(g,who))return false;
  catalog=page===0?r.items:catalog.concat(r.items);catalogPage=page;moreCatalog=r.hasMore===true;return true;
 }
 const lineFields=()=>'<label>Search Material + Brand<input id="as-search" type="search" autocomplete="off"></label><label>Material and brand<select id="as-pair"></select></label>'+(moreCatalog?btn('Load more materials','catalog-more'):'')+'<label>Quantity<input id="as-qty" type="number" min="0" step="0.0001"></label><label>Price method<select id="as-method"><option value="unit">Price per Unit</option><option value="total">Total Amount</option></select></label><label>Amount (OMR)<input id="as-price" type="number" min="0" step="0.001"></label><p id="as-calculated"></p>';
 function getLine(){
  const i=val('as-pair'),x=i===''?null:catalog[Number(i)];if(!x)throw Error('Select exact material and brand.');
  return {...window.ZukaitStockCore.purchaseLine({materialId:x.materialId,brandId:x.brandId,unit:x.unit,quantity:val('as-qty'),priceMethod:val('as-method'),price:val('as-price')}),material:x.material,brand:x.brand};
 }
 function calculate(){try{const l=getLine();field('as-calculated').textContent='Unit OMR '+omr(l.unitPrice)+' · Total OMR '+omr(l.totalAmount)}catch{if(field('as-calculated'))field('as-calculated').textContent='';}}
 const rawLine=({materialId,brandId,unit,quantity,priceMethod,price})=>({materialId,brandId,unit,quantity,priceMethod,price});
 function renderLines(){const out=field('as-lines');if(!out)return;out.innerHTML=lines.map((l,i)=>'<div class="as-row">'+esc(l.material)+' · '+esc(l.brand)+' · '+esc(l.quantity)+' '+esc(l.unit)+' · OMR '+omr(l.totalAmount)+btn('Remove','remove:'+i)+'</div>').join('')+'<b>Total OMR '+omr(lines.reduce((a,l)=>a+l.totalMills,0)/1000)+'</b>';}
 const header=(i={})=>'<label>Invoice number<input id="as-number" maxlength="100" value="'+esc(i.invoice_number||'')+'"></label><label>Supplier<input id="as-supplier" maxlength="160" value="'+esc(i.supplier||'')+'"></label><label>Invoice date<input id="as-date" type="date" max="'+today()+'" value="'+esc(i.invoice_date||today())+'"></label>';
 function renderEntry(){
  if(tab==='opening'){show('<h3>Opening Stock (one time only)</h3><p>Physical count only. No supplier or invoice number.</p>'+lineFields()+'<label><input id="as-count" type="checkbox" style="width:auto"> Physical count confirmed</label><label>Count reference<input id="as-reason" maxlength="180"></label>'+btn('Confirm Opening Stock','save-opening'));}
  else{show('<h3>Purchase Entry</h3>'+btn('Invoice List','invoices')+header()+lineFields()+btn('Add item','add-line')+'<div id="as-lines"></div>'+btn('Finish &amp; Save','save-invoice'));renderLines();}
  filterCatalog();
 }
 async function readPage(which,page=0){
  const g=++generation,who=owner;tab=which;
  show('<p>Loading verified Stock records…</p>');
  if(which==='invoices'){const r=await request({operation:'INVOICE_LIST',page,data:{}});if(!valid(g,who))return;invoices=r.invoices;
   show('<h3>Invoice List</h3>'+invoices.map((i,k)=>'<details class="as-row"><summary><b>'+esc(i.invoice_number)+' · '+esc(i.supplier)+'</b> · OMR '+omr(i.total_amount)+'</summary><p>'+esc(i.invoice_date)+' · '+esc(i.status)+'</p>'+(i.lines||[]).map(l=>'<p>'+esc(l.materialName)+' · '+esc(l.brandName)+' · '+esc(l.quantity)+' '+esc(l.unit)+' · OMR '+omr(l.totalAmount)+'</p>').join('')+(i.status==='cancelled'?'':btn('Edit invoice details','header:'+k)+btn('Correct quantity / price','lines:'+k))+btn('Audit history','audit:'+k)+'</details>').join('')+(page?btn('Previous','invoices:'+ (page-1)):'')+(r.hasMore?btn('Next','invoices:'+ (page+1)):''));
  }else{
   const operation=which==='balance'?'LIST':which==='history'?'HISTORY':'REPORTS';
   const r=await request({operation,...(department?{department}:{}),...(which==='balance'?{page}:which==='history'&&page?{cursor:String(page)}:{})});if(!valid(g,who))return;
   const list=r.items||r.history||[];let body=which==='reports'?'<h3>Stock Reports</h3><pre>'+esc(JSON.stringify(r.report,null,2))+'</pre>':'<h3>'+ (which==='balance'?'Stock Balance':'Stock History')+'</h3>'+list.map(x=>'<div class="as-row"><b>'+esc(x.material_name||x.material_id)+' · '+esc(x.brand_name||x.brand_id)+'</b><p>'+esc(which==='balance'?'Physical '+x.physical+' · Reserved '+x.reserved+' · Value OMR '+omr(x.stock_value):x.action+' · Quantity '+x.physical_delta+' · OMR '+omr(x.cost_delta)+' · '+x.recorded_at+' · Staff '+x.actor_id)+'</p></div>').join('');
   if(r.hasMore&&which==='balance')body+=btn('Next page','balance:'+(page+1));if(r.hasMore&&which==='history'&&list.length)body+=btn('Older movements','history:'+list.at(-1).id);show(body);
  }
 }
 function edit(i,mode){
  if(!i?.id||i.status==='cancelled'||!Number.isInteger(i.revision))throw Error('Reload invoice history.');
  editing={i,mode};tab='edit';
  show('<h3>Edit invoice · '+esc(i.invoice_number)+'</h3>'+(mode==='header'?header(i):i.lines.map((l,k)=>'<div class="as-row"><b>'+esc(l.materialName)+' · '+esc(l.brandName)+'</b><label>Quantity<input id="as-eq'+k+'" type="number" step="0.0001" value="'+esc(l.quantity)+'"></label><label>Price method<select id="as-em'+k+'"><option value="unit"'+(l.priceMethod==='unit'?' selected':'')+'>Unit</option><option value="total"'+(l.priceMethod==='total'?' selected':'')+'>Total</option></select></label><label>Amount<input id="as-ep'+k+'" type="number" step="0.001" value="'+esc(l.price)+'"></label></div>').join(''))+'<label>Reason (required)<input id="as-reason" maxlength="500"></label>'+btn('Save correction','save-edit'));
 }
 const rejection=new Set(['stock_forbidden','stock_write_not_enabled','stock_invoice_not_enabled','invalid_invoice','invalid_invoice_date','invalid_invoice_lines','invalid_invoice_line','invoice_reference_required','duplicate_invoice','duplicate_material_brand','stock_pair_not_linked','stock_unit_conflict','piece_whole_required','invalid_line_total','invalid_invoice_total','invoice_revision_conflict','invoice_stock_used_or_changed','invoice_stock_correction_unsafe','invoice_price_reconciliation_required','no_invoice_change','invoice_cancelled','invalid_invoice_correction','opening_already_recorded','stock_master_key_not_found','reason_required','invalid_stock_payload']);
 async function send(command,retry=false){
  if(busy||!current()||!canWrite())throw Error('Finish other pending financial work first.');
  const who=owner,k=key(who);let p=pending();
  if(!retry){if(p)throw Error('Retry the saved request first.');await refreshReadiness();if(!current()||owner!==who||busy)throw Error('Account changed or another request is running.');if(command.operation==='WRITE'?!ready:!invoiceReady)throw Error(readinessError||'Stock write permission unavailable.');p={...command,requestId:crypto.randomUUID()};if(!confirm('Confirm this stock transaction?'))return;localStorage.setItem(k,JSON.stringify(p));}
  if(!p)throw Error('No pending request.');
  busy=true;show('');status('Submitting saved request…');
  try{const r=await request(p);if(p.operation==='WRITE'?!r.receipt:!r.invoice?.id)throw Error('Confirmation unavailable');localStorage.removeItem(k);if(current()&&owner===who){lines=[];editing=null;tab='home';department='';show(homeMenu());status('Saved successfully.');}}
  catch(e){if(rejection.has(e.message)){localStorage.removeItem(k);if(current()&&owner===who){show('<p>Server rejected transaction. Reopen the entry and check the values.</p>');status(e.message==='invoice_price_reconciliation_required'?'Manager costing review is required. No invoice change was made.':e.message);}}else if(current()&&owner===who){status('Unconfirmed: '+e.message+' · Retry the exact saved request.');}}
  finally{busy=false;}
 }
 async function act(action){
  if(!current()||busy)return;
  if(action==='close'){reset();return;}if(action==='retry')return send(null,true);
  const [op,index]=action.split(':');
  if(op==='department'&&['Painting','Mechanical'].includes(index)){generation++;department=index;tab='department';show(departmentMenu());return;}
  if(op==='back'){if(tab==='purchase'&&lines.length&&!confirm('Discard unsaved invoice items?'))return;generation++;if(department&&tab!=='department'){tab='department';show(departmentMenu());}else{department='';tab='home';show(homeMenu());}return;}
  if(['balance','invoices','history','reports'].includes(op))return readPage(op,op==='history'?(index||0):Number(index||0));
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
   if(op==='opening'&&!ready||op==='purchase'&&!invoiceReady)status(readinessError||'Entry cannot be saved until the server enables it. Existing records can still be viewed.');
   return;
  }
  if(op==='catalog-more'){const before=field('as-pair');if(await loadCatalog(catalogPage+1)&&before===field('as-pair')){filterCatalog();if(!moreCatalog)dialog.querySelector('[data-as="catalog-more"]')?.remove();}return;}
  if(op==='add-line'){const l=getLine();if(lines.length>=50||lines.some(x=>x.materialId===l.materialId&&x.brandId===l.brandId))throw Error('Duplicate pair or maximum 50 lines.');lines.push(l);renderLines();field('as-qty').value='';return;}
  if(op==='remove'){lines.splice(Number(index),1);renderLines();return;}
  if(op==='save-opening'){
   const l=getLine(),reason=val('as-reason');if(!field('as-count').checked||reason.length<5)throw Error('Confirm physical count and enter a count reference.');
   return send({operation:'WRITE',command:'OPENING',data:{materialId:l.materialId,brandId:l.brandId,quantity:l.quantity,unitCost:l.priceMethod==='total'?l.price/l.quantity:l.price,countConfirmed:true,reason}});
  }
  if(op==='save-invoice'){
   const supplier=val('as-supplier'),invoiceNumber=val('as-number'),invoiceDate=val('as-date');if(!supplier||!invoiceNumber||!invoiceDate||invoiceDate>today()||!lines.length)throw Error('Complete invoice details and add items.');
   return send({operation:'INVOICE_SAVE',data:{supplier,invoiceNumber,invoiceDate,lines:lines.map(rawLine)}});
  }
  if(op==='header'||op==='lines'){if(pending())throw Error('Resolve the saved request first.');return edit(invoices[Number(index)],op);}
  if(op==='save-edit'&&editing){
   const {i,mode}=editing,reason=val('as-reason');if(reason.length<5)throw Error('Enter a correction reason.');
   const data={invoiceId:i.id,expectedRevision:i.revision,reason};
   if(mode==='header'){Object.assign(data,{supplier:val('as-supplier'),invoiceNumber:val('as-number'),invoiceDate:val('as-date')});if(!data.supplier||!data.invoiceNumber||!data.invoiceDate||data.invoiceDate>today())throw Error('Complete invoice fields.');}
   else data.lines=i.lines.map((l,k)=>rawLine(window.ZukaitStockCore.purchaseLine({...l,quantity:val('as-eq'+k),priceMethod:val('as-em'+k),price:val('as-ep'+k)})));
   return send({operation:mode==='header'?'INVOICE_CORRECT_HEADER':'INVOICE_CORRECT_LINES',data});
  }
  if(op==='audit'){
   const i=invoices[Number(index)];if(!i)return;tab='audit';const g=++generation,who=owner;const r=await request({operation:'INVOICE_AUDIT',page:0,data:{invoiceId:i.id}});if(!valid(g,who))return;show('<h3>Audit history · '+esc(i.invoice_number)+'</h3>'+r.audit.map(a=>'<details class="as-row"><summary>'+esc(a.event_type)+' · '+esc(a.reason)+' · '+esc(a.actor_id)+' · '+esc(a.created_at)+'</summary><pre>'+esc(JSON.stringify({before:a.before_header,after:a.after_header},null,2))+'</pre></details>').join('')+(r.hasMore?'<p>First 50 audit entries shown.</p>':''));
  }
 }
 return {open,reset,blocked:()=>busy||Boolean(identity()&&pending())||Boolean(dialog)};
};
})();
