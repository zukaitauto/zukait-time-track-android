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
 const result=await response.json();if(!response.ok||!result.ok)throw Error(messages[result.code]||'Job Card could not be saved. Refresh and try again.');return result;
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
window.zukaitJobEdit={open,save};
window.v132OpenSupervisorVehicleEdit=open;
})();
