// V377 inactive adapter. Never expose directly as an HTTP route.
// The caller must inject a trusted server-side database client and an
// authoritative checklist authorization callback. Fail closed otherwise.
const deny=(code)=>{const e=new Error(code);e.code=code;throw e;};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function createMechanicalInspectionReadAdapter({db,authorizeChecklist}={}){
 return async function readInspection(checklistId,actor){
  if(!uuid(checklistId)||!actor?.id||actor.active!==true)deny('22023');
  if(typeof authorizeChecklist!=='function'||!db||typeof db.schema!=='function')deny('08006');
  // Must check the authoritative Mechanical checklist, not merely the
  // inspection_details row (which may not exist for a new checklist).
  const allowed=await authorizeChecklist({checklistId,actor,operation:'READ_INSPECTION'});
  if(allowed!==true)deny('42501');
  const table=db.schema('zukait_mechanical').from('inspection_details');
  const {data,error}=await table.select('checklist_id,revision,job_type,vehicle,damage_marks,function_checks,work_description,updated_at,updated_by').eq('checklist_id',checklistId).maybeSingle();
  if(error)throw error;
  if(!data)return null;
  return {
   checklistId:data.checklist_id,revision:data.revision,
   inspection:{jobType:data.job_type,vehicle:data.vehicle,damageMarks:data.damage_marks,
    functions:data.function_checks,workDescription:data.work_description},
   updatedAt:data.updated_at,updatedBy:data.updated_by
  };
 };
}
