// Default-off boundary. Policy/read/commit dependencies are server-owned.
import {extensionCommandPreflight} from './command_contracts.js';
import {mechanicalCommandFingerprint} from './mechanical_rules.js';
import {mechanicalDeliveryRequest} from './mechanical_delivery_plan.js';
const fail=(code,status=409)=>({status,body:{ok:false,code}});
export async function mechanicalDeliveryCommandApi(input,server={}){
 if(server.enabled!==true||server.deliveryEnabled!==true)return fail('extension_disabled',403);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['operation','requestId','entityId','deviceId','expectedRevision','expectedWorkshopRevision','payload'].includes(k))||input.operation!=='MECHANICAL_DELIVER'||!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload)||Object.keys(input.payload).some(k=>k!=='expectedFingerprint')||JSON.stringify(input).length>8192)return fail('invalid_mechanical_delivery',400);
 if(!['verifySession','readReceipt','readContext','commit'].every(k=>typeof server[k]==='function'))return fail('mechanical_adapter_unavailable',503);
 const actor=await server.verifySession();if(!actor||actor.active!==true||actor.id!==server.actor?.id||actor.role!==server.actor?.role)return fail('session_changed',401);
 const command={...JSON.parse(JSON.stringify(input)),actorId:actor.id},context={actor,sessionCurrent:true,online:true};
 const access=extensionCommandPreflight(command,context,server.policy);if(!access.ok)return fail(access.code,403);
 if(!Number.isSafeInteger(command.expectedWorkshopRevision)||command.expectedWorkshopRevision<0||!/^[0-9a-f]{64}$/.test(command.payload.expectedFingerprint||''))return fail('invalid_mechanical_delivery',400);
 const fingerprint=await mechanicalCommandFingerprint(command),prior=await server.readReceipt(command.requestId);
 if(prior){if(prior.actorId!==actor.id||prior.fingerprint!==fingerprint||prior.result?.operation!=='MECHANICAL_DELIVER'||prior.result?.entityId!==command.entityId)return fail('mechanical_request_reused');return {status:200,body:{ok:true,duplicate:true,requestId:command.requestId,requiresReadinessRefresh:true}}}
 const {records,snapshot,approval,policy}=await server.readContext(command);
 const planned=await mechanicalDeliveryRequest(records,snapshot,command,context,policy,approval);if(!planned.ok)return fail(planned.code);
 const current=await server.verifySession();if(!current||current.active!==true||current.id!==actor.id||current.role!==actor.role)return fail('session_changed',401);
 const result=await server.commit(planned.request);if(result?.ok!==true||result.requestId!==command.requestId)throw Error('invalid_mechanical_delivery_commit');
 return {status:200,body:{ok:true,requestId:command.requestId,requiresReadinessRefresh:true}};
}
