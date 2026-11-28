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
 return after.filter(r=>r&&typeof r.no==='string'&&!old.has(r.no)).map(r=>({kind:'BODYSHOP_JOB_CARD',id:r.no,make:r.make||r.vehicleMake||r.brand,model:r.model||r.vehicleModel,deleted:r.deleted,cancelled:r.cancelled}));
}
