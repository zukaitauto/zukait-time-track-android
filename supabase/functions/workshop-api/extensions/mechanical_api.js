// Default-off server boundary candidate; routed only in the undeployed draft.
// All dependencies/policy/session checks are server-owned, never request fields.
import {extensionCommandPreflight,checklistNumberFromAllocatedSequence} from './command_contracts.js';
import {mechanicalCommandFingerprint,mechanicalTransition} from './mechanical_rules.js';
import {mechanicalPersistenceRequest} from './mechanical_persistence_plan.js';
import {allocationToken,employeeTimeToken} from '../time_management_rules.js';
const fields=['operation','requestId','entityId','deviceId','expectedRevision','expectedWorkshopRevision','payload'];
const payloadFields={TASK_REPEAT:['sourceAssignmentId','employeeId','mistakeEmployeeId','assignmentId','suggestedMinutes','reason'],MC_CREATE:['manualJobCard'],TASK_CREATE:['checklistId','title'],TASK_ASSIGN:['employeeId','assignmentId','suggestedMinutes'],TASK_HANDOVER:['sourceAssignmentId','targetEmployeeId','successorAssignmentId','suggestedMinutes','reason']};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const response=(code,status=400)=>({status,body:{ok:false,code}});
const clone=x=>JSON.parse(JSON.stringify(x));
export async function mechanicalCommandApi(input,server={}){
 if(server.enabled!==true||server.policy?.flags?.mechanical!==true)return response('extension_disabled',403);
 if(!object(input)||Object.keys(input).some(k=>!fields.includes(k))||JSON.stringify(input).length>8192)return response('invalid_command');
 if(typeof server.verifySession!=='function')return response('invalid_session',401);
 const actor=await server.verifySession();
 if(!actor||actor.active!==true||actor.id!==server.actor?.id)return response('session_changed',401);
 const clientCommand={...clone(input),actorId:actor.id};
 const access=extensionCommandPreflight(clientCommand,{actor,sessionCurrent:true,online:true},server.policy);
 if(!access.ok)return response(access.code,403);
 const allowed=payloadFields[input.operation];
 if(!allowed)return response('mechanical_operation_not_implemented');
 if(!object(input.payload)||Object.keys(input.payload).some(k=>!allowed.includes(k)))return response('invalid_command');
 if(!Number.isSafeInteger(input.expectedWorkshopRevision)||input.expectedWorkshopRevision<0)return response('invalid_revision');
 if(!['readReceipt','readContext','commit'].every(k=>typeof server[k]==='function'))return response('mechanical_adapter_unavailable',503);
 // Hash the stable client command before enriching it with current time tokens.
 // A lost acknowledgement must be recoverable without rebuilding old history.
 const fingerprint=await mechanicalCommandFingerprint(clientCommand);
 const prior=await server.readReceipt(input.requestId);
 if(prior){
  if(prior.actorId!==actor.id||prior.fingerprint!==fingerprint)return response('request_reused',409);
  return {status:200,body:{ok:true,duplicate:true,result:clone(prior.result)}};
 }
 const {records,snapshot,nextSequence}=await server.readContext(clientCommand);
 const command=clone(clientCommand),context={actor,sessionCurrent:true,online:true,commandFingerprint:fingerprint};
 if(command.operation==='MC_CREATE'){
  let number;try{number=checklistNumberFromAllocatedSequence(nextSequence,server.policy.mcNumbering)}catch{return response('mc_allocation_conflict',409)}
  context.allocationVerified=true;context.allocatedChecklist={requestId:command.requestId,id:command.entityId,sequence:nextSequence,number};
 }
 if(command.operation==='TASK_HANDOVER'){
  const source=snapshot?.data?.assign?.find(a=>a?.id===command.payload.sourceAssignmentId);
  if(!source)return response('handover_source_inactive',409);
  context.timeSnapshotConfirmed=true;
  command.payload.expectedSource=allocationToken(source);
  command.payload.expectedEmployeeSessions=employeeTimeToken(snapshot.data,source.emp);
 }
 const transition=mechanicalTransition(records,snapshot,command,context,server.policy,server.now?.()??Date.now());
 if(!transition.ok)return response(transition.code,409);
 const plan=await mechanicalPersistenceRequest(records,snapshot,command,transition,clientCommand);
 // The SQL adapter additionally binds/checks this session under row locks.
 const current=await server.verifySession();
 if(!current||current.active!==true||current.id!==actor.id||current.role!==actor.role)return response('session_changed',401);
 const result=await server.commit(plan);
 return {status:200,body:{ok:true,result:clone(result)}};
}
