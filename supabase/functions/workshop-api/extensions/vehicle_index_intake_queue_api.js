// Strict Manager-only, default-off intake review and targeted recovery boundary.
const fail=(status,code)=>({status,body:{ok:false,code}});
const text=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\u0000-\u001f\u007f]/.test(v);
export async function vehicleIndexIntakeQueueApi(admin,user,body,{enabled=false,sessionHash=''}={}){
 if(!enabled)return fail(423,'vehicle_index_intake_disabled');
 if(!user?.id||!(/^[a-f0-9]{64}$/).test(sessionHash))return fail(401,'invalid_session');
 if(user.role!=='Manager')return fail(403,'manager_required');
 if(!body||Array.isArray(body))return fail(400,'invalid_request');
 let rpc,args;
 if(body.operation==='LIST'){
  if(Object.keys(body).some(k=>!['action','operation','after'].includes(k)))return fail(400,'invalid_request');
  const a=body.after;
  if(a!=null&&(!a||Array.isArray(a)||Object.keys(a).length!==2||!text(a.makeKey)||!text(a.modelKey)))return fail(400,'invalid_cursor');
  rpc='zukait_vehicle_index_intake_list';args={p_session_hash:sessionHash,p_after_make:a?.makeKey??null,p_after_model:a?.modelKey??null};
 }else if(body.operation==='RECOVER'){
  if(Object.keys(body).some(k=>!['action','operation','sourceKind','sourceId'].includes(k))||!['RECEPTION_CHECKLIST','MECHANICAL_CHECKLIST'].includes(body.sourceKind)||!text(body.sourceId)||body.sourceId.length>80)return fail(400,'invalid_source');
  rpc='zukait_vehicle_index_intake_recover';args={p_session_hash:sessionHash,p_source_kind:body.sourceKind,p_source_id:body.sourceId};
 }else return fail(400,'invalid_request');
 try{
  const {data,error}=await admin.rpc(rpc,args);
  if(error||!data)return fail(503,'intake_unavailable');
  if(data.ok!==true){const statuses={manager_required:403,invalid_cursor:400,invalid_source:400,invalid_intake:400,source_not_found:404,catalogue_not_initialized:423,intake_forbidden:403};return fail(statuses[data.code]||503,statuses[data.code]?data.code:'intake_unavailable');}
  if(body.operation==='RECOVER')return ['ALREADY_INDEXED','REVIEW_REQUIRED'].includes(data.status)?{status:200,body:{ok:true,status:data.status}}:fail(503,'intake_unavailable');
  if(!Number.isSafeInteger(data.version)||data.version<1||!Array.isArray(data.rows)||data.rows.length>50||data.rows.some(r=>!text(r.make_key)||!text(r.model_key)||!text(r.entered_make)||!text(r.entered_model)||!text(r.source_id)||!['RECEPTION_CHECKLIST','BODYSHOP_JOB_CARD','MECHANICAL_CHECKLIST','MECHANICAL_JOB_CARD'].includes(r.source_kind)))return fail(503,'intake_unavailable');
  const rows=data.rows.map(r=>({makeKey:r.make_key,modelKey:r.model_key,make:r.entered_make,model:r.entered_model,sourceKind:r.source_kind,sourceId:r.source_id,submittedAt:r.submitted_at}));const last=rows.at(-1);
  return {status:200,body:{ok:true,version:data.version,rows,next:rows.length===50?{makeKey:last.makeKey,modelKey:last.modelKey}:null}};
 }catch(_){return fail(503,'intake_unavailable')}
}
