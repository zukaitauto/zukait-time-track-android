/* Read-only exact-match historical correction planner. No mutation or authority to save. */
(function(root){
 'use strict';
 const norm=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
 const fail=code=>({ok:false,code});
 const validId=v=>typeof v==='string'&&v.length>0&&v.length<=160;
 const validRevision=v=>Number.isSafeInteger(v)&&v>=0;
 const closed=r=>r.closed===true||r.issuedDocument===true||r.delivered===true||r.cancelled===true||r.deleted===true||r.archived===true||['DELIVERED','CANCELLED','ARCHIVED','DELETED','CTL','CASH_LOSS'].includes(String(r.status||'').toUpperCase());
 function plan(snapshot,records,actor){
  if(actor?.role!=='Manager')return fail('manager_required');
  if(!Array.isArray(records)||records.length>5000)return fail('invalid_or_oversized_records');
  const api=typeof module!=='undefined'&&module.exports?require('./vehicle_index.js'):root.zukaitVehicleIndex;
  let data,index;
  try{data=api.validate(snapshot);index=api.create(data)}catch(_){return fail('catalogue_invalid')}
  const map=new Map(),byChecklist=new Map();
  for(const r of records){
   if(!r||!['CHECKLIST','JOB_CARD'].includes(r.kind)||!validId(r.id)||!validRevision(r.revision)||typeof r.make!=='string'||typeof r.model!=='string'||(r.linkedId!=null&&!validId(r.linkedId))||!['BODYSHOP','MECHANICAL'].includes(r.department))return fail('invalid_projection');
   const k=r.kind+':'+r.id;if(map.has(k))return fail('duplicate_record');map.set(k,r);
   if(r.kind==='JOB_CARD'&&r.linkedId){if(!byChecklist.has(r.linkedId))byChecklist.set(r.linkedId,[]);byChecklist.get(r.linkedId).push(r);}
  }
  function resolved(r){
   const match=index.resolve(r.make,r.model);
   if(match.status!=='MATCH')return null;
   // Only explicit approved aliases may generate spelling-correction candidates.
   const mk=data.makes.find(m=>m.id===match.makeId);
   const aliasUsed=data.aliases.some(a=>
    (a.kind==='make'&&a.targetId===mk.id&&norm(a.value)===norm(r.make))||
    (a.kind==='model'&&a.targetId===match.modelId&&norm(a.value)===norm(r.model)));
   return {match,aliasUsed,changed:norm(r.make)!==norm(match.make)||norm(r.model)!==norm(match.model)};
  }
  const items=[],seen=new Set();
  for(const r of records){
   if(seen.has(r.kind+':'+r.id))continue;
   const result=resolved(r);
   if(!result?.aliasUsed||!result.changed)continue;
   const group=[r];let blocked=null;
   if(r.kind==='CHECKLIST'&&r.linkedId){
    const j=map.get('JOB_CARD:'+r.linkedId);
    if(!j||j.linkedId!==r.id||byChecklist.get(r.id)?.length!==1)blocked='linked_record_missing_or_conflicting';
    else group.push(j);
   }else if(r.kind==='JOB_CARD'&&r.linkedId){
    const c=map.get('CHECKLIST:'+r.linkedId);
    if(!c||c.linkedId!==r.id||byChecklist.get(c.id)?.length!==1)blocked='linked_record_missing_or_conflicting';
    else group.push(c);
   }else if(r.kind==='CHECKLIST'&&byChecklist.has(r.id))blocked='linked_record_missing_or_conflicting';
   for(const x of group)seen.add(x.kind+':'+x.id);
   const m=result.match;
   if(group.some(x=>x.department!==r.department))blocked='department_conflict';
   if(group.some(x=>closed(x)))blocked='closed_or_issued_record';
   if(group.some(x=>{const q=resolved(x);return !q||q.match.makeId!==m.makeId||q.match.modelId!==m.modelId}))blocked='linked_vehicle_conflict';
   if(group.some(x=>x.kind==='JOB_CARD'&&x.id.toUpperCase()==='ID001'))blocked='non_vehicle_record';
   const checklist=group.find(x=>x.kind==='CHECKLIST');
   items.push({status:blocked?'MANUAL_REVIEW':'READY_FOR_EXISTING_EDITOR',reason:blocked,
    department:r.department,route:blocked?null:checklist?(r.department==='MECHANICAL'?'MECHANICAL_CHECKLIST':'RECEPTION_CHECKLIST'):(r.department==='MECHANICAL'?'MECHANICAL_JOB_CARD':'MANAGER_JOB_EDIT'),
    routeId:blocked?null:(checklist||r).id,
    records:group.map(x=>({kind:x.kind,id:x.id,revision:x.revision,before:{make:x.make,model:x.model},after:{make:m.make,model:m.model}})),
    historicalRecordsChanged:0});
  }
  return {ok:true,catalogueVersion:data.version,scanned:records.length,items,ready:items.filter(x=>x.status==='READY_FOR_EXISTING_EDITOR').length,manual:items.filter(x=>x.status==='MANUAL_REVIEW').length,historicalRecordsChanged:0};
 }
 const api=Object.freeze({plan});if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.zukaitVehicleHistoricalReview=api;
})(typeof window!=='undefined'?window:globalThis);
