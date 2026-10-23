// Default-off server planner. Latest approval/context come from trusted SQL.
import {extensionCommandPreflight} from './command_contracts.js';
import {mechanicalCommandFingerprint} from './mechanical_rules.js';
import {mechanicalQcReadiness} from './mechanical_qc_boundary.js';
const fail=code=>({ok:false,code});
export async function mechanicalDeliveryRequest(records,snapshot,command,context,policy,approval=null){
 const access=extensionCommandPreflight(command,context,policy);if(!access.ok)return access;
 if(command.operation!=='MECHANICAL_DELIVER')return fail('mechanical_delivery_operation_required');
 if(policy.mechanicalDeliveryEnabled!==true)return fail('mechanical_delivery_disabled');
 if(context.online!==true)return fail('mechanical_delivery_requires_online');
 if(Object.keys(command).some(k=>!['operation','requestId','entityId','actorId','deviceId','expectedRevision','expectedWorkshopRevision','payload'].includes(k))||Object.keys(command.payload).some(k=>k!=='expectedFingerprint')||!/^[0-9a-f]{64}$/.test(command.payload.expectedFingerprint||''))return fail('invalid_mechanical_delivery');
 if(!Number.isSafeInteger(snapshot?.revision)||snapshot.revision<0||!Number.isSafeInteger(records?.revision)||records.revision<0||!Number.isSafeInteger(command.expectedWorkshopRevision)||command.expectedWorkshopRevision<0)return fail('invalid_revision');
 if(command.expectedRevision!==records.revision)return fail('mechanical_revision_conflict');
 if(command.expectedWorkshopRevision!==snapshot.revision)return fail('workshop_revision_conflict');
 const checklist=records.checklists?.find(c=>c.id===command.entityId);if(!checklist)return fail('mechanical_checklist_required');
 const job=snapshot.data?.jobs?.find(j=>String(j?.no).trim().toUpperCase()===String(checklist.manualJobCard.number).trim().toUpperCase());
 if(context.actor.role==='Receptionist'&&!job?.receptionNo)return fail('qc_permission_denied');
 const status=await mechanicalQcReadiness(records,snapshot,checklist.manualJobCard.number,policy,approval);
 if(!status.ok)return status;if(status.delivered)return fail('already_delivered');
 if(command.payload.expectedFingerprint!==status.workToken)return fail('mechanical_qc_work_changed');
 if(!status.deliveryReady)return fail('mechanical_delivery_not_ready');
 if(status.mechanicalRequired&&!approval?.requestId)return fail('mechanical_qc_evidence_required');
 return {ok:true,request:{p_actor:context.actor.id,p_request:command.requestId,p_fingerprint:await mechanicalCommandFingerprint(command),p_expected_records:records.revision,p_expected_workshop:snapshot.revision,p_entity:command.entityId,p_device:command.deviceId,p_plan:{route:status.route,workFingerprint:status.workToken,qcRequestId:status.mechanicalRequired?approval.requestId:null}}};
}
