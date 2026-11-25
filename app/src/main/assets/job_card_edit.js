(function(){'use strict';
const actor=()=>typeof me!=='undefined'?me:window.me;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=[['make','Make'],['model','Model'],['year','Year'],['reg','Registration Number'],['vin','VIN / Chassis'],['customer','Customer'],['mobile','Contact'],['color','Vehicle Color'],['colorCode','Paint Color Code'],['claimNo','Claim Number'],['insuranceCompany','Insurance Company'],['notes','Job Notes'],['amount','Cash Amount (OMR) — optional']];
const linked=new Set(['make','model','year','reg','vin','customer','mobile','jobType','insuranceCompany','claimNo']);
const messages={job_edit_manager_required:'Only Manager can edit a delivered Job Card.',job_edit_conflict:'This Job Card changed. Reopen Edit Job Card to use the latest details.',job_edit_invoice_authoritative:'The final invoice owns this amount. Use Invoice Entry to correct it.',job_edit_linked_identity:'Correct linked vehicle details in the Reception Checklist.',job_edit_invalid_amount:'Enter an amount from 0 to 1,000,000 OMR with up to three decimal places.',job_edit_invalid_fields:'The server rejected one or more Job Card fields. Check the values, especially the VIN / Chassis, and reopen the form before retrying.',job_edit_unavailable:'The workshop database could not confirm this edit. Check the current Job Card before retrying; do not assume it was saved.',job_not_available:'This Job Card is no longer available for editing. Reload the list.',job_edit_forbidden:'Your login cannot edit Job Cards.',job_edit_reason_required:'Enter a reason for this change.'};
let draft=null,busy=false,loadId=0;
async function api(body){
 if(!navigator.onLine)throw Error('Connect to the server to edit a Job Card.');
 const response=await fetch('https://pjknotnjkufadqavcmii.supabase.co/functions/v1/workshop-api',{method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A','x-zukait-session':window.zukaitAuth?.getToken?.()||''},body:JSON.stringify({action:'job_card_edit',...body})});
 const result=await response.json();if(!response.ok||!result.ok){const error=Error(messages[result.code]||(body.operation==='GET'?'Job Card could not be loaded. Refresh and try again.':'Job Card could not be saved. Refresh and try again.'));error.code=result.code;error.status=response.status;throw error;}return result;
}
async function open(no){
 if(!['Manager','Supervisor','Receptionist'].includes(actor()?.role))return;
 const id=++loadId;draft=null;viewStyle();
 try{
  if(actor()?.role==='Manager'&&typeof window.editJobManager==='function'){
   if(typeof window.zukaitCloud?.pull==='function')await window.zukaitCloud.pull(true);
   if(id!==loadId||actor()?.role!=='Manager')return;
   const details=await api({operation:'GET',jobCard:no});
   if(id!==loadId||actor()?.role!=='Manager')return;
   return window.editJobManager(no,{workDescription:details.job?.workDescription});
  }
  const result=await api({operation:'GET',jobCard:no});if(id!==loadId)return;
  const j=result.job;if(j.delivered&&actor()?.role!=='Manager')throw Error(messages.job_edit_manager_required);
  draft={job:j,locked:result.invoice_locked};
  if(!j.make||!j.model){const n=window.zukaitNormalizeVehicle?.(j.make||'',j.model||'',j.vehicle||'');if(n){j.make=j.make||n.make;j.model=j.model||n.model;}}
  const input=([key,label])=>'<label>'+esc(key==='amount'&&String(j.jobType||'').toUpperCase()==='INSURANCE'?'Approx. Repair Amount (OMR)':label)+'<input id="jce-'+key+'" '+(key==='amount'?'type="number" min="0" max="1000000" step="0.001" inputmode="decimal" ':'')+'value="'+esc(j[key])+'"'+(j.receptionNo&&linked.has(key)||key==='amount'&&result.invoice_locked?' readonly':'')+'></label>';
  openModal('<section class="jce-form jce-view jce-editor"><header class="jce-view-header"><div><small>ZUKAIT INTERNATIONAL LLC</small><h3>Edit Job Card · '+esc(j.no)+'</h3><div>'+esc([j.make,j.model].filter(Boolean).join(' ')||j.vehicle||'')+'</div></div></header>'+(j.receptionNo?'<p>Vehicle identity is linked to '+esc(j.receptionNo)+'. Correct it in Reception Checklist.</p>':'')+(result.invoice_locked?'<p>Final invoice amount is authoritative. Use Invoice Entry for a correction.</p>':'')+'<form id="jce-form"><section class="jce-view-section"><h4>Vehicle, Customer & Payment</h4><div class="grid">'+fields.map(input).join('')+'<label>Job Type<select id="jce-jobType"'+(j.receptionNo?' disabled':'')+'>'+['Cash','Credit','Insurance'].map(t=>'<option'+(t.toUpperCase()===String(j.jobType||'').toUpperCase()?' selected':'')+'>'+t+'</option>').join('')+'</select></label></div></section><label>Reason for Change<textarea id="jce-reason" maxlength="2000" required></textarea></label><button type="submit">Save Changes</button><button type="button" id="jce-cancel">Cancel</button></form></section>');
  document.querySelector('.jce-editor')?.closest('.modal-box')?.classList.add('jce-view-modal');
  const editType=document.getElementById('jce-jobType');
  const updateInsuranceVisibility=()=>{
    const visible=String(editType.value).toUpperCase()==='INSURANCE';
    for(const key of ['insuranceCompany','claimNo']){
      const field=document.getElementById('jce-'+key);
      if(field)field.closest('label').hidden=!visible;
    }
  };
  editType.addEventListener('change',updateInsuranceVisibility);
  updateInsuranceVisibility();
  document.getElementById('jce-form').onsubmit=e=>{e.preventDefault();save();};
  document.getElementById('jce-cancel').onclick=()=>{draft=null;loadId++;closeModal();window.zukaitReceptionDashboard?.showJobs?.();};
 }catch(e){alert(e.message);}
}
async function save(){
 if(busy||!draft)return;
 const current=draft,patch={},j=current.job;
 for(const key of [...fields.map(x=>x[0]),'jobType']){
  if(j.receptionNo&&(linked.has(key)||key==='jobType')||key==='amount'&&current.locked)continue;
  const raw=String(document.getElementById('jce-'+key)?.value||'').trim(),value=key==='amount'?(raw===''?null:raw):raw;
  // Job type and VIN have canonical casing; a casing-only difference is not an edit.
  const unchanged=['jobType','vin'].includes(key)
   ?String(value??'').toUpperCase()===String(j[key]??'').toUpperCase()
   :String(value??'')===String(j[key]??'');
  if(!unchanged)patch[key]=value;
 }
 if(!Object.keys(patch).length)return alert('No changes were made.');
 const reason=String(document.getElementById('jce-reason')?.value||'').trim();if(!reason)return alert(messages.job_edit_reason_required);
 busy=true;const button=document.querySelector('#jce-form button[type=submit]');if(button)button.disabled=true;
 try{
  await api({operation:'EDIT',jobCard:j.no,expectedEditRevision:Number(j.editRevision||0),patch,reason});
  draft=null;closeModal();await window.zukaitCloud?.pull?.(true);window.dispatchEvent(new Event('zukait:state-updated'));await window.zukaitReceptionDashboard?.showJobs?.();
 }catch(e){alert(e.message);}finally{busy=false;if(button)button.disabled=false;}
}
function viewStyle(){
 if(document.getElementById('jce-view-style'))return;
 const style=document.createElement('style');style.id='jce-view-style';style.textContent=viewCss();document.head.appendChild(style);
}
function viewCss(){return `
.jce-view{box-sizing:border-box;width:100%;max-width:1000px;margin:auto;padding:16px;background:#fff;color:#172033;font:14px/1.45 Arial,sans-serif;overflow-wrap:anywhere}
.jce-view *{box-sizing:border-box}.jce-view-modal{max-width:1040px!important;width:calc(100vw - 24px)!important;max-height:calc(100dvh - 24px)!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch}
.jce-view-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:3px solid #bd9b43;padding-bottom:12px}.jce-view h3{margin:3px 0;font-size:22px}.jce-view-header small{font-size:11px;letter-spacing:.6px;color:#496578}.jce-view-nav{display:flex;gap:8px;flex-wrap:wrap}.jce-view-nav button{min-height:44px;padding:8px 14px;touch-action:manipulation}
.jce-view-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px 0}.jce-view-section{margin:10px 0;border:1px solid #dce3e9;border-radius:6px;overflow:hidden}.jce-view-section h4{margin:0;padding:7px 10px;background:#edf2f5;color:#173e54;font-size:13px}.jce-view-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0}.jce-view-field{min-width:0;border-bottom:1px solid #e1e8ee;padding:7px 10px}.jce-view-field b{display:block;font-size:11px;color:#496578}.jce-view-value{white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0 0;line-height:1.4}.jce-view-wide{grid-column:1/-1}.jce-view-work{padding:10px;white-space:pre-wrap;line-height:1.6;min-height:70px}
@media(max-width:550px){.jce-view{padding:10px;font-size:13px}.jce-view h3{font-size:20px}.jce-view-nav{width:100%}.jce-view-nav button{flex:1}.jce-view-field{padding:6px 8px}.jce-view-summary{gap:4px}}
@page{size:A4;margin:12mm}@media print{.jce-view-nav{display:none!important}.jce-view{padding:0;max-width:none;font-size:11px}.jce-view h3{font-size:20px}.jce-view-fields,.jce-view-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.jce-view-header,.jce-view-field{break-inside:avoid}.jce-view-section h4{break-after:avoid}.jce-view-section{overflow:visible;border-radius:0}.jce-view-value,.jce-view-work{overflow:visible!important}.jce-view-work{min-height:90px}.jce-view-section h4{print-color-adjust:exact}}

/* View and Edit share one scoped palette; Create Job Card is unaffected. */
.jce-view{background:#f3f7fa;color:#172f43;border-radius:18px;padding:18px;font-family:Arial,sans-serif}
.jce-view .jce-view-header{background:linear-gradient(120deg,#12314c,#146b70);border:0;border-radius:14px;padding:22px;color:#fff;box-shadow:0 6px 18px #12314c18}
.jce-view .jce-view-header h3{color:#fff!important;font-size:24px;line-height:1.3;margin:5px 0}
.jce-view .jce-view-header small{color:#cae8ed;font-weight:700;letter-spacing:1px}
.jce-view .jce-view-nav button{background:#fff!important;color:#163f55!important;border:1px solid #d3e4eb!important;border-radius:9px;box-shadow:none!important;font-weight:700}
.jce-view .jce-view-section{background:#fff;border:1px solid #d9e5ec;border-radius:12px;margin:16px 0;box-shadow:0 3px 12px #1b3e5510}
.jce-view .jce-view-section h4{background:#e9f4f3;color:#155e63;font-size:14px;font-weight:700;border-bottom:1px solid #d3e7e5;padding:12px 14px}
.jce-view .jce-view-field{padding:12px 14px;border-color:#e7edf2}
.jce-view .jce-view-field b{color:#496579;font-size:12px;font-weight:600}
.jce-view .jce-view-value{color:#172f43;font-size:14px;margin-top:5px}
.jce-view .jce-view-work{padding:14px;color:#172f43}
.jce-view button:focus-visible,.jce-editor input:focus-visible,.jce-editor select:focus-visible,.jce-editor textarea:focus-visible{outline:3px solid #0e7490;outline-offset:3px}
.jce-editor .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:14px}
.jce-editor label{display:block;min-width:0;color:#496579;font-size:13px;font-weight:600}
.jce-editor input,.jce-editor select,.jce-editor textarea{display:block;box-sizing:border-box;min-width:0;width:100%;margin:6px 0 0;padding:12px;min-height:46px;border:1px solid #b9cdd8;border-radius:9px;background:#fff;color:#172f43;font:16px Arial,sans-serif}
.jce-editor label[hidden]{display:none!important}.jce-editor button{min-height:44px;border-radius:9px;padding:10px 16px;margin:12px 8px 0 0}
.jce-editor button[type=submit]{background:#126b70!important;color:#fff!important;border:1px solid #126b70!important}
@media(max-width:550px){.jce-view{padding:10px;border-radius:12px}.jce-view .jce-view-header{padding:16px}.jce-view .jce-view-header h3{font-size:21px}.jce-view .jce-view-nav{width:100%}.jce-view .jce-view-nav button{flex:1}.jce-view .jce-view-field{padding:10px}.jce-editor .grid{grid-template-columns:1fr;gap:14px}}
@media print{.jce-view{background:#fff;border-radius:0;padding:0}.jce-view .jce-view-header{background:#fff;color:#172f43;box-shadow:none;border-radius:0;border-bottom:2px solid #126b70;padding:0 0 12px}.jce-view .jce-view-header h3{color:#172f43!important}.jce-view .jce-view-header small{color:#496579}.jce-view .jce-view-section{box-shadow:none;border-radius:0}.jce-view .jce-view-field{padding:7px 10px}.jce-view .jce-view-value{font-size:11px}}


.jce-audit-entry{border-bottom:1px solid #dce3e9;padding:10px 0}.jce-audit-entry summary{cursor:pointer;overflow-wrap:anywhere}.jce-audit-entry pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:260px;overflow:auto}#jce-history-panel[hidden],#jce-materials-panel[hidden]{display:none!important}.jce-material-record{border-bottom:1px solid #dce3e9;padding:10px 0}.jce-material-record summary{cursor:pointer;overflow-wrap:anywhere}.jce-material-line{margin:6px 0;overflow-wrap:anywhere}@media print{#jce-history-panel,#jce-materials-panel{display:none!important}}
/* Compact, bold A4 document: scoped to the read-only Job Card view. */
.jce-view.jce-view-document{width:100%;max-width:210mm;padding:12px;font-size:13px;line-height:1.35}
.jce-view-document .jce-view-header{padding:12px 15px;gap:9px;border-radius:10px}
.jce-view-document .jce-view-header h3{font-size:21px;margin:3px 0}
.jce-view-document .jce-view-header>div>div{font-weight:800}
.jce-view-document .jce-view-nav{gap:6px}
.jce-view-document .jce-view-nav button{min-height:38px;padding:6px 10px}
.jce-view-document .jce-view-section{margin:8px 0;border-radius:8px;box-shadow:none}
.jce-view-document .jce-view-section h4{font-size:13px;font-weight:800;padding:7px 10px}
.jce-view-document .jce-view-fields{grid-template-columns:repeat(4,minmax(0,1fr))}
.jce-view-document .jce-view-field{padding:6px 9px;border-right:1px solid #e7edf2}
.jce-view-document .jce-view-field b{font-size:10px;line-height:1.25;font-weight:700;color:#496579}
.jce-view-document .jce-view-value{font-size:13px;line-height:1.3;font-weight:800;margin:3px 0 0;color:#172f43;white-space:pre-wrap;overflow-wrap:anywhere}
.jce-view-document .jce-view-wide{grid-column:span 2}
.jce-view-document .jce-view-work{padding:8px 10px;min-height:45px;font-weight:700;font-size:13px;line-height:1.45;overflow-wrap:anywhere}
@media screen and (max-width:600px){.jce-view.jce-view-document{padding:7px}.jce-view-document .jce-view-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.jce-view-document .jce-view-field{padding:6px 7px}.jce-view-document .jce-view-header{padding:10px}.jce-view-document .jce-view-header h3{font-size:19px}.jce-view-document .jce-view-nav button{min-height:42px}}
@page{size:A4 portrait;margin:10mm}
@media print{
 html,body{margin:0!important;padding:0!important;background:#fff!important}
 .jce-view.jce-view-document{width:100%;max-width:none;padding:0;background:#fff;border-radius:0;font-size:10pt;line-height:1.25}
 .jce-view-document .jce-view-header{padding:0 0 3mm;border-bottom:1.5pt solid #126b70;background:#fff!important;color:#172f43!important;box-shadow:none;border-radius:0;break-inside:avoid}
 .jce-view-document .jce-view-header h3{font-size:17pt;color:#172f43!important;margin:2px 0}
 .jce-view-document .jce-view-header small{font-size:9pt;color:#496579}
 .jce-view-document .jce-view-nav{display:none!important}
 .jce-view-document .jce-view-section{margin:2mm 0;overflow:visible;box-shadow:none;border-radius:0;break-inside:auto}
 .jce-view-document .jce-view-section h4{font-size:10pt;padding:1.5mm 2mm;break-after:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}
 .jce-view-document .jce-view-fields{grid-template-columns:repeat(4,minmax(0,1fr))}
 .jce-view-document .jce-view-field{padding:1.5mm 2mm;break-inside:avoid}
 .jce-view-document .jce-view-field b{font-size:8pt}
 .jce-view-document .jce-view-value{font-size:10pt;font-weight:800;line-height:1.25;overflow:visible!important}
 .jce-view-document .jce-view-wide{grid-column:span 2}
 .jce-view-document .jce-view-work{min-height:16mm;padding:2mm;font-size:10pt;font-weight:700;line-height:1.35;overflow:visible!important;break-inside:auto}
}
`}
function viewValue(value){if(value==null||value==='')return '—';if(typeof value==='object')return JSON.stringify(value,null,2);return String(value)}
function jobDate(value){if(value==null||value==='')return 'Not recorded';const n=typeof value==='number'?value:/^\d+$/.test(String(value))?Number(value):Date.parse(value);return Number.isFinite(n)?new Date(n).toLocaleString('en-GB',{timeZone:'Asia/Muscat',dateStyle:'medium',timeStyle:'short'}):String(value)}
function jobName(value){return String(value??'').trim().toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()).replace(/\b(Bmw|Gmc|Mg|Byd|Uae|Llc|Rav4)\b/g,w=>w.toUpperCase())}
function viewHtml(j,actions=true){
 const first=(...keys)=>keys.map(k=>j[k]).find(v=>v!=null&&v!=='')??'';
 const money=v=>v==null||v===''?'Not entered':'OMR '+Number(v).toFixed(3);
 const row=(label,value,wide=false)=>'<div class="jce-view-field'+(wide?' jce-view-wide':'')+'"><b>'+esc(label)+'</b><div class="jce-view-value">'+esc(viewValue(value))+'</div></div>';
 const section=(title,values)=>'<section class="jce-view-section"><h4>'+esc(title)+'</h4><div class="jce-view-fields">'+values.map(v=>row(...v)).join('')+'</div></section>';
 const jobType=String(j.jobType||'CASH').toUpperCase();
 const vehicle=jobName(j.vehicle||[first('make','vehicleMake','brand'),first('model','vehicleModel')].filter(Boolean).join(' '));
 const work=['workDescription','work_description','workDescriptions','description','descriptions','workDetails','requestedWork','notes','jobNotes','remarks'];
 const descriptions=[...new Set(work.map(k=>j[k]).filter(v=>v!=null&&v!=='').map(viewValue))];
 return '<section class="jce-view jce-view-document" data-job-card="'+esc(j.no)+'"><header class="jce-view-header"><div><small>ZUKAIT INTERNATIONAL LLC</small><h3>Job Card · '+esc(j.no)+'</h3><div>'+esc(vehicle||'—')+'</div>'+(j.delivered?'<strong class="jce-delivered-status" style="display:inline-block;margin-top:8px;padding:5px 9px;border-radius:7px;background:#dcfce7;color:#166534">Delivered'+(j.deliveryDate||j.deliveredAt?' · '+esc(jobDate(j.deliveredAt||j.deliveryDate)):'')+'</strong>':'')+'</div>'+(actions?'<nav class="jce-view-nav"><button type="button" id="jce-view-back">← Back</button><button type="button" id="jce-view-print">Print</button>'+(actor()?.role==='Manager'?'<button type="button" id="jce-view-history">History</button><button type="button" id="jce-view-materials">Materials</button>':'')+'<button type="button" id="jce-view-close">Close</button></nav>':'')+'</header>'+ 
 section('Job Details', [['Job Card number',j.no],['Created · Oman time',jobDate(j.createdAt)],['Job type',jobName(j.jobType)],['Status',j.delivered?'Delivered':jobName(j.status||(j.completed?'Completed':'Open'))],['Promise date',j.promiseDate],['Linked Reception Checklist',j.receptionNo]])+
 section('Vehicle Details', [['Make',jobName(first('make','vehicleMake','brand'))],['Model',jobName(first('model','vehicleModel'))],['Year',first('year','modelYear','vehicleYear')],['Registration',first('reg','registration','registrationNo')],['Vehicle',vehicle,true],['VIN / Chassis',String(first('vin','VIN','vinNumber','chassis','chassisNo')).toUpperCase(),true],['Vehicle colour',jobName(first('color','colour'))],['Paint colour code',first('colorCode','colourCode')],['Intake odometer',first('jobIntakeOdometer','odometer')],['Odometer unit',first('jobIntakeOdometerUnit','jobIntakeUnit','odometerUnit')]])+
 section('Customer Details', [['Customer',jobName(first('customer','customerName')),true],['Contact',first('mobile','customerMobile','customerContact','contact','phone','tel')],['Email',j.email],['Customer address',first('customerAddress','address'),true]])+
 section(jobType==='INSURANCE'?'Insurance & Payment':'Payment Details', [...(jobType==='INSURANCE'?[['Insurance company',jobName(first('insuranceCompany','insurance'))],['Claim number',first('claimNo','claimNumber','claim')]]:[]),['Amount',money(j.amount)],['Final invoice amount',money(j.finalInvoiceAmount??j.invoiceAmount)],['Invoice date',j.invoiceDate],...(jobType==='CREDIT'?[['Credit account / reference',j.creditAccount]]:[]),['Delivered · Oman time',j.deliveredAt||j.deliveryDate?jobDate(j.deliveredAt||j.deliveryDate):'Not delivered']])+
 '<section class="jce-view-section"><h4>Work Descriptions / Notes</h4><div class="jce-view-work">'+esc(descriptions.join('\n\n')||'No work description recorded.')+'</div></section>'+(actions&&j.delivered&&typeof window.zukaitDeliveredMaterialsSummary==='function'?window.zukaitDeliveredMaterialsSummary(j.no,'job-view'):'')+(actions&&actor()?.role==='Manager'?'<section id="jce-history-panel" class="jce-view-section" hidden></section><section id="jce-materials-panel" class="jce-view-section" hidden></section>':'')+'</section>';
}
function printView(j){
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Job Card '+esc(j.no)+'</title><style>'+viewCss()+'</style></head><body>'+viewHtml(j,false)+'</body></html>';
 if(window.AndroidBridge?.printHtmlNamed)return window.AndroidBridge.printHtmlNamed(html,'Job Card '+j.no);
 if(window.AndroidBridge?.printHtml)return window.AndroidBridge.printHtml(html);
 if(window.v112PrintHtml)return window.v112PrintHtml(html,'Job Card '+j.no);
 const popup=window.open('','_blank');if(!popup)return alert('Allow the print window, then try Print again.');
 popup.document.open();popup.document.write(html);popup.document.close();
 popup.onload=()=>{popup.focus();popup.print()};
}

 // Manager-only, opt-in history; never writes or merges the cached snapshot.
 function bindHistory(j,id){
  const trigger=document.getElementById('jce-view-history'),panel=document.getElementById('jce-history-panel');
  if(!trigger||!panel)return;
  const token=window.zukaitAuth?.getToken?.()||'',actorId=actor()?.id;
  let revision=null,before=null,rows=[],busy=false,started=false,finished=false,local=false,notice='';
  const valid=()=>id===loadId&&panel.isConnected&&actor()?.role==='Manager'&&actor()?.id===actorId&&Boolean(token)&&window.zukaitAuth?.getToken?.()===token;
  const legacyRows=()=>{
   const list=typeof state!=='undefined'?state?.jobEdits:window.state?.jobEdits;
   const key=String(j.no).trim().toUpperCase();
   return (Array.isArray(list)?list:[]).map((payload,i)=>({audit_position:i+1,payload})).filter(({payload:p})=>String(p?.job||p?.old?.no||p?.newValue?.no||'').trim().toUpperCase()===key).reverse();
  };
  const entry=row=>{
   const p=row.payload||{};
   return '<details class="jce-audit-entry"><summary><b>'+esc(p.operation||'Job edit')+'</b> · '+esc(jobDate(p.at))+' · '+esc(p.byName||p.by||'Unknown user')+'</summary>'+
    (p.reason?'<p>Reason: '+esc(p.reason)+'</p>':'')+
    '<div><b>Before</b><pre>'+esc(viewValue(p.before??p.old??null))+'</pre><b>After</b><pre>'+esc(viewValue(p.after??p.newValue??null))+'</pre></div></details>';
  };
  function render(){
   if(!valid()){panel.replaceChildren();panel.hidden=true;return;}
   panel.hidden=false;
   panel.innerHTML='<h4>Job Edit History</h4><div class="jce-view-work"><p role="status">'+esc(notice|| (local?'Cached history only; it may be incomplete.':busy?'Loading history…':rows.length?rows.length+' records loaded':'No job edits found.'))+'</p>'+rows.map(entry).join('')+
    (!busy&&!finished&&!local?'<button type="button" id="jce-history-next">'+(rows.length?'Older entries':'Try again')+'</button>':'')+
    (!busy&&(local||notice)&&notice!=='History access denied. Sign in again if needed.'?'<button type="button" id="jce-history-refresh">Refresh from server</button>':'')+'</div>';
   panel.querySelector('#jce-history-next')?.addEventListener('click',()=>load());
   panel.querySelector('#jce-history-refresh')?.addEventListener('click',()=>{reset();load();});
  }
  function reset(){revision=null;before=null;rows=[];finished=false;local=false;notice='';}
  async function load(){
   if(busy||!valid()||finished)return;
   busy=true;notice='';render();
   try{
    const result=await api({action:'job_edit_audit_page',jobCard:String(j.no),limit:25,...(before!=null?{before_position:before,expected_revision:revision}:{})});
    if(!valid())return;
    if(!Number.isSafeInteger(result.revision)||!Array.isArray(result.rows)||result.rows.some((r,i)=>!r||!Number.isSafeInteger(r.audit_position)||r.audit_position<1||!r.payload||typeof r.payload!=='object'||(i>0&&r.audit_position>=result.rows[i-1].audit_position))||
       (before!=null&&(result.revision!==revision||result.rows.some(r=>r.audit_position>=before)))||
       (result.next_position!=null&&(!Number.isSafeInteger(result.next_position)||!result.rows.length||result.next_position!==result.rows[result.rows.length-1].audit_position)))throw Error('Invalid history response');
    revision=result.revision;rows.push(...result.rows);before=result.next_position??null;finished=before===null;
   }catch(error){
    if(!valid())return;
    if(error.code==='audit_revision_changed'){reset();notice='Workshop data changed. Refresh history to start from the newest record.';}
    else if(error.status===401||error.status===403||['invalid_session','job_edit_forbidden'].includes(error.code)){reset();finished=true;notice='History access denied. Sign in again if needed.';}
    else if(!rows.length){rows=legacyRows();local=true;finished=true;notice='Server history unavailable. Showing cached records only; history may be incomplete.';}
    else notice='Older history could not be loaded. Try again.';
   }finally{busy=false;render();}
  }
  trigger.onclick=()=>{if(!valid())return;if(started){panel.hidden=!panel.hidden;return;}started=true;load();};
 }

 // Fetch only the selected job's materials on demand. Read-only: never replace
 // the authoritative state, reprice a line, or use these records for a write.
 function bindMaterials(j,id){
  const trigger=document.getElementById('jce-view-materials'),panel=document.getElementById('jce-materials-panel');
  if(!trigger||!panel)return;
  const token=window.zukaitAuth?.getToken?.()||'',actorId=actor()?.id;
  const valid=()=>id===loadId&&panel.isConnected&&actor()?.role==='Manager'&&actor()?.id===actorId&&Boolean(token)&&window.zukaitAuth?.getToken?.()===token;
  const key=String(j.no).trim().toUpperCase();
  const localData=()=>typeof state!=='undefined'?state?.consumables:window.state?.consumables;
  const sameJob=row=>row&&String(row.jobCard??'').trim().toUpperCase()===key;
  const money=v=>v==null||v===''||!Number.isFinite(Number(v))?'Not recorded':'OMR '+Number(v).toFixed(3);
  let busy=false,loaded=false;
  const record=(row,kind)=>{
   const masters=localData()||{};
   const lines=Array.isArray(row.lines)?row.lines:[];
   const status=row.voided?'Voided':kind==='actual'?(row.locked?'Finalized':'Not finalized'):'Issued';
   return '<details class="jce-material-record"><summary><b>'+esc(row.department||'Consumables')+'</b> · '+esc(status)+' · '+esc(jobDate(row.actualAt||row.createdAt))+(kind==='actual'?' · '+esc(money(row.totalCost)):'')+'</summary>'+
    lines.map(l=>{
     const material=(masters.materials||[]).find(x=>x.id===l.materialId),brand=(masters.brands||[]).find(x=>x.id===l.brandId);
     const name=[l.materialName||material?.name||l.materialId,l.brandName||brand?.name||l.brandId].filter(Boolean).join(' / ');
     const quantity=kind==='actual'?l.actualQuantity??l.quantity:l.quantity??l.issuedQuantity;
     return '<div class="jce-material-line"><b>'+esc(name||'Material')+'</b> · '+esc(quantity??'Not recorded')+' '+esc(l.unit||'')+(kind==='actual'?' · Saved unit price '+esc(money(l.unitPriceSnapshot??l.unitPrice))+' · Saved line cost '+esc(money(l.lineCost)):'')+'</div>';
    }).join('')+'</details>';
  };
  function show(rows,notice){
   if(!valid())return;
   const group=(title,kind,list)=>'<h5>'+title+'</h5>'+(list.length?list.map(r=>record(r,kind)).join(''):'<p>No records.</p>');
   panel.hidden=false;
   panel.innerHTML='<h4>Job Consumables</h4><div class="jce-view-work"><p role="status">'+esc(notice)+'</p>'+group('Issued / Additional','issue',rows.issues)+group('Actual Materials','actual',rows.actuals)+'<button type="button" id="jce-materials-refresh">Refresh</button></div>';
   panel.querySelector('#jce-materials-refresh')?.addEventListener('click',load);
  }
  async function load(){
   if(busy||!valid())return;busy=true;panel.hidden=false;
   panel.innerHTML='<h4>Job Consumables</h4><div class="jce-view-work" role="status">Loading materials…</div>';
   try{
    const r=await api({action:'job_consumables_read',jobCard:String(j.no)});
    if(!valid())return;
    if(!Number.isSafeInteger(r.revision)||!Array.isArray(r.issues)||!Array.isArray(r.actuals)||![...r.issues,...r.actuals].every(sameJob))throw Error('Invalid material response');
    show(r,'Server records · recorded prices and costs · revision '+r.revision);loaded=true;
   }catch(e){
    if(!valid())return;
    if(e.status===401||e.status===403||['invalid_session','consumables_forbidden'].includes(e.code)){
     panel.innerHTML='<h4>Job Consumables</h4><p role="status">Materials access denied. Sign in again if needed.</p>';
    }else{
     const c=localData()||{};
     show({issues:(Array.isArray(c.issues)?c.issues:[]).filter(sameJob),actuals:(Array.isArray(c.actuals)?c.actuals:[]).filter(sameJob)},'Server records unavailable. Cached records only; they may be incomplete.');
    }
    loaded=true;
   }finally{busy=false;}
  }
  trigger.onclick=()=>{if(!valid())return;if(loaded||busy){panel.hidden=!panel.hidden;return;}load();};
 }
async function view(no,options={}){
 if(!['Manager','Supervisor','Receptionist'].includes(actor()?.role))return;
 const id=++loadId;draft=null;viewStyle();
 const back=async()=>{loadId++;closeModal();if(options.onBack)await options.onBack();else await window.zukaitReceptionDashboard?.resume?.()};
 const close=()=>actor()?.role==='Receptionist'?back():(loadId++,closeModal());
 openModal('<section class="jce-view"><p role="status">Loading Job Card '+esc(no)+' from server…</p><button id="jce-view-back">← Back</button><button id="jce-view-close">Close</button></section>');
 document.getElementById('jce-view-back').onclick=back;
 document.getElementById('jce-view-close').onclick=close;
 try{
  const {job:j}=await api({operation:'GET',jobCard:no});if(id!==loadId||!['Manager','Supervisor','Receptionist'].includes(actor()?.role))return;
  if(!j||String(j.no).trim().toUpperCase()!==String(no).trim().toUpperCase())throw Error('The server returned a different Job Card. Reopen the selected record.');
  openModal(viewHtml(j));document.querySelector('.jce-view')?.closest('.modal-box')?.classList.add('jce-view-modal');
  document.getElementById('jce-view-back').onclick=back;
  document.getElementById('jce-view-close').onclick=close;
  document.getElementById('jce-view-print').onclick=()=>printView(j);
   bindHistory(j,id);
   bindMaterials(j,id);
 }catch(e){if(id===loadId){alert(e.message);await back()}}
}
window.zukaitJobEdit={open,save,view};
window.v132OpenSupervisorVehicleEdit=open;
})();

