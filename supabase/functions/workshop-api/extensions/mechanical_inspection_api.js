// Inactive V377 Mechanical inspection save/read boundary.
// The production route must supply authenticated actor, policy and a transactional
// adapter that revalidates session, authorization, revision and request receipt.
import {validateMechanicalInspection} from './mechanical_inspection_contract.js';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const fail=(code,status=400)=>({status,body:{ok:false,code}});
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export async function mechanicalInspectionApi(input,server={}){
 if(server.enabled!==true||server.policy?.flags?.mechanical!==true)return fail('extension_disabled',403);
 if(!obj(input)||Object.keys(input).some(k=>!['operation','checklistId','requestId','expectedRevision','inspection'].includes(k))||JSON.stringify(input).length>16384)return fail('invalid_command');
 if(!['READ_INSPECTION','SAVE_INSPECTION'].includes(input.operation)||!uuid(input.checklistId))return fail('invalid_command');
 if(typeof server.verifySession!=='function')return fail('invalid_session',401);
 const actor=await server.verifySession();
 if(!actor||actor.active!==true||actor.id!==server.actor?.id)return fail('session_changed',401);
 if(!(actor.role==='Manager'||actor.id==='SUP003'&&['Supervisor','Mechanical Supervisor'].includes(actor.role)))return fail('mechanical_forbidden',403);
 if(input.operation==='READ_INSPECTION'){
  if(typeof server.readInspection!=='function')return fail('mechanical_adapter_unavailable',503);
  if('inspection'in input||'requestId'in input||'expectedRevision'in input)return fail('invalid_command');
  const record=await server.readInspection(input.checklistId,actor);
  return {status:200,body:{ok:true,inspection:record??null}};
 }
 if(!uuid(input.requestId)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)return fail('invalid_command');
 const validated=validateMechanicalInspection(input.inspection);
 if(!validated.ok)return fail(validated.code);
 if(typeof server.saveInspection!=='function')return fail('mechanical_adapter_unavailable',503);
 const current=await server.verifySession();
 if(!current||current.active!==true||current.id!==actor.id||current.role!==actor.role)return fail('session_changed',401);
 // The adapter MUST atomically enforce checklist ownership, current session,
 // compare-and-swap revision, request-id fingerprint, receipt and audit.
 const result=await server.saveInspection({
  checklistId:input.checklistId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,
  inspection:JSON.parse(JSON.stringify(input.inspection)),actorId:actor.id
 });
 return {status:200,body:{ok:true,result}};
}
