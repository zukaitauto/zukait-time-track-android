import {mechanicalPeriods} from './mechanical_report_periods.js';
const DAY=86400000,OMAN=14400000,fail=code=>({ok:false,code}),key=v=>String(v??'').trim().toUpperCase();
export function reportDay(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;const n=Date.parse(v+'T00:00:00+04:00');return Number.isFinite(n)&&new Date(n+OMAN).toISOString().slice(0,10)===v?n:null}
const union=rows=>{let total=0,start=null,end=null;for(const r of rows.slice().sort((a,b)=>a.start-b.start||a.end-b.end)){if(start===null){start=r.start;end=r.end}else if(r.start<=end)end=Math.max(end,r.end);else{total+=end-start;start=r.start;end=r.end}}return (total+(start===null?0:end-start))/60000};
export function mechanicalTaskReport(context,filters){
 const from=reportDay(filters.from),to=reportDay(filters.to);if(from===null||to===null||to<from||to-from>=31*DAY||typeof(filters.employeeId??'')!=='string'||String(filters.employeeId??'').length>128)return fail('invalid_mechanical_report');
 const {records,snapshot,asOf}=context||{},data=snapshot?.data,c=records?.checklists?.[0];
 if(!c||!data||!Number.isSafeInteger(asOf)||asOf<=0||!Number.isSafeInteger(records.revision)||!Number.isSafeInteger(snapshot.revision)||key(c.manualJobCard?.number)==='ID001')return fail('mechanical_report_scope_review');
 const jc=c.manualJobCard.number,jobs=(data.jobs||[]).filter(j=>j.no===jc),tasks=records.tasks||[],links=records.links||[],assign=data.assign||[],sessions=(data.sessions||[]).filter(s=>!filters.employeeId||s.emp===filters.employeeId);
 if(jobs.length!==1||tasks.some(t=>t.checklistId!==c.id)||tasks.length>100||links.length>500||assign.length>500||sessions.length>10000||sessions.some(s=>s.pauseOverflow)||(sessions.reduce((n,s)=>n+(Array.isArray(s.pauses)?s.pauses.length:0),0)>20000))return fail('mechanical_report_limit');
 const taskMap=new Map(tasks.map(t=>[t.id,t])),byId=new Map(assign.map(a=>[a.id,a])),people=new Map((data.users||[]).map(u=>[u.id,u])),employeeIds=new Set(links.map(l=>l.employeeId)),linkMap=new Map(links.map(l=>[l.assignmentId,l]));
 if(taskMap.size!==tasks.length||byId.size!==assign.length||linkMap.size!==links.length)return fail('mechanical_report_scope_review');
 if(filters.employeeId&&!employeeIds.has(filters.employeeId))return fail('invalid_mechanical_report');
 const selected=links.filter(l=>!filters.employeeId||l.employeeId===filters.employeeId),selectedIds=new Set(selected.map(l=>l.assignmentId)),selectedEmployees=new Set(selected.map(l=>l.employeeId)),candidates=new Map();
 for(const a of assign)if(!a.cancelled&&a.job===jc){const k=String(a.emp);if(!candidates.has(k))candidates.set(k,[]);candidates.get(k).push(a)}
 const warnings={ambiguous:0,invalid:0,duplicateConflicts:0,preliminaryExcluded:0,unlinkedExcluded:0,overlap:0,systemReview:0},attention=new Set(),buckets=new Map(selected.map(l=>[l.assignmentId,[]])),seen=new Map(),conflicts=new Set();
 const affect=emp=>{for(const l of selected)if(l.employeeId===emp)attention.add(l.assignmentId)};
 for(const s of sessions){if(!selectedEmployees.has(s.emp)||s.cancelled||s.voided||s.deleted)continue;const id=String(s.id||'');if(!id){warnings.invalid++;affect(s.emp);continue}const value=JSON.stringify([s.emp,s.job,s.assignmentId,s.start,s.end,s.cancelled,s.voided,s.deleted,s.preliminaryLinkedJob,s.pauses]);if(seen.has(id)&&seen.get(id).value!==value){conflicts.add(id);affect(s.emp);affect(seen.get(id).s.emp)}else if(!seen.has(id))seen.set(id,{value,s})}
 warnings.duplicateConflicts=conflicts.size;
 for(const [id,{s}]of seen){if(conflicts.has(id)||s.cancelled||s.voided||s.deleted)continue;
  if(s.preliminaryLinkedJob){warnings.preliminaryExcluded++;continue}if(key(s.job)!==key(jc))continue;
  let owner=s.assignmentId;if(!owner){const list=candidates.get(s.emp)||[];if(!list.length){warnings.unlinkedExcluded++;continue}if(list.length!==1){if(Number(s.start)<to+DAY&&Number(s.end||asOf)>from){warnings.ambiguous++;affect(s.emp)}continue}owner=list[0].id}
  if(!selectedIds.has(owner)){warnings.unlinkedExcluded++;continue}const a=byId.get(owner);if(!a||a.emp!==s.emp){warnings.invalid++;affect(s.emp);continue}buckets.get(owner).push({...s,assignmentId:owner});
 }
 const rows=[],allPeriods=[],employeePeriods=new Map();
 for(const l of selected){const a=byId.get(l.assignmentId),t=taskMap.get(l.taskId),u=people.get(l.employeeId);
  if(!a||!t||!u||a.emp!==l.employeeId||a.job!==jc||a.mechanicalTaskId!==t.id||a.mechanicalChecklistId!==c.id)return fail('mechanical_report_scope_review');
  const p=mechanicalPeriods({assign:[a],sessions:buckets.get(a.id)||[]},jc,a.emp,asOf,{assignmentId:a.id});if(p.invalid){warnings.invalid+=p.invalid;attention.add(a.id)}
  const periods=p.rows.map(r=>({...r,start:Math.max(r.start,from),end:Math.min(r.end,to+DAY)})).filter(r=>r.end>r.start);if(periods.some(r=>r.integrity)||(buckets.get(a.id)||[]).some(s=>s.reconciledOverlap&&Number(s.start)<to+DAY&&Number(s.end||asOf)>from)){warnings.systemReview++;attention.add(a.id)}for(const r of periods){const v={start:r.start,end:r.end,assignmentId:a.id};allPeriods.push(v);if(!employeePeriods.has(a.emp))employeePeriods.set(a.emp,[]);employeePeriods.get(a.emp).push(v)}
  if(!periods.length&&!attention.has(a.id))continue;
  rows.push({assignmentId:a.id,taskId:t.id,task:String(t.title||''),employeeId:a.emp,employee:String(u.name||u.id),status:l.handedOverTo?'Handed over':a.cancelled?'Cancelled':a.completed?'Completed':'Open',repeat:a.rework===true,allocationMinutes:Number.isSafeInteger(a.suggested)&&a.suggested>=0&&a.suggested<=60000?a.suggested:null,recordedMinutes:union(periods),knownMinutes:union(periods),review:false});
 }
 for(const periods of employeePeriods.values()){const sorted=periods.slice().sort((a,b)=>a.start-b.start);let prior=null;for(const p of sorted){if(prior&&p.start<prior.end){warnings.overlap++;attention.add(p.assignmentId);attention.add(prior.assignmentId)}if(!prior||p.end>prior.end)prior=p}}
 for(const row of rows)if(attention.has(row.assignmentId)){row.recordedMinutes=null;row.review=true}
 if(rows.length>100)return fail('mechanical_report_limit');
 if(rows.some(r=>r.task.length>200||r.employee.length>128))return fail('mechanical_report_scope_review');
 const employees=[...employeeIds].map(id=>({id,name:String(people.get(id)?.name||id)})),complete=!warnings.ambiguous&&!warnings.invalid&&!warnings.duplicateConflicts&&!warnings.overlap&&!warnings.systemReview;
 const knownMinutes=[...employeePeriods.values()].reduce((n,p)=>n+union(p),0);
 return {ok:true,schema:'zukait-mechanical-task-report-v1',checklistId:c.id,number:c.number,jobCard:jc,recordsRevision:records.revision,workshopRevision:snapshot.revision,asOf,filters:{from:filters.from,to:filters.to,employeeId:filters.employeeId||''},employees,rows,warnings,summary:{originalMinutes:complete?rows.filter(r=>!r.repeat).reduce((n,r)=>n+r.recordedMinutes,0):null,repeatMinutes:complete?rows.filter(r=>r.repeat).reduce((n,r)=>n+r.recordedMinutes,0):null,recordedMinutes:complete?knownMinutes:null,knownMinutes,activeClockMinutes:union(allPeriods),matchedAssignments:rows.length,checklistTasks:tasks.length,complete},rule:'RECORDED_TASK_TIME_PAUSES_EXCLUDED_INCLUDES_OVERTIME'};
}
export async function mechanicalReportApi(input,server={}){
 if(server.enabled!==true||server.reportsEnabled!==true)return fail('mechanical_reports_disabled');
 if(!input||Object.keys(input).some(k=>!['checklistId','from','to','employeeId'].includes(k)))return fail('invalid_mechanical_report');
 const from=reportDay(input.from),to=reportDay(input.to);if(from===null||to===null||to<from||to-from>=31*DAY||typeof(input.employeeId??'')!=='string'||String(input.employeeId??'').length>128)return fail('invalid_mechanical_report');
 if(typeof server.readContext!=='function'||typeof server.verifyCurrent!=='function')return fail('mechanical_report_adapter_required');
 const actor=await server.verifySession?.();if(!actor||actor.id!==server.actor?.id||actor.active!==true||!['Manager','Supervisor','Mechanical Supervisor'].includes(actor.role))return fail('mechanical_report_forbidden');
 const ctx=await server.readContext(input.checklistId);if(ctx?.records?.checklists?.[0]?.id!==input.checklistId)return fail('mechanical_report_scope_review');
 const result=mechanicalTaskReport(ctx,input);if(!result.ok)return result;
 const current=await server.verifySession();if(!current||current.id!==actor.id||current.role!==actor.role||current.active!==true)return fail('session_changed');
 if(await server.verifyCurrent({recordsRevision:result.recordsRevision,workshopRevision:result.workshopRevision})!==true)return fail('mechanical_report_changed');return result;
}
