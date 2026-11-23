// Pure draft. Match existing repeat-cycle fields; never move original periods.
const fail=code=>({ok:false,code}),uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function mechanicalRepeat(records,snapshot,command,context,policy,at){
 if(policy.repeatEnabled!==true)return fail('mechanical_repeat_disabled');
 const p=command.payload;if(!p||Object.keys(p).some(k=>!['sourceAssignmentId','employeeId','mistakeEmployeeId','assignmentId','suggestedMinutes','reason'].includes(k))||!uuid(p.sourceAssignmentId)||!uuid(p.assignmentId)||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500||!Number.isSafeInteger(p.suggestedMinutes)||p.suggestedMinutes<1||p.suggestedMinutes>60000)return fail('invalid_repeat');
 const task=records.tasks.find(t=>t.id===command.entityId),checklist=records.checklists.find(c=>c.id===task?.checklistId),data=snapshot.data,no=checklist?.manualJobCard?.number;
 const job=data.jobs.find(j=>j.no===no);if(!task||!checklist||!job||job.delivered||job.cancelled||job.deleted||job.archived||String(job.status).toUpperCase()==='CANCELLED'||no==='ID001')return fail('task_inactive');
 const assignments=data.assign.filter(a=>a.job===no),live=assignments.filter(a=>!a.cancelled),byId=new Map(assignments.map(a=>[a.id,a])),tasks=records.tasks.filter(t=>t.checklistId===checklist.id),taskIds=new Set(tasks.map(t=>t.id)),links=records.links.filter(l=>taskIds.has(l.taskId));
 if(tasks.length>100||links.length>500||assignments.length>500||data.sessions.length>10000||byId.size!==assignments.length)return fail('mechanical_context_limit');
 const source=byId.get(p.sourceAssignmentId),sourceLink=links.find(l=>l.assignmentId===source?.id&&l.taskId===task.id&&!l.handedOverTo);
 if(!source||!sourceLink||source.cancelled||source.completed!==true||source.mechanicalTaskId!==task.id||source.mechanicalChecklistId!==checklist.id||source.emp!==sourceLink.employeeId)return fail('repeat_source_inactive');
 if(!live.some(a=>!a.rework)||live.some(a=>a.completed!==true)||data.sessions.some(s=>s.job===no&&!s.cancelled&&!s.voided&&!s.deleted&&(!s.end||s.end==='null')))return fail('repeat_work_not_finished');
 for(const t of tasks){const terminal=links.filter(l=>l.taskId===t.id&&!l.handedOverTo).map(l=>byId.get(l.assignmentId)).filter(a=>a&&!a.cancelled);if(!terminal.length||terminal.some(a=>!a.completed))return fail('repeat_work_not_finished')}
 const target=data.users.find(u=>u.id===p.employeeId&&u.role==='Employee'&&u.active!==false&&u.department===policy.mechanicalDepartment),mistake=data.users.find(u=>u.id===p.mistakeEmployeeId&&u.role==='Employee');
 if(!target||!mistake)return fail('invalid_repeat_employee');if(data.assign.some(a=>a.id===p.assignmentId))return fail('assignment_id_exists');
 const existing=live.filter(a=>a.rework),max=existing.reduce((m,a)=>Math.max(m,Number(a.repeatCycleNo)||0),0),cycleNo=(max||existing.length)+1;
 if(!Number.isSafeInteger(cycleNo)||cycleNo<1)return fail('repeat_cycle_review_required');
 const cycleId='repeat-'+no+'-'+command.requestId;
 const assignment={id:p.assignmentId,job:no,emp:target.id,suggested:p.suggestedMinutes,completed:false,cancelled:false,rework:true,repeatCycleId:cycleId,repeatCycleNo:cycleNo,repeatReason:p.reason.trim(),mistakeEmp:mistake.id,repeatSameEmployee:target.id===mistake.id,v125Cycle:true,assignedBy:context.actor.id,assignedAt:at,mechanicalChecklistId:checklist.id,mechanicalTaskId:task.id,mechanicalRepeatOfAssignmentId:source.id};
 const log={id:command.requestId,assignmentId:assignment.id,repeatCycleId:cycleId,repeatCycleNo:cycleNo,job:no,emp:target.id,mistakeEmp:mistake.id,suggested:p.suggestedMinutes,reason:p.reason.trim(),by:context.actor.id,at};
 return {ok:true,source,assignment,log};
}
