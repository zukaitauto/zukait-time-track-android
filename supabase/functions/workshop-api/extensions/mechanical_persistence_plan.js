// Server-only adapter; not routed. It emits a bounded delta, never the full workshop state.
import {mechanicalCommandFingerprint} from './mechanical_rules.js';
export async function mechanicalPersistenceRequest(records,snapshot,command,transition,clientCommand=command){
 if(!transition?.ok||transition.duplicate||!transition.records||!transition.workshopData)throw new Error('fresh_transition_required');
 const receipt=transition.records.receipts.find(r=>r.requestId===command.requestId);
 // Only server-derived handover tokens may differ from the stable input digest.
 const stable=JSON.parse(JSON.stringify(command));
 if(clientCommand!==command&&command.operation==='TASK_HANDOVER'){
  delete stable.payload.expectedSource;delete stable.payload.expectedEmployeeSessions;
 }
 if(await mechanicalCommandFingerprint(stable)!==await mechanicalCommandFingerprint(clientCommand))throw new Error('client_command_mismatch');
 if(!receipt||receipt.fingerprint!==await mechanicalCommandFingerprint(clientCommand)||receipt.actorId!==command.actorId||transition.records.revision!==records.revision+1)throw new Error('invalid_transition_receipt');
 let plan;
 if(command.operation==='MC_CREATE')plan={record:transition.records.checklists.find(c=>c.id===command.entityId)};
 else if(command.operation==='TASK_CREATE')plan={record:transition.records.tasks.find(t=>t.id===command.entityId)};
 else if(['TASK_ASSIGN','TASK_HANDOVER'].includes(command.operation)){
  const assignment=transition.workshopData.assign.find(a=>a.id===transition.result.assignmentId);
  plan={assignment};
  if(command.operation==='TASK_HANDOVER'){
   const sourceBefore=snapshot.data.assign.find(a=>a.id===command.payload.sourceAssignmentId);
   const sourceAfter=transition.workshopData.assign.find(a=>a.id===sourceBefore?.id);
   plan={...plan,sourceBefore,sourceAfter,reason:command.payload.reason};
  }
 }else throw new Error('mechanical_operation_not_implemented');
 if(!plan.record&&!plan.assignment)throw new Error('missing_transition_delta');
 return {p_actor:command.actorId,p_request:command.requestId,p_fingerprint:receipt.fingerprint,p_expected_records:records.revision,p_expected_workshop:snapshot.revision,p_operation:command.operation,p_entity:command.entityId,p_device:command.deviceId,p_plan:JSON.parse(JSON.stringify(plan))};
}
