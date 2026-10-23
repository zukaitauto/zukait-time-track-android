import {mechanicalCommandApi} from './mechanical_api.js';
import {mechanicalQcCommandApi,mechanicalQcReadiness} from './mechanical_qc_boundary.js';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const response=(code,status)=>({status,body:{ok:false,code}});
const conflicts=new Set(['mechanical_request_reused','mechanical_revision_conflict','workshop_revision_conflict','mc_allocation_conflict','manual_jc_duplicate','assignment_id_exists','duplicate_task_employee','handover_source_changed','handover_source_inactive','stop_work_before_handover','handover_time_review_required','handover_history_protected']);
export function mechanicalApiError(error){
 const code=String(error?.message||'');
 if(code==='mechanical_invalid_session')return response('invalid_session',401);
 if(['mechanical_disabled','mechanical_forbidden','mechanical_qc_disabled','mechanical_qc_approver_required'].includes(code))return response(code,403);
 if(conflicts.has(code))return response(code,409);
 if(['invalid_mechanical_command','mechanical_operation_not_implemented'].includes(code))return response(code,400);
 if(['mechanical_context_limit','mechanical_dashboard_limit','mechanical_checklist_missing','mechanical_mixed_qc_policy_required','mechanical_mixed_qc_not_required','mechanical_qc_policy_required'].includes(code))return response(code,409);
 return response('mechanical_unavailable',503);
}
export async function mechanicalRoute(admin,user,body,options={}){
 // Normal routes never call this adapter; even a direct Mechanical request
 // performs zero extra database reads when the trusted environment flag is off.
 if(options.enabled!==true)return response('extension_disabled',403);
 if(user?.active===false||!['Manager','Supervisor'].includes(user?.role))return response('mechanical_forbidden',403);
 if(body?.action==='mechanical_qc_readiness'){
  if(options.qcEnabled!==true)return response('extension_disabled',403);
  if(Object.keys(body).some(k=>!['action','checklistId'].includes(k))||!uuid(body.checklistId))return response('invalid_command',400);
  if(!/^[0-9a-f]{64}$/.test(options.sessionHash||''))return response('invalid_session',401);
  try{
   const {data,error}=await admin.rpc('zukait_mechanical_qc_read',{p_actor:user.id,p_session_hash:options.sessionHash,p_kind:'context',p_entity:body.checklistId,p_request:null});if(error)throw error;
   const checklist=data?.records?.checklists?.find(c=>c.id===body.checklistId);if(!checklist)return response('mechanical_checklist_missing',409);
   const status=await mechanicalQcReadiness(data.records,data.snapshot,checklist.manualJobCard.number,data.policy,data.approval);
   return status.ok?{status:200,body:{ok:true,status}}:response(status.code,409);
  }catch(error){return mechanicalApiError(error)}
 }
 if(body?.action==='mechanical_dashboard'){
  if(Object.keys(body).some(k=>!['action','after','checklistId'].includes(k))||!Number.isSafeInteger(body.after??0)||(body.after??0)<0||(body.checklistId!=null&&!uuid(body.checklistId)))return response('invalid_command',400);
  if(!/^[0-9a-f]{64}$/.test(options.sessionHash||''))return response('invalid_session',401);
  try{const {data,error}=await admin.rpc('zukait_mechanical_dashboard',{p_actor:user.id,p_session_hash:options.sessionHash,p_after:body.after??0,p_checklist:body.checklistId??null});if(error)throw error;return {status:200,body:{...data,qcAvailable:data?.qcAvailable===true&&options.qcEnabled===true}}}catch(error){return mechanicalApiError(error)}
 }
 if(!body||body.action!=='mechanical_command'||Object.keys(body).some(k=>!['action','command'].includes(k))||!body.command||!uuid(body.command.entityId)||!uuid(body.command.requestId)||JSON.stringify(body).length>9000)return response('invalid_command',400);
 if(!/^[0-9a-f]{64}$/.test(options.sessionHash||'')||typeof options.verifySession!=='function')return response('invalid_session',401);
 const actor={...user,active:true},command=body.command;
 if(command.operation==='MECHANICAL_QC'){
  if(options.qcEnabled!==true)return response('extension_disabled',403);
  const qcRead=async(kind,cmd=command)=>{const {data,error}=await admin.rpc('zukait_mechanical_qc_read',{p_actor:actor.id,p_session_hash:options.sessionHash,p_kind:kind,p_entity:kind==='context'?cmd.entityId:null,p_request:kind==='receipt'?command.requestId:null});if(error)throw error;return data};
  try{return await mechanicalQcCommandApi(command,{enabled:true,qcEnabled:true,actor,policy:await qcRead('policy'),verifySession:async()=>{const current=await options.verifySession();return current&&current.active!==false?{...current,active:true}:null},readReceipt:()=>qcRead('receipt'),readContext:cmd=>qcRead('context',cmd),commit:async plan=>{const {data,error}=await admin.rpc('zukait_mechanical_qc_commit',{...plan,p_session_hash:options.sessionHash});if(error)throw error;return data}})}catch(error){return mechanicalApiError(error)}
 }
 const read=async(kind,cmd=command)=>{
  const {data,error}=await admin.rpc('zukait_mechanical_read',{p_actor:actor.id,p_session_hash:options.sessionHash,p_operation:command.operation,p_kind:kind,p_request:kind==='receipt'?command.requestId:null,p_entity:kind==='context'?cmd.entityId:null,p_payload:kind==='context'?cmd.payload:{}});
  if(error)throw error;return data;
 };
 try{
  const policy=await read('policy');
  return await mechanicalCommandApi(command,{enabled:true,actor,policy,
   verifySession:async()=>{const current=await options.verifySession();return current&&current.active!==false?{...current,active:true}:null},
   readReceipt:()=>read('receipt'),readContext:cmd=>read('context',cmd),
   commit:async plan=>{const {data,error}=await admin.rpc('zukait_mechanical_commit',{...plan,p_session_hash:options.sessionHash});if(error)throw error;return data;}
  });
 }catch(error){return mechanicalApiError(error)}
}
