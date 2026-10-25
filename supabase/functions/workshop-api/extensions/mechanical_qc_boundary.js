// Default-off draft server boundary. Adapters are trusted, never request fields.
import {extensionCommandPreflight} from './command_contracts.js';
import {mechanicalCommandFingerprint as digest} from './mechanical_rules.js';
import {mechanicalQcEvaluation,mechanicalQcProposal} from './mechanical_qc_rules.js';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=(code,status=409)=>({status,body:{ok:false,code}});
const token=raw=>digest({domain:'zukait-mechanical-qc-work-v1',work:raw});
// approval must be the latest normalized event for this checklist, including FAIL.
// A historical PASS selected by the client must never be supplied here.
export async function mechanicalQcReadiness(records,snapshot,jobCard,policy,approval=null){
 const status=mechanicalQcEvaluation(snapshot?.data,records,jobCard,policy);
 if(!status.ok)return status;
 const workToken=await token(status.fingerprint);
 const current=approval?.workFingerprint===workToken?{...approval,fingerprint:status.fingerprint}:null;
 const evaluated=mechanicalQcEvaluation(snapshot.data,records,jobCard,policy,current);
 return {ok:true,checklistId:evaluated.checklistId,route:evaluated.route,workComplete:evaluated.workComplete,mechanicalPassed:evaluated.mechanicalPassed,mechanicalRequired:evaluated.mechanicalRequired,legacyChecksPassed:evaluated.legacyChecksPassed,deliveryReady:evaluated.deliveryReady,delivered:evaluated.delivered,workToken,recordsRevision:records.revision,workshopRevision:snapshot.revision};
}
export async function mechanicalQcCommandApi(input,server={}){
 if(server.enabled!==true||server.qcEnabled!==true||server.policy?.flags?.mechanical!==true)return fail('extension_disabled',403);
 const fields=['operation','requestId','entityId','deviceId','expectedRevision','expectedWorkshopRevision','payload'];
 if(!object(input)||Object.keys(input).some(k=>!fields.includes(k))||JSON.stringify(input).length>8192||input.operation!=='MECHANICAL_QC'||!object(input.payload)||Object.keys(input.payload).some(k=>!['result','reason','expectedFingerprint'].includes(k)))return fail('invalid_command',400);
 if(!['verifySession','readReceipt','readContext','commit'].every(k=>typeof server[k]==='function'))return fail('mechanical_adapter_unavailable',503);
 const actor=await server.verifySession();
 if(!actor||actor.id!==server.actor?.id)return fail('session_changed',401);
 const command={...clone(input),actorId:actor.id},context={actor,sessionCurrent:true,online:true};
 const access=extensionCommandPreflight(command,context,server.policy);if(!access.ok)return fail(access.code,403);
 if(actor.id!=='SUP003'||!['Supervisor','Mechanical Supervisor'].includes(actor.role))return fail('mechanical_qc_approver_required',403);
 if(!Number.isSafeInteger(input.expectedWorkshopRevision)||input.expectedWorkshopRevision<0)return fail('invalid_revision',400);
 if(!/^[0-9a-f]{64}$/.test(input.payload.expectedFingerprint||'')||!['PASS','FAIL'].includes(input.payload.result)||typeof input.payload.reason!=='string'||input.payload.reason.length>500||(input.payload.result==='FAIL'&&!input.payload.reason.trim()))return fail('invalid_mechanical_qc',400);
 const fingerprint=await digest(command),prior=await server.readReceipt(command.requestId);
 if(prior){
  if(prior.actorId!==actor.id||prior.fingerprint!==fingerprint||prior.result?.operation!=='MECHANICAL_QC'||prior.result?.entityId!==command.entityId)return fail('mechanical_request_reused');
  // Receipt acknowledges history only; it never authorizes delivery now.
  return {status:200,body:{ok:true,duplicate:true,requestId:command.requestId,requiresReadinessRefresh:true}};
 }
 const {records,snapshot}=await server.readContext(command);
 const checklist=records?.checklists?.find(c=>c.id===command.entityId);
 if(!checklist)return fail('mechanical_checklist_required');
 const status=mechanicalQcEvaluation(snapshot?.data,records,checklist.manualJobCard?.number,server.policy);
 if(!status.ok)return fail(status.code);
 if(await token(status.fingerprint)!==command.payload.expectedFingerprint)return fail('mechanical_qc_work_changed');
 // The pure model uses its internal token; it must not escape this boundary.
 const internal=clone(command);internal.payload.expectedFingerprint=status.fingerprint;
 const proposal=await mechanicalQcProposal(records,snapshot,internal,context,server.policy,server.now?.()??Date.now());
 if(!proposal.ok)return fail(proposal.code);
 const plan={p_actor:actor.id,p_request:command.requestId,p_fingerprint:fingerprint,p_expected_records:records.revision,p_expected_workshop:snapshot.revision,p_entity:command.entityId,p_device:command.deviceId,p_plan:{result:proposal.event.result,reason:proposal.event.reason,route:proposal.event.route,workFingerprint:command.payload.expectedFingerprint}};
 const current=await server.verifySession();if(!current||current.active!==true||current.id!==actor.id||current.role!==actor.role)return fail('session_changed',401);
 const committed=await server.commit(plan);
 if(committed?.ok!==true||committed.requestId!==command.requestId)throw new Error('invalid_mechanical_qc_commit');
 // Never echo adapter state, raw event tokens, sessions, or stale readiness.
 return {status:200,body:{ok:true,requestId:command.requestId,requiresReadinessRefresh:true}};
}
