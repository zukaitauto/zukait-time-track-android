// Inactive pure transition candidate. Persist both outputs in one future CAS transaction.
// records is a bounded/scoped projection of dedicated future records, not workshop JSON history.
import {extensionCommandPreflight,checklistNumberFromAllocatedSequence} from './command_contracts.js';
import {allocationToken,employeeTimeToken} from '../time_management_rules.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=code=>({ok:false,code});
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const text=(x,max=200)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const active=s=>s&&!s.cancelled&&!s.voided&&!s.deleted&&(!s.end||s.end==='null');
const canonical=x=>JSON.stringify(order(x));
function order(x){if(Array.isArray(x))return x.map(order);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,order(x[k])]));return x;}
function knownFields(value,fields){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>fields.includes(k));}
function technician(data,id,policy){return typeof policy.mechanicalDepartment==='string'&&policy.mechanicalDepartment.length>0&&(data.users||[]).find(u=>u&&u.id===id&&u.role==='Employee'&&u.active!==false&&u.department===policy.mechanicalDepartment);}
function liveJob(data,number){return (data.jobs||[]).find(j=>j&&j.no===number&&!j.delivered&&!j.cancelled&&!j.archived&&!j.deleted);}
export function mechanicalTransition(records,snapshot,command,context={},policy={},at=Date.now()){
 const access=extensionCommandPreflight(command,context,policy);if(!access.ok)return access;
 if(access.domain!=='mechanical')return fail('not_mechanical_command');
 if(!records||!snapshot||!Array.isArray(records.checklists)||!Array.isArray(records.tasks)||!Array.isArray(records.links)||!Array.isArray(records.receipts)||!Array.isArray(records.audit)||!snapshot.data)return fail('invalid_mechanical_snapshot');
 if(['checklists','tasks','links','receipts','audit'].some(k=>records[k].some(x=>!x||typeof x!=='object'||Array.isArray(x))))return fail('invalid_mechanical_snapshot');
 if(!knownFields(command,['operation','requestId','actorId','entityId','deviceId','expectedRevision','expectedWorkshopRevision','payload']))return fail('invalid_command');
 const fingerprint=canonical(command),prior=records.receipts.find(r=>r.requestId===command.requestId);
 if(prior)return prior.actorId===context.actor.id&&prior.fingerprint===fingerprint?{ok:true,duplicate:true,result:clone(prior.result)}:fail('request_reused');
 if(!Number.isSafeInteger(records.revision)||records.revision<0||records.revision>=Number.MAX_SAFE_INTEGER)return fail('invalid_records_revision');
 if(!Array.isArray(snapshot.data.assign)||!Array.isArray(snapshot.data.sessions)||!Array.isArray(snapshot.data.users)||!Array.isArray(snapshot.data.jobs))return fail('invalid_workshop_snapshot');
 if(records.revision!==command.expectedRevision)return fail('mechanical_revision_conflict');
 if(!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0||!Number.isSafeInteger(command.expectedWorkshopRevision)||command.expectedWorkshopRevision!==snapshot.revision)return fail('workshop_revision_conflict');
 if(!Number.isSafeInteger(at)||at<=0)return fail('invalid_server_time');
 const p=command.payload,data=snapshot.data;
 let entity,before=null,assignment=null,source=null;
 if(command.operation==='MC_CREATE'){
  if(!knownFields(p,['manualJobCard'])||!knownFields(p.manualJobCard,['number','date'])||!text(p.manualJobCard.number,80)||!date(p.manualJobCard.date))return fail('invalid_manual_jc');
  if(!['allow','deny'].includes(policy.manualJcDuplicateMode))return fail('manual_jc_policy_required');
  if(!liveJob(data,p.manualJobCard.number))return fail('existing_active_jc_required');
  if(records.checklists.some(c=>c.id===command.entityId))return fail('checklist_id_exists');
  if(policy.manualJcDuplicateMode==='deny'&&records.checklists.some(c=>c.manualJobCard.number===p.manualJobCard.number))return fail('manual_jc_duplicate');
  const a=context.allocatedChecklist;
  if(!uuid(command.entityId)||!a||a.requestId!==command.requestId||a.id!==command.entityId||context.allocationVerified!==true)return fail('verified_mc_allocation_required');
  let number;try{number=checklistNumberFromAllocatedSequence(a.sequence,policy.mcNumbering)}catch(e){return fail(e.message)}
  if(a.number!==number||records.checklists.some(c=>c.number===number))return fail('mc_allocation_conflict');
  entity={id:command.entityId,number,manualJobCard:clone(p.manualJobCard),createdBy:context.actor.id,createdAt:at};
 }else if(command.operation==='TASK_CREATE'){
  if(!knownFields(p,['checklistId','title'])||!uuid(command.entityId)||!text(p.title)||!uuid(p.checklistId))return fail('invalid_task');
  const checklist=records.checklists.find(c=>c.id===p.checklistId);if(!checklist||!liveJob(data,checklist.manualJobCard.number))return fail('checklist_inactive');
  if(records.tasks.some(t=>t.id===command.entityId))return fail('task_id_exists');
  entity={id:command.entityId,checklistId:checklist.id,title:p.title.trim(),createdBy:context.actor.id,createdAt:at};
 }else if(command.operation==='TASK_ASSIGN'||command.operation==='TASK_HANDOVER'){
  const task=records.tasks.find(t=>t.id===command.entityId),checklist=records.checklists.find(c=>c.id===task?.checklistId);
  if(!task||!checklist||!liveJob(data,checklist.manualJobCard.number))return fail('task_inactive');
  let employeeId,assignmentId;
  if(command.operation==='TASK_ASSIGN'){
   if(!knownFields(p,['employeeId','assignmentId','suggestedMinutes']))return fail('invalid_assignment');
   employeeId=p.employeeId;assignmentId=p.assignmentId;
  }else{
   if(!knownFields(p,['sourceAssignmentId','targetEmployeeId','successorAssignmentId','suggestedMinutes','reason','expectedSource','expectedEmployeeSessions'])||!text(p.reason,500))return fail('handover_reason_required');
   source=(data.assign||[]).find(a=>a&&a.id===p.sourceAssignmentId);
   const link=records.links.find(l=>l.taskId===task.id&&l.assignmentId===source?.id&&!l.handedOverTo);
   if(!source||!link||source.completed||source.cancelled||source.rework||source.job!==checklist.manualJobCard.number)return fail('handover_source_inactive');
   if(context.timeSnapshotConfirmed!==true)return fail('confirmed_time_snapshot_required');
   if(p.expectedSource!==allocationToken(source)||p.expectedEmployeeSessions!==employeeTimeToken(data,source.emp))return fail('handover_source_changed');
   // STOP/PAUSE must already be acknowledged by existing time authority.
   if((data.sessions||[]).some(s=>s&&s.emp===source.emp&&active(s)))return fail('stop_outgoing_work_first');
   if((data.sessions||[]).some(s=>s&&s.assignmentId===source.id&&(!Number.isFinite(Number(s.start))||!Number.isFinite(Number(s.end))||Number(s.start)<=0||Number(s.end)<Number(s.start)||Number(s.end)>at)))return fail('handover_time_review_required');
   employeeId=p.targetEmployeeId;assignmentId=p.successorAssignmentId;
   if(employeeId===source.emp)return fail('handover_same_employee');
   if((data.sessions||[]).some(s=>s&&s.emp===employeeId&&active(s)))return fail('target_employee_working');
   before=clone(source);
  }
  if(!technician(data,employeeId,policy)||!uuid(assignmentId)||!Number.isSafeInteger(p.suggestedMinutes)||p.suggestedMinutes<0||p.suggestedMinutes>60000)return fail('invalid_assignment');
  if((data.assign||[]).some(a=>a&&a.id===assignmentId))return fail('assignment_id_exists');
  if(records.links.some(l=>l.taskId===task.id&&l.employeeId===employeeId&&!l.handedOverTo&&(data.assign||[]).some(a=>a&&a.id===l.assignmentId&&!a.cancelled&&!a.completed)))return fail('duplicate_task_employee');
  assignment={id:assignmentId,job:checklist.manualJobCard.number,emp:employeeId,suggested:p.suggestedMinutes,completed:false,cancelled:false,rework:false,assignedBy:context.actor.id,assignedAt:at,mechanicalChecklistId:checklist.id,mechanicalTaskId:task.id,...(source?{handoverFromAssignmentId:source.id}:{})};
  entity={taskId:task.id,assignmentId,employeeId,...(source?{handoverFromAssignmentId:source.id}:{})};
 }else return fail('mechanical_operation_not_implemented');
 const next=clone(records),workshop=clone(data);next.revision++;
 if(command.operation==='MC_CREATE')next.checklists.push(entity);
 else if(command.operation==='TASK_CREATE')next.tasks.push(entity);
 else{
  next.links.push(entity);workshop.assign=workshop.assign||[];
  if(source){const old=workshop.assign.find(a=>a&&a.id===source.id);old.completed=true;old.completedAt=at;old.handedOverToAssignmentId=assignment.id;next.links.find(l=>l.assignmentId===source.id).handedOverTo=assignment.id;}
  workshop.assign.push(assignment);
 }
 const result={entityId:command.entityId,recordsRevision:next.revision,expectedWorkshopRevision:snapshot.revision,assignmentId:assignment?.id||null};
 const audit={requestId:command.requestId,operation:command.operation,actorId:context.actor.id,deviceId:command.deviceId,recordedAt:at,reason:p.reason||'',before,after:clone(assignment||entity)};
 next.receipts.push({requestId:command.requestId,actorId:context.actor.id,fingerprint,result});next.audit.push(audit);
 return {ok:true,records:next,workshopData:workshop,result,audit};
}
