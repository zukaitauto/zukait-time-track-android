// Inactive V377 Mechanical inspection save/read boundary.
// The production route must supply authenticated actor, policy and a transactional
// adapter that revalidates session, authorization, revision and request receipt.
import {validateMechanicalInspection} from './mechanical_inspection_contract.js';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const fail=(code,status=400)=>({status,body:{ok:false,code}});
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const storageError=e=>{
 const code=String(e?.code??'');
 if(code==='40001')return fail('inspection_revision_conflict',409);
 if(code==='23505')return fail('inspection_request_conflict',409);
 if(code==='P0002')return fail('inspection_checklist_not_found',404);
 if(code==='22023')return fail('invalid_inspection');
 if(code==='42501')return fail('mechanical_forbidden',403);
 return fail('mechanical_storage_unavailable',503);
};
export async function mechanicalInspectionApi(input,server={}){
 if(server.enabled!==true||server.policy?.flags?.mechanical!==true)return fail('extension_disabled',403);
 if(!obj(input)||Object.keys(input).some(k=>!['operation','checklistId','requestId','expectedRevision','inspection'].includes(k)))return fail('invalid_command');
 let serialized;
 try{serialized=JSON.stringify(input);}catch{return fail('invalid_command');}
 if(typeof serialized!=='string'||serialized.length>16384)return fail('invalid_command');
 if(!['READ_INSPECTION','SAVE_INSPECTION'].includes(input.operation)||!uuid(input.checklistId))return fail('invalid_command');
 // A dedicated policy gate must resolve checklist access from authoritative
 // server data, never from the request payload.
 if(typeof server.authorizeChecklist!=='function')return fail('mechanical_adapter_unavailable',503);
 if(typeof server.verifySession!=='function')return fail('invalid_session',401);
 let actor;
 try{actor=await server.verifySession();}catch{return fail('invalid_session',401);}
 if(!actor||actor.active!==true||!server.actor?.id||!server.actor?.role||actor.id!==server.actor.id||actor.role!==server.actor.role||actor.department!==server.actor.department)return fail('session_changed',401);
 if(!(actor.role==='Manager'||actor.id==='SUP003'&&['Supervisor','Mechanical Supervisor'].includes(actor.role)))return fail('mechanical_forbidden',403);
 let permitted;
 try{permitted=await server.authorizeChecklist({checklistId:input.checklistId,actor,operation:input.operation});}
 catch(e){return storageError(e);}
 if(permitted!==true)return fail('mechanical_forbidden',403);
 if(input.operation==='READ_INSPECTION'){
  if('inspection'in input||'requestId'in input||'expectedRevision'in input)return fail('invalid_command');
  if(typeof server.readInspection!=='function')return fail('mechanical_adapter_unavailable',503);
  let current;
  try{current=await server.verifySession();}catch{return fail('invalid_session',401);}
  if(!current||current.active!==true||current.id!==actor.id||current.role!==actor.role||current.department!==actor.department)return fail('session_changed',401);
  try{
   const record=await server.readInspection(input.checklistId,current);
   // Recheck before releasing inspection data if the session was revoked
   // while the database read was in flight.
   let after;
   try{after=await server.verifySession();}catch{return fail('invalid_session',401);}
   if(!after||after.active!==true||after.id!==current.id||after.role!==current.role||after.department!==current.department)return fail('session_changed',401);
   return {status:200,body:{ok:true,inspection:record??null}};
  }catch(e){return storageError(e);}
 }
 if(!uuid(input.requestId)||!Number.isSafeInteger(input.expectedRevision)||(input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER))return fail('invalid_command');
 const validated=validateMechanicalInspection(input.inspection);
 if(!validated.ok)return fail(validated.code);
 if(typeof server.saveInspection!=='function')return fail('mechanical_adapter_unavailable',503);
 let current;
  try{current=await server.verifySession();}catch{return fail('invalid_session',401);}
 if(!current||current.active!==true||current.id!==actor.id||current.role!==actor.role||current.department!==actor.department)return fail('session_changed',401);
 // The adapter MUST atomically enforce checklist ownership, current session,
 // compare-and-swap revision, request-id fingerprint, receipt and audit.
 try{
 const result=await server.saveInspection({
  checklistId:input.checklistId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,
  inspection:JSON.parse(JSON.stringify(input.inspection)),actorId:actor.id
 });
 return {status:200,body:{ok:true,result}};
 }catch(e){return storageError(e);}
}
