// Draft checklist metadata only; it never changes work, QC, money or timers.
import {extensionCommandPreflight} from './command_contracts.js';
import {mechanicalCommandFingerprint} from './mechanical_rules.js';
export const TRACKING_OPERATIONS=Object.freeze(['PRIORITY_SET','PROMISE_SET','HOLD_SET']);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),fields=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
export function trackingChange(current,input,policy){
 const p=input.payload,reason=p?.reason;
 if(!TRACKING_OPERATIONS.includes(input.operation)||!object(p)||typeof reason!=='string'||!reason.trim()||reason.length>500)return {ok:false,code:'invalid_tracking_change'};
 const next={priority:current?.priority??null,promiseDate:current?.promiseDate??null,waitingForParts:current?.waitingForParts===true};let field,value;
 if(input.operation==='PRIORITY_SET'){
  field='priority';value=p.priority;
  if(!fields(p,['priority','reason'])||(value!==null&&(typeof value!=='string'||value.length>40||!Array.isArray(policy.priorityValues)||!policy.priorityValues.includes(value))))return {ok:false,code:'tracking_priority_policy_required'};
 }else if(input.operation==='PROMISE_SET'){
  field='promiseDate';value=p.date;
  if(!fields(p,['date','reason'])||(value!==null&&(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)))return {ok:false,code:'invalid_promise_date'};
 }else{
  field='waitingForParts';value=p.waiting;
  if(policy.holdMode!=='STATUS_ONLY')return {ok:false,code:'tracking_hold_policy_required'};
  if(!fields(p,['waiting','reason'])||typeof value!=='boolean')return {ok:false,code:'invalid_tracking_change'};
 }
 if(next[field]===value)return {ok:false,code:'tracking_no_change'};
 next[field]=value;return {ok:true,before:{priority:current?.priority??null,promiseDate:current?.promiseDate??null,waitingForParts:current?.waitingForParts===true},after:next,reason:reason.trim()};
}
export async function mechanicalTrackingApi(input,server){
 const fail=(code,status=409)=>({status,body:{ok:false,code}});
 if(server.enabled!==true||server.trackingEnabled!==true||server.policy?.trackingEnabled!==true)return fail('extension_disabled',403);
 if(!fields(input,['operation','requestId','entityId','deviceId','expectedRevision','expectedWorkshopRevision','payload'])||JSON.stringify(input).length>4096||!TRACKING_OPERATIONS.includes(input.operation)||!/^[0-9a-f-]{36}$/i.test(input.entityId||'')||!Number.isSafeInteger(input.expectedWorkshopRevision)||input.expectedWorkshopRevision<0)return fail('invalid_command',400);
 const actor=await server.verifySession();if(!actor||actor.id!==server.actor.id||actor.role!==server.actor.role||actor.active!==true)return fail('session_changed',401);
 const command={...input,actorId:actor.id},access=extensionCommandPreflight(command,{actor,sessionCurrent:true},server.policy);if(!access.ok)return fail(access.code,403);
 const fingerprint=await mechanicalCommandFingerprint(command),prior=await server.readReceipt(input.requestId);
 if(prior){if(prior.actorId!==actor.id||prior.fingerprint!==fingerprint||prior.result?.operation!==input.operation||prior.result?.entityId!==input.entityId)return fail('mechanical_request_reused');return {status:200,body:{ok:true,duplicate:true,requestId:input.requestId,requiresRefresh:true}}}
 const context=await server.readContext(input.entityId);
 if(context.recordsRevision!==input.expectedRevision)return fail('mechanical_revision_conflict');if(context.workshopRevision!==input.expectedWorkshopRevision)return fail('workshop_revision_conflict');
 if(!context.active)return fail('checklist_inactive');const change=trackingChange(context.tracking,input,server.policy);if(!change.ok)return fail(change.code);
 const current=await server.verifySession();if(!current||current.id!==actor.id||current.role!==actor.role||current.active!==true)return fail('session_changed',401);
 const result=await server.commit({p_actor:actor.id,p_operation:input.operation,p_request:input.requestId,p_fingerprint:fingerprint,p_entity:input.entityId,p_device:input.deviceId,p_expected_records:input.expectedRevision,p_expected_workshop:input.expectedWorkshopRevision,p_payload:input.payload});
 if(result?.requestId!==input.requestId||result?.ok!==true)throw Error('invalid_tracking_ack');return {status:200,body:{ok:true,requestId:input.requestId,requiresRefresh:true}};
}
