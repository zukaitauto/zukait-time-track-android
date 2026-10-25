// Inactive own-signature contract. No client-supplied identity or source digest.
import {mechanicalCommandFingerprint as digest} from './mechanical_rules.js';
const fail=code=>({ok:false,code}),uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function validSignatureInk(strokes){
 if(!Array.isArray(strokes)||!strokes.length||strokes.length>64)return false;let count=0,first=null,moved=false;
 for(const stroke of strokes){if(!Array.isArray(stroke)||stroke.length<2||stroke.length>256)return false;for(const point of stroke){if(++count>1024||!Array.isArray(point)||point.length!==2||!point.every(n=>Number.isInteger(n)&&n>=0&&n<=10000))return false;if(!first)first=point;if(Math.abs(point[0]-first[0])+Math.abs(point[1]-first[1])>=100)moved=true}}
 return moved;
}
export async function mechanicalSignatureCommand(input,server={}){
 if(server.enabled!==true||server.signaturesEnabled!==true)return fail('mechanical_signatures_disabled');
 if(!input||Object.keys(input).some(k=>!['requestId','checklistId','deviceId','expectedRevision','expectedWorkshopRevision','consent','strokes','expectedSourceHash'].includes(k))||!uuid(input.requestId)||!uuid(input.checklistId)||typeof input.deviceId!=='string'||!input.deviceId.trim()||input.deviceId.length>128||![input.expectedRevision,input.expectedWorkshopRevision].every(n=>Number.isSafeInteger(n)&&n>=0)||!/^[0-9a-f]{64}$/.test(input.expectedSourceHash||'')||input.consent!==true||!validSignatureInk(input.strokes))return fail('invalid_mechanical_signature');
 if(!['verifySession','readReceipt','readDocument','commit'].every(k=>typeof server[k]==='function'))return fail('mechanical_signature_adapter_required');
 const actor=await server.verifySession();if(actor?.id!=='SUP003'||!['Supervisor','Mechanical Supervisor'].includes(actor.role)||actor.active!==true)return fail('mechanical_signature_forbidden');
 // Policy must come from a separately session-bound trusted reader. Existing
 // unpriced access does not confer signature capture or reading rights.
 if(server.policy?.signaturesEnabled!==true||!Array.isArray(server.policy.signatureWriters?.[actor.id])||!server.policy.signatureWriters[actor.id].includes('OWN_SIGNATURE'))return fail('mechanical_signature_forbidden');
 const fingerprint=await digest({domain:'mechanical-own-signature-v1',actorId:actor.id,...input}),prior=await server.readReceipt(input.requestId);
 if(prior){if(prior.actorId!==actor.id||prior.fingerprint!==fingerprint)return fail('mechanical_signature_request_reused');return {ok:true,duplicate:true,result:prior.result,requiresRefresh:true}}
 const source=await server.readDocument(input);
 if(!source?.ok||source.checklistId!==input.checklistId||source.document?.recordsRevision!==input.expectedRevision||source.document?.workshopRevision!==input.expectedWorkshopRevision)return fail('mechanical_document_changed');
 const sourceHash=await digest({domain:'mechanical-unpriced-signature-source-v1',checklistId:input.checklistId,document:source.document});
 if(sourceHash!==input.expectedSourceHash)return fail('mechanical_document_changed');
 const current=await server.verifySession();if(current?.id!==actor.id||current?.role!==actor.role||current.active!==true)return fail('session_changed');
 const result=await server.commit({actorId:actor.id,requestId:input.requestId,deviceId:input.deviceId,checklistId:input.checklistId,recordsRevision:input.expectedRevision,workshopRevision:input.expectedWorkshopRevision,sourceHash,fingerprint,strokes:structuredClone(input.strokes)});
 return {ok:true,result,requiresRefresh:true};
}
