(function(){'use strict';
const actor=()=>typeof me!=='undefined'?me:window.me;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=[['make','Make'],['model','Model'],['year','Year'],['reg','Registration Number'],['vin','VIN / Chassis'],['customer','Customer'],['mobile','Contact'],['color','Vehicle Color'],['colorCode','Paint Color Code'],['claimNo','Claim Number'],['insuranceCompany','Insurance Company'],['notes','Job Notes'],['amount','Cash Amount (OMR) — optional']];
const linked=new Set(['make','model','year','reg','vin','customer','mobile','jobType','insuranceCompany','claimNo']);
const messages={job_edit_manager_required:'Only Manager can edit a delivered Job Card.',job_edit_conflict:'This Job Card changed. Reopen Edit Job Card to use the latest details.',job_edit_invoice_authoritative:'The final invoice owns this amount. Use Invoice Entry to correct it.',job_edit_linked_identity:'Correct linked vehicle details in the Reception Checklist.',job_edit_invalid_amount:'Enter an amount from 0 to 1,000,000 OMR with up to three decimal places.',job_edit_forbidden:'Your login cannot edit Job Cards.',job_edit_reason_required:'Enter a reason for this change.'};
let draft=null,busy=false,loadId=0;
async function api(body){
 if(!navigator.onLine)throw Error('Connect to the server to edit a Job Card.');
 const response=await fetch('https://pjknotnjkufadqavcmii.supabase.co/functions/v1/workshop-api',{method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A','x-zukait-session':window.zukaitAuth?.getToken?.()||''},body:JSON.stringify({action:'job_card_edit',...body})});
 const result=await response.json();if(!response.ok||!result.ok)throw Error(messages[result.code]||(body.operation==='GET'?'Job Card could not be loaded. Refresh and try again.':'Job Card could not be saved. Refresh and try again.'));return result;
}
async function open(no){
 if(!['Manager','Supervisor','Receptionist'].includes(actor()?.role))return;
 const id=++loadId;draft=null;
 try{
  const result=await api({operation:'GET',jobCard:no});if(id!==loadId)return;
  const j=result.job;if(j.delivered&&actor()?.role!=='Manager')throw Error(messages.job_edit_manager_required);
  draft={job:j,locked:result.invoice_locked};
  if(!j.make||!j.model){const n=window.zukaitNormalizeVehicle?.(j.make||'',j.model||'',j.vehicle||'');if(n){j.make=j.make||n.make;j.model=j.model||n.model;}}
  const input=([key,label])=>'<label>'+esc(label)+'<input id="jce-'+key+'" '+(key==='amount'?'type="number" min="0" max="1000000" step="0.001" inputmode="decimal" ':'')+'value="'+esc(j[key])+'"'+(j.receptionNo&&linked.has(key)||key==='amount'&&result.invoice_locked?' readonly':'')+'></label>';
  openModal('<section class="jce-form"><h3>Edit Job Card · '+esc(j.no)+'</h3>'+(j.receptionNo?'<p>Vehicle identity is linked to '+esc(j.receptionNo)+'. Correct it in Reception Checklist.</p>':'')+(result.invoice_locked?'<p>Final invoice amount is authoritative. Use Invoice Entry for a correction.</p>':'')+'<form id="jce-form"><div class="grid">'+fields.map(input).join('')+'<label>Job Type<select id="jce-jobType"'+(j.receptionNo?' disabled':'')+'>'+['Cash','Credit','Insurance'].map(t=>'<option'+(t.toUpperCase()===String(j.jobType||'').toUpperCase()?' selected':'')+'>'+t+'</option>').join('')+'</select></label></div><label>Reason for Change<textarea id="jce-reason" maxlength="2000" required></textarea></label><button type="submit">Save Changes</button><button type="button" id="jce-cancel">Cancel</button></form></section>');
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
  if(j.receptionNo&&linked.has(key)||key==='amount'&&current.locked)continue;
  const raw=String(document.getElementById('jce-'+key)?.value||'').trim(),value=key==='amount'?(raw===''?null:raw):raw;
  if(String(value??'')!==String(j[key]??''))patch[key]=value;
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
function viewCss(){return '.jce-view{box-sizing:border-box;max-width:1000px;margin:auto;padding:16px;background:white;color:#172033;overflow-wrap:anywhere}.jce-view-modal{max-width:1040px!important;width:calc(100vw - 24px)!important;max-height:calc(100vh - 24px)!important;max-height:calc(100dvh - 24px)!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch}.jce-view-header{display:flex;align-items:start;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:2px solid #173e54;padding-bottom:12px}.jce-view-nav{display:flex;gap:8px;flex-wrap:wrap}.jce-view-nav button{min-height:44px;touch-action:manipulation}.jce-view-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0}.jce-view-field{min-width:0;border-bottom:1px solid #e1e8ee;padding:8px 0}.jce-view-field b{font-size:13px;color:#496578}.jce-view-value{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;line-height:1.5}.jce-view-wide{grid-column:1/-1}.jce-view h3{margin:0 0 8px}@media(max-width:550px){.jce-view{padding:10px}.jce-view-fields{grid-template-columns:1fr}.jce-view-nav{width:100%}}@page{size:A4;margin:12mm}@media print{.jce-view-nav{display:none!important}.jce-view{padding:0;max-width:none}.jce-view-fields{display:block}.jce-view-field{break-inside:avoid}.jce-view-wide{break-inside:auto}.jce-view-value{overflow:visible!important}}'}
function viewValue(value){if(value==null||value==='')return '—';if(typeof value==='object')return JSON.stringify(value,null,2);return String(value)}
function jobDate(value){if(value==null||value==='')return 'Not recorded';const n=typeof value==='number'?value:/^\d+$/.test(String(value))?Number(value):Date.parse(value);return Number.isFinite(n)?new Date(n).toLocaleString('en-GB',{timeZone:'Asia/Muscat',dateStyle:'medium',timeStyle:'short'}):String(value)}
function viewHtml(j,actions=true){
 const first=(...keys)=>keys.map(k=>j[k]).find(v=>v!=null&&v!=='')??'';
 const money=v=>v==null||v===''?'Not entered':'OMR '+Number(v).toFixed(3);
 const values=[['Job Card number',j.no],['Created · Oman time',jobDate(j.createdAt)],['Job type',j.jobType],['Status',j.delivered?'Delivered':j.status||(j.completed?'Completed':'Open')],
 ['Make',first('make','vehicleMake','brand')],['Model',first('model','vehicleModel')],['Vehicle',j.vehicle],['Year',first('year','modelYear','vehicleYear')],['Registration',first('reg','registration','registrationNo')],['VIN / Chassis',first('vin','VIN','vinNumber','chassis','chassisNo')],
 ['Vehicle colour',first('color','colour')],['Paint colour code',first('colorCode','colourCode')],['Customer',first('customer','customerName')],['Contact',first('mobile','customerMobile','customerContact','contact','phone','tel')],['Email',j.email],['Customer address',first('customerAddress','address')],
 ['Insurance company',first('insuranceCompany','insurance')],['Claim number',first('claimNo','claimNumber','claim')],['Amount',money(j.amount)],['Final invoice amount',money(j.finalInvoiceAmount??j.invoiceAmount)],['Invoice date',j.invoiceDate],['Credit account / reference',j.creditAccount],['Intake odometer',first('jobIntakeOdometer','odometer')],['Odometer unit',first('jobIntakeOdometerUnit','jobIntakeUnit','odometerUnit')],['Delivered · Oman time',j.deliveredAt||j.deliveryDate?jobDate(j.deliveredAt||j.deliveryDate):'Not delivered'],['Promise date',j.promiseDate],['Linked Reception Checklist',j.receptionNo]];
 const work=['notes','jobNotes','workDescription','work_description','workDescriptions','description','descriptions','workDetails','requestedWork','remarks'];
 const labels={notes:'Job notes',jobNotes:'Additional job notes',workDescription:'Work description',work_description:'Work description',workDescriptions:'Work descriptions',description:'Description',descriptions:'Descriptions',workDetails:'Work details',requestedWork:'Requested work',remarks:'Remarks'};
 const row=(label,value,wide=false)=>'<div class="jce-view-field'+(wide?' jce-view-wide':'')+'"><b>'+esc(label)+'</b><div class="jce-view-value">'+esc(viewValue(value))+'</div></div>';
 return '<section class="jce-view" data-job-card="'+esc(j.no)+'"><header class="jce-view-header"><div><h3>Job Card · '+esc(j.no)+'</h3><small>ZUKAIT INTERNATIONAL LLC</small></div>'+(actions?'<nav class="jce-view-nav"><button type="button" id="jce-view-back">← Back</button><button type="button" id="jce-view-print">Print</button><button type="button" id="jce-view-close">Close</button></nav>':'')+'</header><div class="jce-view-fields">'+values.map(([label,value])=>row(label,value)).join('')+work.filter(k=>j[k]!=null&&j[k]!=='').map(k=>row(labels[k],j[k],true)).join('')+'</div></section>';
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
 }catch(e){if(id===loadId){alert(e.message);await back()}}
}
window.zukaitJobEdit={open,save,view};
window.v132OpenSupervisorVehicleEdit=open;
})();
