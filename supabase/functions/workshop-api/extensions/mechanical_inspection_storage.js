// Server-only V377 storage transport. Reads and writes use authenticated RPCs;
// no direct PostgREST access to private inspection tables is required.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function createMechanicalInspectionStorage({admin,actor,sessionHash}={}){
 const valid=admin&&typeof admin.rpc==='function'&&
  typeof actor?.id==='string'&&actor.id.length>0&&
  typeof sessionHash==='string'&&/^[0-9a-f]{64}$/.test(sessionHash);
 const call=async (name,params)=>{
  if(!valid){const e=new Error('invalid_session');e.code='42501';throw e;}
  const {data,error}=await admin.rpc(name,params);
  if(error){
   if(/mechanical_(forbidden|disabled|invalid_session)/.test(error.message||''))error.code='42501';
   throw error;
  }
  return data;
 };
 const read=async checklistId=>{
  if(!uuid(checklistId)){const e=new Error('invalid_command');e.code='22023';throw e;}
  return call('zukait_mechanical_inspection_read',{
   p_actor:actor.id,p_session_hash:sessionHash,p_checklist:checklistId
  });
 };
 const authorizeChecklist=async ({checklistId,actor:verified,actorId})=>{
  if(!valid||(!uuid(checklistId))||
     (verified&&verified.id!==actor.id)||
     (actorId!==undefined&&actorId!==actor.id))return false;
  const result=await read(checklistId);
  return result?.ok===true&&result.checklist?.id===checklistId;
 };
 const executeAtomicSave=async command=>{
  if(!valid||command?.actorId!==actor.id||!uuid(command?.checklistId)||
     !uuid(command?.requestId)){const e=new Error('invalid_command');e.code='22023';throw e;}
  const result=await call('zukait_mechanical_inspection_save',{
   p_actor:actor.id,p_session_hash:sessionHash,p_checklist:command.checklistId,
   p_request:command.requestId,p_expected:command.expectedRevision,
   p_inspection:command.inspection
  });
  return result;
 };
 // This trusted adapter calls the DB function which rechecks session,
 // Mechanical role and checklist membership inside the same transaction.
 Object.defineProperty(executeAtomicSave,'authorizesInTransaction',{value:true});
 return {authorizeChecklist,executeAuthorizedRead:read,executeAtomicSave};
}
