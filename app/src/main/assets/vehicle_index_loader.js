/* Accept only a fresh authenticated server response over an explicitly injected transport.
 * Local storage is not authority for Manager approvals. Offline uses reviewed bundled data.
 */
(function(root){
 'use strict';
 const api=()=>typeof module!=='undefined'&&module.exports?require('./vehicle_index.js'):root.zukaitVehicleIndex;
 function merge(base,reply){
  const seed=api().validate(base);
  if(reply?.ok!==true||reply.baseVersion!==seed.version||!Number.isSafeInteger(reply.version)||reply.version<seed.version||!Array.isArray(reply.changes)||reply.changes.length!==reply.version-seed.version||reply.changes.length>5000)throw Error('invalid_catalogue_overlay');
  const next=JSON.parse(JSON.stringify(seed));let version=seed.version;
  const known=new Set([...next.makes,...next.models].map(r=>r.id)),seenRequests=new Set();
  const nonempty=v=>typeof v==='string'&&v.trim().length>0&&v.length<=160;
  for(const c of reply.changes){
   if(!c||c.version!==++version||!nonempty(c.id)||!c.id.startsWith('local:')||known.has(c.id)||!nonempty(c.name)||!nonempty(c.approvedBy)||!nonempty(c.approvedAt)||!Number.isFinite(Date.parse(c.approvedAt))||!nonempty(c.requestId)||seenRequests.has(c.requestId))throw Error('invalid_catalogue_approval');
   known.add(c.id);seenRequests.add(c.requestId);
   const row={id:c.id,name:c.name,sourceId:'zukait-manager-approval',sourceRecord:'approval:'+c.requestId,approvedBy:c.approvedBy,approvedAt:c.approvedAt};
   if(c.kind==='ADD_MAKE'&&!c.makeId&&!c.targetId)next.makes.push(row);
   else if(c.kind==='ADD_MODEL'&&next.makes.some(m=>m.id===c.makeId)&&!c.targetId)next.models.push({...row,makeId:c.makeId});
   else if(c.kind==='MAKE_ALIAS'&&!c.makeId&&next.makes.some(m=>m.id===c.targetId))next.aliases.push({kind:'make',value:c.name,targetId:c.targetId,status:'APPROVED',approvedBy:c.approvedBy,approvedAt:c.approvedAt});
   else if(c.kind==='MODEL_ALIAS'&&next.models.some(m=>m.id===c.targetId&&m.makeId===c.makeId))next.aliases.push({kind:'model',value:c.name,targetId:c.targetId,status:'APPROVED',approvedBy:c.approvedBy,approvedAt:c.approvedAt});
   else throw Error('invalid_catalogue_scope');
  }
  if(next.makes.concat(next.models).some(r=>r.sourceId==='zukait-manager-approval')&&!next.sources.some(s=>s.id==='zukait-manager-approval')){
   next.sources.push({id:'zukait-manager-approval',license:'INTERNAL-MANAGER',url:'https://zukaitauto.github.io/zukait-time-track-android/',retrievedAt:reply.changes[0].approvedAt.slice(0,10)});
  }
  next.version=version;return api().validate(next);
 }
 async function load(base,{read,isCurrent=()=>false}={}){
  const fallback=api().validate(base);
  if(typeof read!=='function'||!isCurrent())return {snapshot:fallback,status:'BUNDLED_ONLY'};
  try{
   const reply=await read({action:'vehicle_index_read',baseVersion:fallback.version});
   if(!isCurrent())return {snapshot:fallback,status:'BUNDLED_ONLY'};
   return {snapshot:merge(fallback,reply),status:'SERVER_CONFIRMED'};
  }catch(_){return {snapshot:fallback,status:'BUNDLED_ONLY'}}
 }
 const exported=Object.freeze({merge,load});if(typeof module!=='undefined'&&module.exports)module.exports=exported;else root.zukaitVehicleIndexLoader=exported;
})(typeof window!=='undefined'?window:globalThis);
