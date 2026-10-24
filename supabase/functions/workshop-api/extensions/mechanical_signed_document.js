import {mechanicalCommandFingerprint as digest} from './mechanical_rules.js';
import {validSignatureInk} from './mechanical_signature.js';
// Server-owned adapters only. Ordinary unpriced requests never call this module.
export async function mechanicalSignedDocument(input,server={}){
 const fail=code=>({ok:false,code});
 if(server.enabled!==true||server.signaturesEnabled!==true)return fail('mechanical_signatures_disabled');
 if(!['verifySession','readDocument','readSignature'].every(k=>typeof server[k]==='function'))return fail('mechanical_signature_adapter_required');
 const actor=await server.verifySession();if(actor?.active!==true)return fail('invalid_session');if(actor.id!=='SUP003'||actor.role!=='Supervisor')return fail('mechanical_signature_forbidden');
 // The private SQL reader separately requires OWN_SIGNATURE + SIGNED_UNPRICED,
 // and binds credentials/session/checklist/current revisions under locks.
 const source=await server.readDocument(input);
 if(!source?.ok)return fail(source?.code||'mechanical_document_changed');
 if(source.checklistId!==input.checklistId||source.document?.recordsRevision!==input.expectedRevision||source.document?.workshopRevision!==input.expectedWorkshopRevision)return fail('mechanical_document_changed');
 const sourceHash=await digest({domain:'mechanical-unpriced-signature-source-v1',checklistId:input.checklistId,document:source.document});
 const signed=await server.readSignature(input.verify===true?'verify_export':'export',sourceHash),r=signed?.result;
 if(!r)return fail('mechanical_signature_missing');
 if(r.actorId!=='SUP003'||r.checklistId!==input.checklistId||r.recordsRevision!==input.expectedRevision||r.workshopRevision!==input.expectedWorkshopRevision||r.sourceHash!==sourceHash)return fail('mechanical_document_changed');
 const current=await server.verifySession();if(current?.id!==actor.id||current.role!==actor.role||current.active!==true)return fail('session_changed');
 if(input.verify===true)return {ok:true,checklistId:input.checklistId,recordsRevision:r.recordsRevision,workshopRevision:r.workshopRevision,signatureId:r.requestId,sourceHash};
 if(!validSignatureInk(signed.strokes)||typeof r.signedAt!=='string'||!Number.isFinite(Date.parse(r.signedAt)))return fail('mechanical_document_changed');
 return {ok:true,checklistId:input.checklistId,document:source.document,signature:{requestId:r.requestId,checklistId:r.checklistId,actorId:r.actorId,recordsRevision:r.recordsRevision,workshopRevision:r.workshopRevision,sourceHash,signedAt:r.signedAt,strokes:structuredClone(signed.strokes)}};
}
