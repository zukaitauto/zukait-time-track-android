// Only the authenticated Mechanical route may construct this context. Never
// accept it, a role override, or a list of authorized jobs from a client.
import {timeManagementTransition,allocationToken,employeeTimeToken,workedMinutes} from '../time_management_rules.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const key=value=>String(value??'');
const permitted=actor=>actor?.active!==false&&(actor?.role==='Manager'||actor?.id==='SUP003'&&['Supervisor','Mechanical Supervisor'].includes(actor.role));
const fail=code=>({ok:false,code});
export function mechanicalTimeScope(actor,context){
 if(!permitted(actor)||context?.sessionCurrent!==true||context?.enabled!==true)return null;
 if(!context.department||!Array.isArray(context.checklists)||!Array.isArray(context.links)||!Array.isArray(context.tasks))return null;
 const jobs=new Set(context.checklists.map(c=>key(c.jobCard??c.manualJobCard?.number)));
 jobs.delete('');jobs.delete('ID001');
 const checklists=new Set(context.checklists.map(c=>key(c.id)));
 const tasks=new Map(context.tasks.filter(t=>checklists.has(key(t.checklistId))).map(t=>[key(t.id),t]));
 const links=new Map(context.links.filter(l=>tasks.has(key(l.taskId))).map(l=>[key(l.assignmentId),l]));
 return {jobs,links,department:key(context.department)};
}

export function mechanicalTimeProjection(current,actor,context){
 const scope=mechanicalTimeScope(actor,context);if(!scope)return fail('mechanical_time_forbidden');
 const people=new Map((current.users||[]).map(u=>[key(u.id),u]));
 const jobs=(current.jobs||[]).filter(j=>scope.jobs.has(key(j.no))&&!j.delivered&&!j.archived&&!j.deleted&&!j.cancelled);
 const jobIds=new Set(jobs.map(j=>key(j.no)));
 const assignments=(current.assign||[]).filter(a=>{
  const link=scope.links.get(key(a.id)),person=people.get(key(a.emp));
  return link&&key(link.employeeId)===key(a.emp)&&jobIds.has(key(a.job))&&key(person?.department)===scope.department;
 });
 const assignmentIds=new Set(assignments.map(a=>key(a.id)));
 const sessions=(current.sessions||[]).filter(s=>s.assignmentId&&assignmentIds.has(key(s.assignmentId)));
 const select=(value,fields)=>Object.fromEntries(fields.filter(f=>value[f]!==undefined).map(f=>[f,copy(value[f])]));
 return {ok:true,jobs:jobs.map(j=>select(j,['no','reg','vehicle','make','model','year','status'])),
  users:(current.users||[]).filter(u=>u.role==='Employee'&&u.active!==false&&key(u.department)===scope.department).map(u=>select(u,['id','name','department','role'])),
  assign:assignments.map(a=>({...select(a,['id','job','emp','suggested','completed','completedAt','cancelled','rework','assignedAt','timeManagementRevision','mechanicalTaskId','mechanicalChecklistId','handedOverToAssignmentId']),taskId:scope.links.get(key(a.id)).taskId,workedMinutes:workedMinutes(current,a),allocationToken:allocationToken(a)})),
  sessions:sessions.map(s=>select(s,['id','assignmentId','job','emp','start','end','paused','finished','cancelled'])),
  audit:(current.additionalActions||[]).filter(a=>a.source==='Mechanical Time Management'&&assignmentIds.has(key(a.assignmentId))).map(a=>select(a,['id','operation','type','assignmentId','job','emp','reason','by','actorRole','at','before','after','oldSuggested','newSuggested']))};
}

export function mechanicalTimeTransition(current,actor,request,context,at=Date.now()){
 const scope=mechanicalTimeScope(actor,context);if(!scope)return fail('mechanical_time_forbidden');
 const source=(current.assign||[]).find(a=>key(a.id)===key(request?.assignmentId));
 const link=scope.links.get(key(source?.id));
 if(!source||!link||key(link.employeeId)!==key(source.emp)||!scope.jobs.has(key(source.job)))return fail('mechanical_time_job_required');
 const job=(current.jobs||[]).find(j=>key(j.no)===key(source.job));
 // Reconcile an exact earlier receipt even if the job subsequently closed.
 // The shared engine still compares actor, request ID and complete command.
 const prior=(current.additionalActions||[]).find(a=>a.id===request.requestId&&a.by===actor.id);
 if(prior)return timeManagementTransition(current,{...actor,role:'Manager'},request,at);
 if(!job||job.delivered||job.archived||job.deleted||job.cancelled)return fail('time_job_inactive');
 const employees=new Map((current.users||[]).map(u=>[key(u.id),u]));
 if(key(employees.get(key(source.emp))?.department)!==scope.department)return fail('mechanical_time_job_required');
 // New/reassigned allocations must go through TASK_ASSIGN / TASK_HANDOVER so
 // their task links and receipts remain atomic. Splits can use an existing link.
 if(request.operation==='REASSIGN')return fail('mechanical_use_task_handover');
 if(request.operation==='SPLIT'){
  const target=employees.get(key(request.targetEmployeeId));
  const allocation=(current.assign||[]).find(a=>key(a.job)===key(source.job)&&key(a.emp)===key(request.targetEmployeeId)&&!a.completed&&!a.cancelled);
  if(!target||target.active===false||key(target.department)!==scope.department)return fail('mechanical_time_technician_required');
  if(!allocation||scope.links.get(key(allocation.id))?.taskId!==link.taskId)return fail('mechanical_assign_technician_first');
 }
 // The common pure engine provides identical correction validation for the two
 // authorized roles. This grants no session/API role and changes no account.
 const result=timeManagementTransition(current,{...actor,role:'Manager'},request,at);
 if(!result.ok||result.duplicate)return result;
 const audit=result.audit; audit.source='Mechanical Time Management';audit.actorRole=actor.role;
 audit.operation=request.operation;
 // Audit identity always belongs to the real authenticated actor.
 if(audit.by!==actor.id)throw Error('mechanical_time_actor_mismatch');
 return result;
}

// Hash this server-side before returning it. Do not expose another department's
// employee session history merely to implement a conflict token.
export const mechanicalEmployeeTimeToken=employeeTimeToken;
