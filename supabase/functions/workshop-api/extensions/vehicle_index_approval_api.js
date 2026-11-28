// Default-off, dedicated catalogue write route. No workshop_state access.
const fail=(status,code)=>({status,body:{ok:false,code}});
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const codes=new Map([['manager_required',403],['invalid_session',401],['catalogue_not_initialized',423],['catalogue_changed',409],['request_id_conflict',409],['name_exists',409],['unknown_target',400],['invalid_request',400]]);
export async function vehicleIndexApprovalApi(admin,user,body,{enabled=false,sessionHash=''}={}){
 if(!enabled)return fail(423,'vehicle_index_approval_disabled');
 if(!user?.id||!sessionHash||!(/^[a-f0-9]{64}$/).test(sessionHash))return fail(401,'invalid_session');
 if(user.role!=='Manager')return fail(403,'manager_required');
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['action','operation','requestId','proposal'].includes(k))||body.operation!=='APPROVE'||!id(body.requestId))return fail(400,'invalid_request');
 const p=body.proposal;
 if(!p||Array.isArray(p)||Object.keys(p).some(k=>!['kind','value','makeId','targetId','reason','expectedVersion'].includes(k))||!text(p.value,160)||!text(p.reason,500)||p.reason.trim().length<5||!Number.isSafeInteger(p.expectedVersion)||p.expectedVersion<1)return fail(400,'invalid_request');
 if(!['ADD_MAKE','ADD_MODEL','MAKE_ALIAS','MODEL_ALIAS'].includes(p.kind))return fail(400,'invalid_request');
 if(['ADD_MODEL','MODEL_ALIAS'].includes(p.kind)?!id(p.makeId):p.makeId!=null)return fail(400,'invalid_request');
 if(['MAKE_ALIAS','MODEL_ALIAS'].includes(p.kind)?!id(p.targetId):p.targetId!=null)return fail(400,'invalid_request');
 try{
  const {data,error}=await admin.rpc('zukait_vehicle_index_approve',{p_session_hash:sessionHash,p_request_id:body.requestId,p_expected_version:p.expectedVersion,p_kind:p.kind,p_value:p.value.trim(),p_make_id:p.makeId??null,p_target_id:p.targetId??null,p_reason:p.reason.trim()});
  if(error||!data||typeof data!=='object')return fail(503,'vehicle_index_unconfirmed');
  if(data.ok!==true)return fail(codes.get(data.code)||503,codes.has(data.code)?data.code:'vehicle_index_unconfirmed');
  if(data.requestId!==body.requestId||!Number.isSafeInteger(data.version)||data.version!==p.expectedVersion+1||!id(data.entryId))return fail(503,'vehicle_index_unconfirmed');
  return {status:200,body:{ok:true,requestId:data.requestId,version:data.version,entryId:data.entryId}};
 }catch(_){return fail(503,'vehicle_index_unconfirmed')}
}
