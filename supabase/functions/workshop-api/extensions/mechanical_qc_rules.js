// Pure draft QC rules; only the separately gated Mechanical QC boundary uses them.
import {extensionCommandPreflight} from './command_contracts.js';
import {mechanicalCommandFingerprint} from './mechanical_rules.js';
import {qcWork,qcStatus} from '../qc_delivery_rules.js';
export const MECHANICAL_QC_OWNER_DECISIONS=Object.freeze({mechanicalApproverId:'SUP003',mechanicalOnlyMode:'SOLE_MECHANICAL_APPROVER',mixedPaintingApproverId:'SUP002',mixedFinalApproverId:'SUP001',mixedMechanicalRequired:null});
const clone=x=>JSON.parse(JSON.stringify(x)),key=x=>String(x??'').trim().toUpperCase(),fail=code=>({ok:false,code});
export function mechanicalQcEvaluation(data,records,jobCard,policy,approval=null){
 if(!policy?.mechanicalDepartment||policy.qc?.mechanicalApproverId!=='SUP003'||policy.qc?.mechanicalOnlyMode!=='SOLE_MECHANICAL_APPROVER'||policy.qc?.mixedPaintingApproverId!=='SUP002'||policy.qc?.mixedFinalApproverId!=='SUP001')return fail('mechanical_qc_policy_required');
 if(!data||!records||!['checklists','tasks','links'].every(k=>Array.isArray(records[k])))return fail('mechanical_qc_records_required');
 if(!['users','assign','sessions','jobs'].every(k=>Array.isArray(data[k]))||['checklists','tasks','links'].some(k=>records[k].some(x=>!x||typeof x!=='object'||Array.isArray(x))))return fail('mechanical_qc_records_required');
 const no=key(jobCard),job=(data.jobs||[]).find(j=>key(j?.no)===no);
 if(!job||job.deleted||job.archived||job.cancelled||key(job.status)==='CANCELLED'||no==='ID001')return fail('job_not_available');
 const checklists=records.checklists.filter(c=>key(c?.manualJobCard?.number)===no);if(checklists.length!==1)return fail('mechanical_checklist_required');
 const checklist=checklists[0],tasks=records.tasks.filter(t=>t.checklistId===checklist.id),taskIds=new Set(tasks.map(t=>t.id));
 const links=records.links.filter(l=>taskIds.has(l.taskId));
 if(tasks.length>100||links.length>500||taskIds.size!==tasks.length||new Set(links.map(l=>l.assignmentId)).size!==links.length)return fail('mechanical_qc_context_limit');
 const assignments=(data.assign||[]).filter(a=>a&&key(a.job)===no),byId=new Map(assignments.map(a=>[a.id,a]));
 if(byId.size!==assignments.length)return fail('mechanical_qc_scope_review');
 for(const l of links){const a=byId.get(l.assignmentId);if(!a||a.emp!==l.employeeId||a.mechanicalTaskId!==l.taskId||a.mechanicalChecklistId!==checklist.id||String(a.handedOverToAssignmentId||'')!==String(l.handedOverTo||''))return fail('mechanical_qc_scope_review')}
 for(const a of assignments)if(a.mechanicalChecklistId===checklist.id&&!links.some(l=>l.assignmentId===a.id))return fail('mechanical_qc_scope_review');
 const users=new Map((data.users||[]).map(u=>[u?.id,u]));let mixed=false;
 for(const a of assignments.filter(a=>!a.cancelled)){
  const department=policy.employeeDepartments?.[a.emp]??users.get(a.emp)?.department;
  if(typeof department!=='string'||!department.trim())return fail('mechanical_qc_department_review');
  if(department!==policy.mechanicalDepartment)mixed=true;
 }
 if(mixed&&typeof policy.qc.mixedMechanicalRequired!=='boolean')return fail('mechanical_mixed_qc_policy_required');
 const taskComplete=tasks.length>0&&tasks.every(t=>{const terminal=links.filter(l=>l.taskId===t.id&&!l.handedOverTo).map(l=>byId.get(l.assignmentId)).filter(a=>a&&!a.cancelled);return terminal.length>0&&terminal.every(a=>a.completed===true)});
 const work=qcWork(data,job.no),workComplete=taskComplete&&work.complete;
 const definitions=tasks.map(t=>[t.id,t.title]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
 const allocations=links.map(l=>[l.taskId,l.assignmentId,l.employeeId,l.handedOverTo||'']).sort((a,b)=>String(a[1]).localeCompare(String(b[1])));
 const route=mixed?'MIXED':'MECHANICAL_ONLY';
 // In-memory work token only; persistence must hash it and bind to revisions.
 const fingerprint=JSON.stringify([checklist.id,route,mixed?policy.qc.mixedMechanicalRequired:true,definitions,allocations,work.fingerprint]);
 const mechanicalPassed=workComplete&&approval?.by==='SUP003'&&approval.result==='PASS'&&approval.fingerprint===fingerprint;
 const legacy=qcStatus(data,job),legacyChecksPassed=!mixed||(legacy.painting&&legacy.final&&job.qcWorkflow?.painting?.by==='SUP002'&&job.qcWorkflow?.final?.by==='SUP001');
 const mechanicalRequired=!mixed||policy.qc.mixedMechanicalRequired;
 return {ok:true,checklistId:checklist.id,jobCard:job.no,route,workComplete,fingerprint,mechanicalPassed,mechanicalRequired,legacyChecksPassed,delivered:job.delivered===true,deliveryReady:workComplete&&(!mechanicalRequired||mechanicalPassed)&&legacyChecksPassed&&!job.delivered};
}
export async function mechanicalQcProposal(records,snapshot,command,context,policy,at=Date.now()){
 const access=extensionCommandPreflight(command,context,policy);if(!access.ok)return access;
 if(command.operation!=='MECHANICAL_QC')return fail('mechanical_qc_operation_required');
 if(Object.keys(command).some(k=>!['operation','requestId','entityId','actorId','deviceId','expectedRevision','expectedWorkshopRevision','payload'].includes(k)))return fail('invalid_command');
 if(!records||!Array.isArray(records.receipts))return fail('mechanical_qc_records_required');
 if(context.actor.id!=='SUP003'||!['Supervisor','Mechanical Supervisor'].includes(context.actor.role))return fail('mechanical_qc_approver_required');
 const fingerprint=await mechanicalCommandFingerprint(command),prior=(records.receipts||[]).find(r=>r.requestId===command.requestId);
 if(prior)return prior.actorId===context.actor.id&&prior.fingerprint===fingerprint?{ok:true,duplicate:true,event:clone(prior.event),requiresReadinessRefresh:true}:fail('mechanical_request_reused');
 if(!Number.isSafeInteger(records.revision)||records.revision<0||records.revision>=Number.MAX_SAFE_INTEGER||!Number.isSafeInteger(snapshot?.revision)||snapshot.revision<0||!Number.isSafeInteger(command.expectedWorkshopRevision)||command.expectedWorkshopRevision<0)return fail('invalid_revision');
 if(records.revision!==command.expectedRevision)return fail('mechanical_revision_conflict');
 if(snapshot.revision!==command.expectedWorkshopRevision)return fail('workshop_revision_conflict');
 const p=command.payload;if(!p||Object.keys(p).some(k=>!['result','reason','expectedFingerprint'].includes(k))||!['PASS','FAIL'].includes(p.result)||typeof p.reason!=='string'||p.reason.length>500||(p.result==='FAIL'&&!p.reason.trim()))return fail('invalid_mechanical_qc');
 if(!Number.isSafeInteger(at)||at<=0)return fail('invalid_server_time');
 const checklist=records.checklists.find(c=>c.id===command.entityId);if(!checklist)return fail('mechanical_checklist_required');
 const status=mechanicalQcEvaluation(snapshot.data,records,checklist.manualJobCard.number,policy);
 if(!status.ok)return status;if(status.delivered)return fail('already_delivered');if(!status.workComplete)return fail('mechanical_work_not_finished');
 if(status.route==='MIXED'&&!status.mechanicalRequired)return fail('mechanical_mixed_qc_not_required');
 if(p.expectedFingerprint!==status.fingerprint)return fail('mechanical_qc_work_changed');
 const event={id:command.requestId,by:context.actor.id,at,checklistId:checklist.id,jobCard:status.jobCard,result:p.result,reason:p.reason.trim(),fingerprint:status.fingerprint,route:status.route};
 const next=clone(records);next.revision++;next.qcEvents=[...(next.qcEvents||[]),event];
 const evaluated=mechanicalQcEvaluation(snapshot.data,next,status.jobCard,policy,event);
 next.receipts=[...(next.receipts||[]),{requestId:command.requestId,actorId:context.actor.id,fingerprint,event,status:evaluated}];
 return {ok:true,records:next,event,status:evaluated};
}
