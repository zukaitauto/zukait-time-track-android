import {mechanicalCommandFingerprint as digest} from './mechanical_rules.js';
const fail=code=>({ok:false,code}),uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export async function mechanicalSignatureCorrection(input,server={}){
 if(server.enabled!==true||server.signaturesEnabled!==true)return fail('mechanical_signatures_disabled');
 if(!input||Object.keys(input).some(k=>!['requestId','checklistId','deviceId','expectedRevision','expectedWorkshopRevision','signatureId','expectedSourceHash','reason'].includes(k))
  ||![input.requestId,input.checklistId,input.signatureId].every(uuid)||typeof input.deviceId!=='string'||!input.deviceId.trim()||input.deviceId.length>128
  ||![input.expectedRevision,input.expectedWorkshopRevision].every(n=>Number.isSafeInteger(n)&&n>=0)||!/^[0-9a-f]{64}$/.test(input.expectedSourceHash||'')
  ||typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>500)return fail('invalid_mechanical_signature_correction');
 if(!['verifySession','readReceipt','readDocument','readSignature','commit'].every(k=>typeof server[k]==='function'))return fail('mechanical_signature_adapter_required');
 const actor=await server.verifySession();
 if(actor?.id!=='SUP003'||!['Supervisor','Mechanical Supervisor'].includes(actor.role)||actor.active!==true
  ||server.policy?.signaturesEnabled!==true||!server.policy.signatureWriters?.SUP003?.includes('OWN_SIGNATURE'))return fail('mechanical_signature_forbidden');
 const fingerprint=await digest({domain:'mechanical-signature-correction-v1',actorId:actor.id,...input}),prior=await server.readReceipt(input.requestId);
 if(prior)return prior.actorId===actor.id&&prior.fingerprint===fingerprint?{ok:true,duplicate:true,result:prior.result,requiresRefresh:true}:fail('mechanical_signature_request_reused');
 const source=await server.readDocument(input);
 if(!source?.ok||source.checklistId!==input.checklistId||source.document?.recordsRevision!==input.expectedRevision||source.document?.workshopRevision!==input.expectedWorkshopRevision)return fail('mechanical_document_changed');
 const sourceHash=await digest({domain:'mechanical-unpriced-signature-source-v1',checklistId:input.checklistId,document:source.document});
 if(sourceHash!==input.expectedSourceHash)return fail('mechanical_document_changed');
 const currentSignature=await server.readSignature(sourceHash);
 if(currentSignature?.result?.requestId!==input.signatureId)return fail('mechanical_document_changed');
 const current=await server.verifySession();if(current?.id!==actor.id||current?.role!==actor.role||current.active!==true)return fail('session_changed');
 const result=await server.commit({...input,actorId:actor.id,sourceHash,fingerprint});
 return {ok:true,result,requiresRefresh:true};
}
