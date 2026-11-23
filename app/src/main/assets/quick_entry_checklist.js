(function(){'use strict';
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
let busy=false;
function eligible(r){return r&&!r.job_card&&!r.outcome&&!r.released_date&&(!r.repair_status||r.repair_status==='PENDING')&&r.details?.direct_job_only!==true;}
function matches(r,input){const d=r.details||{};return (!!norm(input.reg)&&norm(d.registration)===norm(input.reg))||(!!norm(input.vin)&&norm(d.vin)===norm(input.vin));}
async function search(input,call){
 const found=new Map();
 for(const query of [...new Set([input.reg,input.vin].filter(Boolean))]){
  let before;
  for(let page=0;page<100;page++){
   const result=await call({operation:'LIST',search:query,...(before?{before_sequence:before}:{})});
   const rows=result.rows||[];for(const r of rows)if(eligible(r)&&matches(r,input))found.set(r.rc_no,r);
   if(rows.length<100)break;
   const next=rows.at(-1).sequence_no;if(!next||next===before||page===99)throw Error('Checklist search could not finish. Open Reception to review before creating this job.');before=next;
  }
 }
 return [...found.values()];
}
function pendingKey(no){return 'zukait_quick_checklist_v1:'+String((typeof me!=='undefined'&&me?.id)||'')+':'+no;}
async function offer(input){
 if(busy){alert('Checklist lookup is already in progress.');return true;}
 busy=true;
 try{
  const api=window.zukaitReception;if(!api?.call)throw Error('Reception checklist lookup is unavailable. Refresh before creating this job.');
  const key=pendingKey(input.no);let command;const pending=localStorage.getItem(key);
  if(pending){command=JSON.parse(pending);if(!confirm('Retry the pending checklist link for Job Card '+input.no+'? The same request will be reused to prevent duplicates.'))return true;}
  else{
   const rows=await search(input,api.call);if(!rows.length)return false;
   const choice=prompt('Existing checklists match this vehicle. Enter a number to review and link, or 0 to continue WITHOUT linking. Cancel stops job creation.\n\n'+rows.map((r,i)=>(i+1)+'. '+r.rc_no+' · '+[r.details?.make,r.details?.model,r.details?.year].filter(Boolean).join(' ')+' · '+(r.details?.registration||'')+' · '+(r.job_type||'INSURANCE')).join('\n'),'');
   if(choice===null)return true;if(choice.trim()==='0')return false;
   if(!/^\d+$/.test(choice.trim())||!rows[Number(choice)-1])throw Error('No checklist selected. Please try again.');
   const detail=await api.call({operation:'GET',rc_no:rows[Number(choice)-1].rc_no}),r=detail.record;
   if(!eligible(r)||!matches(r,input))throw Error('This checklist is no longer available or its vehicle details changed. Review it in Reception.');
   const d=r.details||{},kind=String(r.job_type||'INSURANCE').toUpperCase();
   if(kind!==input.jobType)throw Error('Checklist job type is '+kind+'. Set the Quick Entry job type to match before linking.');
   let operation='CREATE_CHECKLIST_JOB';
   if(kind==='INSURANCE'){
    if(detail.external_approval?.valid)operation='CREATE_EXTERNAL_JOB';
    else if(detail.job_creation?.can_create)operation='CREATE_JOB';
    else throw Error('Insurance approval must be completed in Reception before linking this checklist.');
   }
   if(!confirm('Link '+r.rc_no+' and CREATE Job Card '+input.no+'?\n\nThe job will use these checklist details:\n'+[d.make,d.model,d.year].filter(Boolean).join(' ')+'\nRegistration: '+(d.registration||'')+'\nVIN: '+(d.vin||'Not recorded')+'\nType: '+kind+'\nInsurance: '+(r.insurance_company||'Not applicable / not recorded')+'\nCustomer: '+(d.customer||'Not recorded')+'\n\nThe original checklist is preserved.'+(input.emp?'\nThe selected technician will be assigned after creation.':'')))return true;
   command={operation,rc_no:r.rc_no,expected_revision:r.revision,job_card:input.no,cash_amount:input.amountRaw||'',reason:'Supervisor Quick Entry: confirmed existing checklist link',request_id:crypto.randomUUID()};
   if(operation==='CREATE_EXTERNAL_JOB'){command.job_intake_odometer=String(d.odometer||'');command.job_intake_unit=String(d.odometer_unit||'KM');}
   localStorage.setItem(key,JSON.stringify(command));
  }
  const receipt=await api.call(command);
  if(String(receipt.job_card||receipt.job?.no||receipt.record?.job_card)!==input.no)throw Error('The server did not confirm this linked job. Retry with the same job number.');
  await window.zukaitCloud?.syncNow?.();await window.zukaitCloud?.pull?.(true);
  const job=(typeof state!=='undefined'?state.jobs:[]).find(j=>String(j.no)===input.no);
  if(!job)throw Error('Job creation was confirmed but this device has not refreshed it. Retry with the same job number.');
  localStorage.removeItem(key);
  let assignment=null;if(input.emp)assignment=window.assignJobCore?.(input.no,input.emp,input.mins);
  if(input.emp&&!assignment)alert('Linked Job Card '+input.no+' was created. Technician assignment was not confirmed; use Assign Existing Job Card.');
  else alert('Job Card '+input.no+' created and linked to '+command.rc_no+'.');
  if(typeof render==='function')render();return true;
 }catch(error){alert(error.message||'Checklist linking was not confirmed. Keep this device data and retry.');return true;}
 finally{busy=false;}
}
window.zukaitQuickChecklist={offer};
})();
