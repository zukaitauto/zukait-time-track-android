// Session roles and the current server job, never submitted role/status, own edits.
const copy=v=>JSON.parse(JSON.stringify(v));
const fields=['make','model','year','reg','vin','customer','mobile','notes','color','colorCode','jobType','insuranceCompany','claimNo','amount'];
const fullFields=['createdAt','vehicle','brand','insurance','customerName','customerMobile','vinNumber','chassis','claimNumber','promiseDate','email','customerAddress','creditAccount','jobIntakeOdometer','jobIntakeOdometerUnit','invoiceDate','workDescription','deliveredAt','deliveryDate'];
const calendarDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const identity=['make','model','year','reg','vin','customer','mobile','jobType','insuranceCompany','claimNo'];
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
export function optionalJobAmount(value){
 if(value==null||value==='')return {ok:true,value:null};
 if(!['string','number'].includes(typeof value)||!/^\d+(?:\.\d{1,3})?$/.test(String(value).trim()))return {ok:false};
 const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=1000000?{ok:true,value:n}:{ok:false};
}
export function jobEditProjection(job){
 return Object.fromEntries(['no','vehicle','createdAt','delivered','receptionNo','directReceptionJob','editRevision',...fields].filter(k=>k in job).map(k=>[k,copy(job[k])]));
}
// Read-only Job Card fields, separate from editable fields and cost/time records.
export function jobViewProjection(job){
 const viewFields=['id','status','completed','cancelled','deliveredAt','deliveryDate','promiseDate','finalInvoiceAmount','invoiceAmount','invoiceDate',
 'vehicleMake','vehicleModel','brand','modelYear','vehicleYear','registration','registrationNo','VIN','vinNumber','chassis','chassisNo',
 'customerName','customerMobile','customerContact','contact','phone','tel','email','customerAddress','address',
 'colour','colourCode','insurance','claimNumber','claim','jobNotes','workDescription','work_description','workDescriptions','description','descriptions','workDetails','requestedWork','remarks',
 'creditAccount','jobIntakeOdometer','jobIntakeOdometerUnit','jobIntakeUnit','odometer','odometerUnit'];
 return {...jobEditProjection(job),...Object.fromEntries(viewFields.filter(k=>k in job).map(k=>[k,copy(job[k])]))};
}
// Legacy Reception intake stored the work description only in the creation audit.
// Read it for display without changing the job or resurrecting an explicitly cleared field.
export async function jobViewWithIntakeDescription(admin,job){
 const view=jobViewProjection(job);
 if(typeof job.workDescription==='string')return view;
 const existing=['work_description','workDescriptions','description','descriptions','workDetails','requestedWork'];
 if(existing.some(k=>job[k]!=null&&String(job[k]).trim()))return view;
 if(!job.directReceptionJob&&!String(job.v2EventId||'').startsWith('rc-direct-'))return view;
 let creation=null;
 const direct=await admin.from('workshop_direct_job_audit').select('reason,after_data').eq('job_card',String(job.no)).is('before_data',null).order('id',{ascending:true}).limit(1).maybeSingle();
 if(direct.error)throw direct.error;
 if(String(direct.data?.after_data?.no||'')===String(job.no))creation=direct.data;
 if(!creation&&job.receptionNo){
  const legacy=await admin.from('workshop_reception_audit').select('reason,after_data').eq('rc_no',job.receptionNo).eq('operation','CREATE_DIRECT_JOB').order('id',{ascending:true}).limit(1).maybeSingle();
  if(legacy.error)throw legacy.error;
  if(String(legacy.data?.after_data?.job_card||'')===String(job.no))creation=legacy.data;
 }
 const text=String(creation?.reason||'').trim();
 if(text&&!['Linked Job Card intake','Direct Job intake'].includes(text)&&!text.startsWith('Supervisor Quick Entry:'))view.workDescription=text;
 return view;
}
export function jobEditTransition(data,user,request,now){
 const error=code=>({ok:false,code});
 if(!['Manager','Supervisor','Receptionist'].includes(user?.role))return error('job_edit_forbidden');
 const old=(data.jobs||[]).find(j=>String(j?.no)===String(request.jobCard));
 if(!old||old.no==='ID001'||old.deleted||old.archived||old.cancelled||String(old.status).toUpperCase()==='CANCELLED')return error('job_not_available');
 if(old.delivered&&user.role!=='Manager')return error('job_edit_manager_required');
 if(Number(request.expectedEditRevision)!==Number(old.editRevision||0))return error('job_edit_conflict');
 const patch=request.patch;
 const full=request.operation==='FULL_EDIT'&&user.role==='Manager';
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!fields.includes(k)&&!(full&&fullFields.includes(k))))return error('job_edit_invalid_fields');
 if(full&&!same(old,request.expectedJob))return error('job_edit_conflict');
 const reason=String(request.reason||'').trim();if(!reason||reason.length>2000)return error('job_edit_reason_required');
 const next={...old};
 for(const [k,v] of Object.entries(patch)){
  if(k==='amount'){
   const parsed=optionalJobAmount(v);if(!parsed.ok)return error('job_edit_invalid_amount');
   if(old.finalInvoiceAmount!=null&&old.finalInvoiceAmount!==''&&parsed.value!==Number(old.finalInvoiceAmount)){
    if(!full||parsed.value===null)return error('job_edit_invoice_authoritative');
    next.finalInvoiceAmount=parsed.value;next.invoiceAmount=parsed.value;
    const audit={operation:'FINAL_INVOICE_CORRECTION',by:user.id,name:user.name||user.id,at:now,from:Number(old.finalInvoiceAmount),to:parsed.value,reason};
    next.financialAudit=[...(old.financialAudit||[]),audit];next.qcWorkflow={...(old.qcWorkflow||{}),revision:Number(old.qcWorkflow?.revision||0)+1,history:[...(old.qcWorkflow?.history||[]),audit]};
   }
   next.amount=parsed.value;
  }else if(k==='jobIntakeOdometer'&&full){
   if(v!==null&&(!Number.isFinite(v)||v<0||v>100000000))return error('job_edit_invalid_fields');next[k]=v;
  }else if(k==='deliveredAt'&&full){
   if(!old.delivered||!Number.isFinite(v)||v<=0||!Number.isFinite(new Date(v).getTime()))return error('job_edit_invalid_fields');next[k]=v;
  }else if(k==='createdAt'&&full){
   if(!Number.isFinite(v)||v<=0||!Number.isFinite(new Date(v).getTime()))return error('job_edit_invalid_fields');next.createdAt=v;
  }else{
   if(typeof v!=='string'||v.length>(k==='workDescription'?10000:['notes','customerAddress'].includes(k)?2000:200))return error('job_edit_invalid_fields');
   next[k]=v.trim();
   if(full&&['promiseDate','invoiceDate','deliveryDate'].includes(k)&&next[k]&&!calendarDate(next[k]))return error('job_edit_invalid_fields');
   if(k==='deliveryDate'&&!old.delivered)return error('job_edit_invalid_fields');
   if(k==='email'&&next[k]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next[k]))return error('job_edit_invalid_fields');
   if(k==='jobIntakeOdometerUnit'&&!['KM','MILES'].includes(next[k].toUpperCase()))return error('job_edit_invalid_fields');
  }
  if(!full&&(old.receptionNo||(old.directReceptionJob&&user.role!=='Manager'))&&identity.includes(k)&&String(next[k]||'')!==String(old[k]||''))return error('job_edit_linked_identity');
 }
 if(full&&'jobIntakeOdometerUnit' in patch)next.jobIntakeOdometerUnit=next.jobIntakeOdometerUnit.toUpperCase();
 if(full&&'jobIntakeOdometer' in patch&&'odometer' in old)next.odometer=next.jobIntakeOdometer;
 if(full&&'jobIntakeOdometerUnit' in patch)for(const k of ['odometerUnit','jobIntakeUnit'])if(k in old)next[k]=next.jobIntakeOdometerUnit;
 if(full&&'notes' in patch)for(const k of ['jobNotes','remarks'])if(k in old)next[k]=next.notes;
 if(full&&'deliveredAt' in patch)next.deliveryDate=new Date(next.deliveredAt+14400000).toISOString().slice(0,10);
 if(full&&'customerAddress' in patch&&'address' in old)next.address=next.customerAddress;
 if(full&&'workDescription' in patch)for(const key of ['work_description','workDescriptions','description','descriptions','workDetails','requestedWork'])if(key in old)next[key]=next.workDescription;
 if('reg' in patch)next.reg=next.reg.toUpperCase();
 if('vin' in patch){next.vin=next.vin.toUpperCase().replace(/[^A-Z0-9]/g,'');if(next.vin.length>32)return error('job_edit_invalid_fields');}
 if('year' in patch&&next.year&&(!/^\d{4}$/.test(next.year)||Number(next.year)<1900||Number(next.year)>2100))return error('job_edit_invalid_fields');
 if(('make' in patch&&!next.make)||('model' in patch&&!next.model)||('reg' in patch&&!next.reg))return error('job_edit_invalid_fields');
 if('jobType' in patch&&!['CASH','CREDIT','INSURANCE'].includes(next.jobType.toUpperCase()))return error('job_edit_invalid_fields');
 if(('jobType' in patch||'insuranceCompany' in patch)&&String(next.jobType).toUpperCase()==='INSURANCE'&&!next.insuranceCompany)return error('job_edit_invalid_fields');
 if('make' in patch||'model' in patch){next.vehicle=[next.make,next.model].filter(Boolean).join(' ');next.brand=next.make;}
 if('customer' in patch)next.customerName=next.customer;
 if('mobile' in patch)next.customerMobile=next.mobile;
 if('insuranceCompany' in patch)next.insurance=next.insuranceCompany;
 if('vin' in patch){next.vinNumber=next.vin;next.chassis=next.vin;}
 if('claimNo' in patch)next.claimNumber=next.claimNo;
 next.editRevision=Number(old.editRevision||0)+1;
 const candidate=copy(data),index=candidate.jobs.findIndex(j=>String(j.no)===String(old.no));candidate.jobs[index]=next;
 if(full){
  const assignments=(data.assign||[]).filter(a=>a.job===old.no&&!a.cancelled);
  const expected=request.expectedAssignments;
  if(!Array.isArray(expected)||!same(assignments.map(a=>({id:a.id,suggested:a.suggested})),expected))return error('job_edit_conflict');
  if(!Array.isArray(request.allocations)||request.allocations.length!==assignments.length||new Set(request.allocations.map(a=>a.id)).size!==assignments.length)return error('job_edit_invalid_fields');
  for(const update of request.allocations){
   const prior=assignments.find(a=>a.id===update.id);
   if(!prior||!Number.isSafeInteger(update.minutes)||update.minutes<=0||update.minutes>1000000)return error('job_edit_invalid_fields');
   const a=candidate.assign.find(a=>a.id===update.id);a.suggested=update.minutes;
   if(prior.suggested!==update.minutes)(candidate.suggestedEdits??=[]).push({job:old.no,assignmentId:a.id,emp:a.emp,oldMinutes:prior.suggested,newMinutes:update.minutes,reason,by:user.id,at:now});
  }
 }
 (candidate.jobEdits??=[]).push({job:old.no,operation:'JOB_CARD_EDIT',before:full?copy(old):jobEditProjection(old),after:full?copy(next):jobEditProjection(next),reason,by:user.id,byName:user.name||user.id,at:now});
 return {ok:true,data:candidate,job:next};
}
export function preserveJobEditAuthority(candidate,current,user){
 const byNo=new Map((current.jobs||[]).map(j=>[String(j.no),j]));
 const protectedFields=[...fields,...fullFields,'odometer','odometerUnit','jobIntakeUnit','jobNotes','remarks','address','work_description','workDescriptions','description','descriptions','workDetails','requestedWork','createdAt','vehicle','brand','customerName','customerMobile','vinNumber','chassis','claimNumber','insurance','editRevision','directReceptionJob'];
 for(const j of candidate.jobs||[]){const old=byNo.get(String(j.no));if(!old)continue;
  // Dedicated edits survive stale snapshot saves; all delivered details are Manager-only.
  if(Number(j.editRevision||0)!==Number(old.editRevision||0)||!['Manager','Supervisor'].includes(user?.role)||(old.delivered&&user.role!=='Manager')){
   for(const k of protectedFields){if(k in old)j[k]=copy(old[k]);else delete j[k];}
  }
  const parsed=optionalJobAmount(j.amount);if(!parsed.ok)j.amount=old.amount;
  if(old.delivered&&user?.role!=='Manager')for(const k of ['delivered','deliveredAt','deliveredBy','deliveredByName','deliveryDate','status','createdAt']){if(k in old)j[k]=copy(old[k]);else delete j[k];}
  if(old.finalInvoiceAmount!=null&&old.finalInvoiceAmount!=='')j.amount=Number(old.finalInvoiceAmount);
  const changed=fields.some(k=>JSON.stringify(j[k])!==JSON.stringify(old[k]));
  if(changed){j.editRevision=Number(old.editRevision||0)+1;(candidate.jobEdits??=[]).push({job:old.no,operation:'JOB_CARD_SNAPSHOT_EDIT',before:jobEditProjection(old),after:jobEditProjection(j),by:user.id,at:Date.now()});}
 }
 return candidate;
}
