/* Isolated, read-only Manager proposal preview. No authority to approve or persist. */
(function(root){
 'use strict';
 const key=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
 const clean=(v,n=160)=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
 const fail=code=>({ok:false,code});
 function preview(snapshot,request,actor){
  if(actor?.role!=='Manager')return fail('manager_required');
  const api=typeof module!=='undefined'&&module.exports?require('./vehicle_index.js'):root.zukaitVehicleIndex;
  let data;
  try{data=api.validate(snapshot)}catch(_){return fail('catalogue_invalid')}
  if(!request||Object.keys(request).some(k=>!['kind','value','makeId','targetId','reason','expectedVersion'].includes(k)))return fail('invalid_request');
  const {kind,value,makeId,targetId,reason,expectedVersion}=request;
  if(expectedVersion!==data.version)return fail('catalogue_changed');
  if(!clean(value)||!clean(reason,500)||reason.trim().length<5)return fail('reason_or_value_required');
  const name=value.trim();
  const make=data.makes.find(m=>m.id===makeId);
  const model=data.models.find(m=>m.id===targetId);
  const mk=data.makes.find(m=>m.id===targetId);
  const aliases=(type,scope)=>data.aliases.filter(a=>a.kind===type&&(type==='make'||data.models.some(m=>m.id===a.targetId&&m.makeId===scope)));
  function exists(rows,aliasRows){return rows.some(r=>key(r.name)===key(name))||aliasRows.some(a=>key(a.value)===key(name))}
  let target=null,scope=null;
  if(kind==='ADD_MAKE'){
   if(makeId||targetId)return fail('unexpected_target');
   if(exists(data.makes,aliases('make')))return fail('make_exists');
  }else if(kind==='ADD_MODEL'){
   if(targetId||!make)return fail('unknown_make');
   scope=make.id;
   if(exists(data.models.filter(m=>m.makeId===scope),aliases('model',scope)))return fail('model_exists');
  }else if(kind==='MAKE_ALIAS'){
   if(makeId||!mk)return fail('unknown_target');
   target=mk;
   if(exists(data.makes,aliases('make')))return fail('name_or_alias_exists');
  }else if(kind==='MODEL_ALIAS'){
   if(!make||!model||model.makeId!==make.id)return fail('wrong_make_or_target');
   target=model;scope=make.id;
   if(exists(data.models.filter(m=>m.makeId===scope),aliases('model',scope)))return fail('name_or_alias_exists');
  }else return fail('unknown_operation');
  return Object.freeze({ok:true,status:'PREVIEW_ONLY',version:data.version,kind,value:name,makeId:scope,targetId:target?.id||null,targetName:target?.name||null,reason:reason.trim(),historicalRecordsChanged:0});
 }
 const api=Object.freeze({preview});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.zukaitVehicleIndexReview=api;
})(typeof window!=='undefined'?window:globalThis);
