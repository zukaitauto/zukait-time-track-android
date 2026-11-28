/* Server-side observation planning only. Pass confirmed saved records, never untrusted form data. */
const valid=v=>typeof v==='string'&&v.trim().length>0&&v.length<=160&&!/[\u0000-\u001f\u007f]/.test(v);
const norm=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
export function planVehicleIntake(index,actor,receipt,records){
 if(!['Manager','Supervisor','Receptionist','Mechanical Supervisor'].includes(actor?.role)||!actor?.id||receipt?.ok!==true||!Array.isArray(records)||records.length>100)return [];
 const seen=new Set(),items=[];
 for(const record of records){
  if(!record||!['RECEPTION_CHECKLIST','BODYSHOP_JOB_CARD','MECHANICAL_CHECKLIST','MECHANICAL_JOB_CARD'].includes(record.kind)||!valid(record.id)||record.id.toUpperCase()==='ID001'||!valid(record.make)||!valid(record.model)||record.deleted||record.cancelled)continue;
  if(actor.role==='Mechanical Supervisor'&&!record.kind.startsWith('MECHANICAL_'))continue;
  const make=record.make.trim(),model=record.model.trim();
  if(index.resolve(make,model).status!=='REVIEW_REQUIRED')continue;
  const k=JSON.stringify([norm(make),norm(model)]);
  if(seen.has(k))continue;
  seen.add(k);items.push({make,model,sourceKind:record.kind,sourceId:record.id});
 }
 return items;
}
// Compare only newly committed job numbers, not changed historical records.
// Existing make/model corrections have a separate authorized workflow.
export function newSavedJobs(before,after){
 if(!Array.isArray(before)||!Array.isArray(after))return [];
 const old=new Set(before.map(r=>String(r?.no??'')));
 return after.filter(r=>r&&typeof r.no==='string'&&!old.has(r.no)).map(r=>({kind:/^MJC/i.test(r.no)?'MECHANICAL_JOB_CARD':'BODYSHOP_JOB_CARD',id:r.no,make:r.make||r.vehicleMake||r.brand,model:r.model||r.vehicleModel,deleted:r.deleted,cancelled:r.cancelled}));
}

// Project the authoritative server receipt only. Never pass client-entered fields.
export function receptionIntakeRecords(operation,receipt){
 if(receipt?.ok!==true||!['CREATE','CREATE_DIRECT_JOB','CREATE_EXTERNAL_JOB','CREATE_CHECKLIST_JOB','CREATE_JOB'].includes(operation))return [];
 const r=receipt.record,j=receipt.job;
 if(j?.no&&j.make&&j.model)return [{kind:'BODYSHOP_JOB_CARD',id:j.no,make:j.make,model:j.model,deleted:j.deleted,cancelled:j.cancelled}];
 if(r?.rc_no&&r.details)return [{kind:'RECEPTION_CHECKLIST',id:r.rc_no,make:r.details.make,model:r.details.model}];
 return [];
}
export function mechanicalIntakeRecords(operation,receipt){
 if(receipt?.ok!==true||operation!=='CREATE')return [];
 const r=receipt.checklist;
 if(!r?.checklist_number||!r.vehicle)return [];
 return [{kind:'MECHANICAL_CHECKLIST',id:r.checklist_number,make:r.vehicle.make,model:r.vehicle.model}];
}
// One small RPC after a confirmed save; normal edits and empty observations make no request.
// Errors never reverse or masquerade as failed workshop saves. Server log is deliberately PII-free.
export async function captureCommittedVehicleIntake(admin,actor,receipt,records,{enabled=false,sessionHash='',onFailure=()=>{}}={}){
 if(!enabled||!(/^[a-f0-9]{64}$/).test(sessionHash))return {status:'SKIPPED'};
 const fail=()=>{try{onFailure()}catch(_){}return {status:'DEFERRED'}};
 try{
  if(!Array.isArray(records)||records.length===0)return {status:'SKIPPED'};
  if(records.length>100)return fail();
  // The server DB owns the current catalogue, so even already-indexed pairs are
  // checked against the authoritative revision (no client catalogue is trusted).
  const candidates=planVehicleIntake({resolve:()=>({status:'REVIEW_REQUIRED'})},actor,receipt,records);
  if(!candidates.length)return {status:'SKIPPED'};
  const {data,error}=await admin.rpc('zukait_vehicle_index_observe_batch',{p_session_hash:sessionHash,p_records:candidates});
  if(error||data?.ok!==true)return fail();
  return {status:'CAPTURED',count:data.count};
 }catch(_){return fail()}
}
