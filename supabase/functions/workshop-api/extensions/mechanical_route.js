import {mechanicalSignatureCommand} from './mechanical_signature.js';
import {mechanicalDocument} from './mechanical_document.js';
import {mechanicalCommandApi} from './mechanical_api.js';
import {mechanicalQcCommandApi,mechanicalQcReadiness} from './mechanical_qc_boundary.js';
import {mechanicalDeliveryCommandApi} from './mechanical_delivery_api.js';
import {mechanicalTrackingApi} from './mechanical_tracking.js';
import {mechanicalQcOverview} from './mechanical_qc_overview.js';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const response=(code,status)=>({status,body:{ok:false,code}});
const conflicts=new Set(['mechanical_request_reused','mechanical_revision_conflict','workshop_revision_conflict','mc_allocation_conflict','manual_jc_duplicate','assignment_id_exists','duplicate_task_employee','handover_source_changed','handover_source_inactive','stop_work_before_handover','handover_time_review_required','handover_history_protected']);
export function mechanicalApiError(error){
 const code=String(error?.message||'');
 if(code==='mechanical_invalid_session')return response('invalid_session',401);
 if(['mechanical_disabled','mechanical_forbidden','mechanical_qc_disabled','mechanical_qc_approver_required','mechanical_delivery_disabled','mechanical_tracking_disabled','mechanical_repeat_disabled','mechanical_documents_disabled','mechanical_document_forbidden','mechanical_signatures_disabled','mechanical_signature_forbidden'].includes(code))return response(code,403);
 if(conflicts.has(code))return response(code,409);
 if(['invalid_mechanical_command','mechanical_operation_not_implemented','invalid_mechanical_delivery','invalid_document_request','invalid_mechanical_signature'].includes(code))return response(code,400);
 if(['mechanical_context_limit','mechanical_dashboard_limit','mechanical_overview_limit','mechanical_checklist_missing','mechanical_mixed_qc_policy_required','mechanical_mixed_qc_not_required','mechanical_qc_policy_required','mechanical_delivery_not_ready','mechanical_qc_scope_review','job_inactive','checklist_inactive','tracking_priority_policy_required','tracking_hold_policy_required','tracking_no_change','invalid_tracking_change','invalid_promise_date','invalid_repeat','invalid_repeat_employee','repeat_work_not_finished','repeat_source_inactive','repeat_cycle_review_required','mechanical_document_changed','mechanical_document_limit','mechanical_document_scope_review','mechanical_signature_request_reused','mechanical_signature_already_recorded'].includes(code))return response(code,409);
 return response('mechanical_unavailable',503);
}
export async function mechanicalRoute(admin,user,body,options={}){
 // Normal routes never call this adapter; even a direct Mechanical request
 // performs zero extra database reads when the trusted environment flag is off.
 if(options.enabled!==true)return response('extension_disabled',403);
 const delivery=body?.action==='mechanical_delivery_probe'||body?.action==='mechanical_delivery_preview'||(body?.action==='mechanical_command'&&body.command?.operation==='MECHANICAL_DELIVER');
 if(delivery){
  if(options.qcEnabled!==true||options.deliveryEnabled!==true)return response('extension_disabled',403);
  if(user?.active===false||!['Supervisor','Receptionist'].includes(user?.role))return response('mechanical_forbidden',403);
  if(!/^[0-9a-f]{64}$/.test(options.sessionHash||''))return response('invalid_session',401);
  try{
   if(body.action==='mechanical_delivery_probe'){
    if(Object.keys(body).some(k=>!['action','jobCard'].includes(k))||typeof body.jobCard!=='string'||!body.jobCard.trim()||body.jobCard.length>80)return response('invalid_command',400);
    const {data,error}=await admin.rpc('zukait_mechanical_delivery_lookup',{p_actor:user.id,p_session_hash:options.sessionHash,p_job_card:body.jobCard});if(error)throw error;return {status:200,body:data};
   }
   const read=async(kind,entity=null,request=null)=>{const {data,error}=await admin.rpc('zukait_mechanical_delivery_read',{p_actor:user.id,p_session_hash:options.sessionHash,p_kind:kind,p_entity:entity,p_request:request});if(error)throw error;return data};
   if(body.action==='mechanical_delivery_preview'){
    if(Object.keys(body).some(k=>!['action','checklistId'].includes(k))||!uuid(body.checklistId))return response('invalid_command',400);
    const data=await read('context',body.checklistId),checklist=data.records.checklists.find(c=>c.id===body.checklistId);if(!checklist)return response('mechanical_checklist_missing',409);
    const status=await mechanicalQcReadiness(data.records,data.snapshot,checklist.manualJobCard.number,data.policy,data.approval);
    const job=data.snapshot.data.jobs[0];return status.ok?{status:200,body:{ok:true,status,vehicle:{jobCard:job.no,description:job.vehicle||'',registration:job.reg||''}}}:response(status.code,409);
   }
   if(Object.keys(body).some(k=>!['action','command'].includes(k))||!uuid(body.command?.entityId)||!uuid(body.command?.requestId)||JSON.stringify(body).length>9000||typeof options.verifySession!=='function')return response('invalid_command',400);
   return await mechanicalDeliveryCommandApi(body.command,{enabled:true,deliveryEnabled:true,actor:{...user,active:true},policy:await read('policy'),verifySession:async()=>{const current=await options.verifySession();return current&&current.active!==false?{...current,active:true}:null},readReceipt:id=>read('receipt',null,id),readContext:cmd=>read('context',cmd.entityId),commit:async plan=>{const {data,error}=await admin.rpc('zukait_mechanical_deliver',{...plan,p_session_hash:options.sessionHash});if(error)throw error;return data}});
  }catch(error){return mechanicalApiError(error)}
 }
 if(user?.active===false||!['Manager','Supervisor'].includes(user?.role))return response('mechanical_forbidden',403);
 if(['mechanical_signature_command','mechanical_signature_status'].includes(body?.action)){
  if(options.documentsEnabled!==true||options.signaturesEnabled!==true)return response('extension_disabled',403);
  if(user?.id!=='SUP003'||user.role!=='Supervisor')return response('mechanical_signature_forbidden',403);
  if(!/^[0-9a-f]{64}$/.test(options.sessionHash||'')||typeof options.verifySession!=='function')return response('invalid_session',401);
  const input=body.command||body,read=async(kind,request=null)=>{const {data,error}=await admin.rpc('zukait_mechanical_signature_read',{p_actor:user.id,p_session_hash:options.sessionHash,p_kind:kind,p_request:request,p_entity:input.checklistId??null,p_records:input.expectedRevision??null,p_workshop:input.expectedWorkshopRevision??null});if(error)throw error;return data};
  try{
   if(body.action==='mechanical_signature_status'){
    if(Object.keys(body).some(k=>!['action','checklistId','expectedRevision','expectedWorkshopRevision'].includes(k))||!uuid(body.checklistId)||![body.expectedRevision,body.expectedWorkshopRevision].every(n=>Number.isSafeInteger(n)&&n>=0))return response('invalid_mechanical_signature',400);
    return {status:200,body:{ok:true,signature:await read('current')}};
   }
   if(Object.keys(body).some(k=>!['action','command'].includes(k))||!body.command||!uuid(body.command.requestId)||!uuid(body.command.checklistId)||![body.command.expectedRevision,body.command.expectedWorkshopRevision].every(n=>Number.isSafeInteger(n)&&n>=0)||JSON.stringify(body).length>50000)return response('invalid_mechanical_signature',400);
   const result=await mechanicalSignatureCommand(body.command,{enabled:true,signaturesEnabled:true,policy:await read('policy'),verifySession:async()=>{const current=await options.verifySession();return current&&current.active!==false?{...current,active:true}:null},readReceipt:id=>read('receipt',id),readDocument:async cmd=>(await mechanicalRoute(admin,user,{action:'mechanical_document',checklistId:cmd.checklistId,expectedRevision:cmd.expectedRevision,expectedWorkshopRevision:cmd.expectedWorkshopRevision},options)).body,commit:async p=>{const {data,error}=await admin.rpc('zukait_mechanical_signature_commit',{p_actor:p.actorId,p_session_hash:options.sessionHash,p_request:p.requestId,p_entity:p.checklistId,p_records:p.recordsRevision,p_workshop:p.workshopRevision,p_device:p.deviceId,p_source_hash:p.sourceHash,p_fingerprint:p.fingerprint,p_strokes:p.strokes});if(error)throw error;return data}});
   return result.ok?{status:200,body:result}:response(result.code,result.code.includes('forbidden')?403:result.code==='invalid_mechanical_signature'?400:409);
  }catch(error){return mechanicalApiError(error)}
 }
 if(['mechanical_document','mechanical_document_verify'].includes(body?.action)){
  if(options.documentsEnabled!==true)return response('extension_disabled',403);
  if(!/^[0-9a-f]{64}$/.test(options.sessionHash||'')||typeof options.verifySession!=='function')return response('invalid_session',401);
  if(Object.keys(body).some(k=>!['action','checklistId','expectedRevision','expectedWorkshopRevision'].includes(k))||!uuid(body.checklistId)||![body.expectedRevision,body.expectedWorkshopRevision].every(n=>Number.isSafeInteger(n)&&n>=0))return response('invalid_document_request',400);
  const read=async kind=>{const {data,error}=await admin.rpc('zukait_mechanical_document_read',{p_actor:user.id,p_session_hash:options.sessionHash,p_kind:kind,p_entity:body.checklistId,p_expected_records:body.expectedRevision,p_expected_workshop:body.expectedWorkshopRevision});if(error)throw error;return data};
  try{
   if(body.action==='mechanical_document_verify')return {status:200,body:await read('verify')};
   const input={checklistId:body.checklistId,expectedRevision:body.expectedRevision,expectedWorkshopRevision:body.expectedWorkshopRevision};
   const result=await mechanicalDocument(input,{enabled:true,policy:await read('policy'),actor:{...user,active:true},verifySession:async()=>{const current=await options.verifySession();return current&&current.active!==false?{...current,active:true}:null},readContext:()=>read('context'),verifyCurrent:async()=>{const r=await read('verify');return r?.ok===true&&r.checklistId===body.checklistId&&r.recordsRevision===body.expectedRevision&&r.workshopRevision===body.expectedWorkshopRevision}});
   return result.ok?{status:200,body:{...result,checklistId:body.checklistId}}:response(result.code,result.code.includes('forbidden')?403:409);
  }catch(error){return mechanicalApiError(error)}
 }
 if(['mechanical_tracking_view','mechanical_tracking_command'].includes(body?.action)){
  if(options.trackingEnabled!==true)return response('extension_disabled',403);
  if(!/^[0-9a-f]{64}$/.test(options.sessionHash||'')||typeof options.verifySession!=='function')return response('invalid_session',401);
  const command=body.command,read=async(kind,entity=null,request=null)=>{const {data,error}=await admin.rpc('zukait_mechanical_tracking_read',{p_actor:user.id,p_session_hash:options.sessionHash,p_kind:kind,p_operation:body.action==='mechanical_tracking_command'?command?.operation:null,p_entity:entity,p_request:request});if(error)throw error;return data};
  try{
   if(body.action==='mechanical_tracking_view'){
    if(Object.keys(body).some(k=>!['action','checklistId'].includes(k))||!uuid(body.checklistId))return response('invalid_command',400);
    return {status:200,body:await read('view',body.checklistId)};
   }
   if(Object.keys(body).some(k=>!['action','command'].includes(k))||!uuid(command?.entityId)||JSON.stringify(body).length>5000)return response('invalid_command',400);
   return await mechanicalTrackingApi(command,{enabled:true,trackingEnabled:true,actor:user,policy:await read('policy'),verifySession:async()=>{const current=await options.verifySession();return current&&current.active!==false?{...current,active:true}:null},readReceipt:id=>read('receipt',null,id),readContext:id=>read('context',id),commit:async plan=>{const {data,error}=await admin.rpc('zukait_mechanical_tracking_commit',{...plan,p_session_hash:options.sessionHash});if(error)throw error;return data}});
  }catch(error){return mechanicalApiError(error)}
 }
 if(body?.action==='mechanical_qc_overview'){
  if(options.qcEnabled!==true)return response('extension_disabled',403);
  if(Object.keys(body).some(k=>k!=='action'))return response('invalid_command',400);
  if(!/^[0-9a-f]{64}$/.test(options.sessionHash||''))return response('invalid_session',401);
  try{const {data,error}=await admin.rpc('zukait_mechanical_qc_overview_read',{p_actor:user.id,p_session_hash:options.sessionHash});if(error)throw error;const result=await mechanicalQcOverview(data);return {status:result.ok?200:409,body:result}}catch(error){return mechanicalApiError(error)}
 }
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
  try{const {data,error}=await admin.rpc('zukait_mechanical_dashboard',{p_actor:user.id,p_session_hash:options.sessionHash,p_after:body.after??0,p_checklist:body.checklistId??null});if(error)throw error;return {status:200,body:{...data,qcAvailable:data?.qcAvailable===true&&options.qcEnabled===true,signaturesAvailable:data?.signaturesAvailable===true&&options.documentsEnabled===true&&options.signaturesEnabled===true,documentsAvailable:data?.documentsAvailable===true&&options.documentsEnabled===true,deliveryAvailable:data?.deliveryAvailable===true&&options.qcEnabled===true&&options.deliveryEnabled===true}}}catch(error){return mechanicalApiError(error)}
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
// Older delivery actions must obtain a new explicit Mechanical review; never
// reinterpret financial fields or mint an unreviewed protected command.
export async function mechanicalLegacyDeliveryCheck(admin,user,body,options={}){
 if(options.enabled!==true||options.qcEnabled!==true||options.deliveryEnabled!==true)return null;
 if(!['Supervisor','Receptionist'].includes(user?.role))return null;
 if(!['qc_delivery','receptionist_deliver'].includes(body?.action)||body.operation!=='DELIVER')return null;
 const result=await mechanicalRoute(admin,user,{action:'mechanical_delivery_probe',jobCard:body.jobCard},options);
 if(result.status!==200)return result;
 return result.body?.registered?response('mechanical_delivery_review_required',409):null;
}
