// Inactive V377 trusted-server adapter. The SQL draft is not deployed.
// executeAtomicSave must run inside a trusted, authenticated transaction
// and must enforce the authoritative session/checklist permission again.
const error=code=>{const e=new Error(code);e.code=code;throw e;};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function createMechanicalInspectionSaveAdapter({authorizeChecklist,executeAtomicSave}={}){
 return async function saveInspection(command){
  if(!command||!uuid(command.checklistId)||!uuid(command.requestId)||
   !Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0||
   typeof command.actorId!=='string'||!command.actorId.trim()||
   !command.inspection||typeof command.inspection!=='object'||Array.isArray(command.inspection))
   error('22023');
  if(typeof authorizeChecklist!=='function'||typeof executeAtomicSave!=='function')
   error('08006');
  const permitted=await authorizeChecklist({
   checklistId:command.checklistId,actorId:command.actorId,operation:'SAVE_INSPECTION'
  });
  if(permitted!==true)error('42501');
  // Do not pass through client-supplied SQL or an untrusted session token.
  const result=await executeAtomicSave({
   checklistId:command.checklistId,requestId:command.requestId,
   actorId:command.actorId,expectedRevision:command.expectedRevision,
   inspection:JSON.parse(JSON.stringify(command.inspection))
  });
  if(!result||!Number.isSafeInteger(result.revision)||result.revision<1||
   typeof result.replayed!=='boolean')error('08006');
  return {revision:result.revision,replayed:result.replayed};
 };
}
