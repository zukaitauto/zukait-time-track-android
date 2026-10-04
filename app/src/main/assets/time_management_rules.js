// Shared server and client rules. Split changes allocations, never recorded sessions.
const DAY=86400000,OMAN=4*3600000;
export function allocationToken(a){return a?JSON.stringify([String(a.id),String(a.job),String(a.emp),Number(a.suggested)||0,!!a.completed,!!a.cancelled,!!a.rework,Number(a.assignedAt)||0,Number(a.timeManagementRevision)||0]):null}
export function workedMinutes(data,a,at=Date.now()){
 const holidays=new Set((data.workshopHolidays||[]).map(h=>String(typeof h==='object'?(h.date||h.dateKey||h.day||''):h).slice(0,10)));
 let total=0;const matched=new Map();
 for(const s of data.sessions||[]){
  if(!s||!s.id||String(s.emp)!==String(a.emp))continue;
  let owner=s.assignmentId;
  if(!owner){
   const candidates=(data.assign||[]).filter(x=>x&&!x.cancelled&&String(x.emp)===String(s.emp)&&String(x.job)===String(s.job)).slice().sort((x,y)=>(Number(x.assignedAt)||0)-(Number(y.assignedAt)||0));
   let chosen=candidates[0];for(const x of candidates){if((Number(x.assignedAt)||0)<=(Number(s.start)||0))chosen=x;else break}owner=chosen?.id;
  }
  if(String(owner)===String(a.id))matched.set(String(s.id),s);
 }
 for(const s of matched.values()){
  let cur=Number(s.start),end=Math.min(Number(s.end)||at,at);if(!Number.isFinite(cur)||cur<=0||end<=cur)continue;
  while(cur<end){const shifted=new Date(cur+OMAN),ds=Math.floor((cur+OMAN)/DAY)*DAY-OMAN,se=Math.min(end,ds+DAY),key=shifted.toISOString().slice(0,10);
   if(shifted.getUTCDay()!==5&&!holidays.has(key))for(const [from,to] of [[8,13],[15,19]])total+=Math.max(0,Math.min(se,ds+to*3600000)-Math.max(cur,ds+from*3600000))/60000;
   cur=se;
  }
 }
 return total;
}
export function timeManagementTransition(current,actor,request,at=Date.now()){
 const fail=code=>({ok:false,code});
 if(!actor||!['Manager','Supervisor'].includes(actor.role))return fail('time_permission_denied');
 request=request||{};
 // Preserve the deployed correction contract used by older clients.
 if(request.operation==='CORRECT_SESSION'&&request.expectedSessions===undefined&&'startAt' in request){
  const id=String(request.requestId||''),reason=String(request.reason||'').trim();
  if(!/^tm-[a-zA-Z0-9-]{16,100}$/.test(id))return fail('invalid_time_change');
  if(!reason||reason.length>500)return fail('time_reason_required');
  return correctWorkTime(current,actor,request,at,id,reason);
 }
 if(['CORRECT_SESSION','ADD_SESSION','CANCEL_SESSION','CANCEL_ASSIGNMENT','REOPEN','REASSIGN','SET_ALLOCATION'].includes(request.operation))return managerTimeTransition(current,actor,request,at);
 const op=String(request.operation||''),reason=String(request.reason||'').trim(),minutes=Number(request.minutes),id=String(request.requestId||'');
 if(!['ADD','REDUCE','SPLIT'].includes(op)||!Number.isSafeInteger(minutes)||minutes<1||minutes>60000||!/^tm-[a-zA-Z0-9-]{16,100}$/.test(id))return fail('invalid_time_change');
 if(!reason||reason.length>500)return fail('time_reason_required');
 const command={operation:op,minutes,reason,assignmentId:String(request.assignmentId||''),targetEmployeeId:op==='SPLIT'?String(request.targetEmployeeId||''):''};
 const prior=(current.additionalActions||[]).find(x=>x&&x.id===id);
 if(prior)return prior.by===actor.id&&JSON.stringify(prior.command)===JSON.stringify(command)?{ok:true,data:current,audit:prior,duplicate:true}:fail('time_request_reused');
 const a=(current.assign||[]).find(x=>x&&String(x.id)===command.assignmentId);
 if(!a||a.completed||a.cancelled||a.rework||String(a.job).toUpperCase()==='ID001')return fail('time_assignment_inactive');
 const j=(current.jobs||[]).find(x=>x&&String(x.no)===String(a.job));
 if(!j||j.delivered||j.archived||j.deleted)return fail('time_job_inactive');
 if(allocationToken(a)!==request.expectedSource)return fail('time_allocation_changed');
 const old=Number(a.suggested)||0,worked=workedMinutes(current,a,at),next=op==='ADD'?old+minutes:old-minutes;
 if(next<0||!Number.isSafeInteger(next)||next>60000)return fail('invalid_time_change');
 let target=null,employee=null;
 if(op==='SPLIT'){
  if(minutes>Math.max(0,old-worked)+0.000001)return fail('split_exceeds_remaining');
  employee=(current.users||[]).find(u=>u&&String(u.id)===command.targetEmployeeId&&u.role==='Employee'&&u.active!==false);
  if(!employee||String(employee.id)===String(a.emp))return fail('split_technician_invalid');
  const targets=(current.assign||[]).filter(x=>x&&!x.cancelled&&!x.completed&&String(x.job)===String(a.job)&&String(x.emp)===String(employee.id));
  if(targets.length>1||targets.some(x=>x.rework))return fail('split_target_ambiguous');
  target=targets[0]||null;
  if(allocationToken(target)!==request.expectedTarget)return fail('time_target_changed');
  if((Number(target?.suggested)||0)+minutes>60000)return fail('invalid_time_change');
 }
 const data=JSON.parse(JSON.stringify(current)),source=data.assign.find(x=>String(x.id)===String(a.id));
 source.suggested=next;source.timeManagementRevision=(Number(a.timeManagementRevision)||0)+1;
 let recipient=null;
 if(op==='SPLIT'){
  if(target){recipient=data.assign.find(x=>String(x.id)===String(target.id));recipient.suggested=(Number(target.suggested)||0)+minutes;recipient.timeManagementRevision=(Number(target.timeManagementRevision)||0)+1}
  else{const targetId=id+'-assignment';if(data.assign.some(x=>String(x.id)===targetId))return fail('time_request_reused');recipient={id:targetId,job:a.job,emp:employee.id,suggested:minutes,completed:false,rework:false,assignedBy:actor.id,assignedAt:at,timeManagementRevision:1};data.assign.push(recipient)}
 }
 const audit={id,type:op==='SPLIT'?'Split Time':op==='ADD'?'Additional Time':'Reduced Time',command,assignmentId:a.id,job:a.job,emp:a.emp,minutes:op==='ADD'?minutes:0,changedMinutes:minutes,oldSuggested:old,newSuggested:next,workedAtChange:worked,reason,by:actor.id,at,source:'Time Management',targetEmp:recipient?.emp||null,targetAssignmentId:recipient?.id||null,targetOldSuggested:target?Number(target.suggested)||0:0,targetNewSuggested:recipient?.suggested??null};
 data.additionalActions=Array.isArray(data.additionalActions)?data.additionalActions:[];data.additionalActions.push(audit);
 data.suggestedEdits=Array.isArray(data.suggestedEdits)?data.suggestedEdits:[];
 data.suggestedEdits.push({id:id+'-source',assignmentId:a.id,job:a.job,emp:a.emp,old,newValue:next,by:actor.id,at,source:'Time Management',reason});
 if(recipient)data.suggestedEdits.push({id:id+'-target',assignmentId:recipient.id,job:a.job,emp:recipient.emp,old:audit.targetOldSuggested,newValue:recipient.suggested,by:actor.id,at,source:'Time Management',reason});
 return {ok:true,data,audit,duplicate:false};
}

// Manager corrections use the same revision-checked server commit as allocation changes.
export function employeeTimeToken(data,emp){return JSON.stringify((data.sessions||[]).filter(s=>s&&String(s.emp)===String(emp)).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id))))}
function sessionAssignmentId(data,s){
 if(s?.assignmentId)return String(s.assignmentId);
 const candidates=(data.assign||[]).filter(x=>x&&!x.cancelled&&String(x.emp)===String(s?.emp)&&String(x.job)===String(s?.job)).slice().sort((x,y)=>(Number(x.assignedAt)||0)-(Number(y.assignedAt)||0));
 let chosen=candidates[0];for(const x of candidates){if((Number(x.assignedAt)||0)<=(Number(s?.start)||0))chosen=x;else break}return String(chosen?.id||'');
}
function workSessionToken(s){return s?JSON.stringify([String(s.id||''),String(s.assignmentId||''),String(s.job||''),String(s.emp||''),Number(s.start)||0,s.end==null?null:Number(s.end),!!s.paused,!!s.finished,!!s.autoPausedAt,!!s.autoStopped]):null}
function correctWorkTime(current,actor,request,at,id,reason){
 const fail=code=>({ok:false,code});
 if(actor?.role!=='Manager')return fail('time_correction_manager_only');
 const assignmentId=String(request.assignmentId||''),sessionId=String(request.sessionId||''),start=Number(request.startAt),end=request.endAt==null||request.endAt===''?null:Number(request.endAt);
 const command={operation:'CORRECT_SESSION',assignmentId,sessionId,startAt:start,endAt:end,reason,expectedSource:request.expectedSource,expectedSession:request.expectedSession??null};
 const prior=(current.corrections||[]).find(x=>x&&String(x.id)===id);
 if(prior)return prior.by===actor.id&&JSON.stringify(prior.command)===JSON.stringify(command)?{ok:true,data:current,audit:prior,duplicate:true}:fail('time_request_reused');
 const a=(current.assign||[]).find(x=>x&&String(x.id)===assignmentId);
 if(!a||a.cancelled||String(a.job||'').toUpperCase()==='ID001')return fail('time_assignment_inactive');
 const j=(current.jobs||[]).find(x=>x&&String(x.no)===String(a.job));
 if(!j||j.archived||j.deleted)return fail('time_job_inactive');
 const employee=(current.users||[]).find(u=>u&&String(u.id)===String(a.emp)&&u.role==='Employee');
 if(!employee)return fail('time_employee_invalid');
 if(allocationToken(a)!==request.expectedSource)return fail('time_allocation_changed');
 if(!Number.isSafeInteger(start)||start<=0||start>at||!(end===null||(Number.isSafeInteger(end)&&end>start&&end<=at)))return fail('time_session_invalid');
 if(end===null&&a.completed)return fail('time_session_invalid');
 const existing=sessionId?(current.sessions||[]).find(s=>s&&String(s.id)===sessionId):null;
 if(sessionId&&!existing)return fail('time_session_changed');
 if(existing){
  if(sessionAssignmentId(current,existing)!==assignmentId||String(existing.emp)!==String(a.emp)||String(existing.job)!==String(a.job))return fail('time_session_changed');
  if(workSessionToken(existing)!==request.expectedSession)return fail('time_session_changed');
 }else if(sessionId||request.expectedSession!=null)return fail('time_session_changed');
 const effectiveEnd=end===null?at:end;
 for(const other of current.sessions||[]){
  if(!other||String(other.emp)!==String(a.emp)||String(other.id)===String(existing?.id||''))continue;
  const otherStart=Number(other.start)||0,otherEnd=Number(other.end)||at;
  if(otherStart<effectiveEnd&&otherEnd>start)return fail('time_session_overlap');
 }
 const data=JSON.parse(JSON.stringify(current)),target=data.assign.find(x=>String(x.id)===assignmentId),targetSessions=data.sessions=Array.isArray(data.sessions)?data.sessions:[];
 let session=existing?targetSessions.find(x=>String(x.id)===sessionId):null;
 const before=session?JSON.parse(JSON.stringify(session)):null;
 if(!session){session={id:'manager-time-'+id.slice(4),assignmentId,job:String(a.job),emp:String(a.emp),start,end:null,paused:false,finished:false,managerEntered:true};targetSessions.push(session)}
 session.assignmentId=assignmentId;session.job=String(a.job);session.emp=String(a.emp);session.start=start;session.end=end;
 if(!before){session.paused=end!==null&&!target.completed;session.finished=end!==null&&!!target.completed}
 else if(end===null){session.paused=false;session.finished=false}
 else if(before.end==null){session.paused=!target.completed;session.finished=!!target.completed}
 session.managerTimeUpdatedAt=at;session.managerTimeUpdatedBy=actor.id;
 const after=JSON.parse(JSON.stringify(session)),audit={id,type:before?'MANAGER_WORK_TIME_CORRECTED':'MANAGER_WORK_TIME_ADDED',session:session.id,assignmentId,job:String(a.job),emp:String(a.emp),oldStart:before?.start??null,oldEnd:before?.end??null,newStart:start,newEnd:end,reason,by:actor.id,byName:String(actor.name||actor.id),at,before,after,command};
 data.corrections=Array.isArray(data.corrections)?data.corrections:[];data.corrections.push(audit);
 return {ok:true,data,audit,duplicate:false};
}
export function managerTimeTransition(current,actor,request,at=Date.now()){
 const fail=code=>({ok:false,code}),copy=x=>JSON.parse(JSON.stringify(x));
 if(actor?.role!=='Manager')return fail('time_permission_denied');
 const op=String(request.operation||''),id=String(request.requestId||''),reason=String(request.reason||'').trim();
 if(!/^tm-[a-zA-Z0-9-]{16,100}$/.test(id))return fail('invalid_time_change');
 if(!reason||reason.length>500)return fail('time_reason_required');
 const command={operation:op,assignmentId:String(request.assignmentId||''),sessionId:String(request.sessionId||''),start:request.start??null,end:request.end??null,minutes:request.minutes??null,targetEmployeeId:String(request.targetEmployeeId||''),reason};
 const prior=(current.additionalActions||[]).find(x=>x?.id===id);
 if(prior)return prior.by===actor.id&&JSON.stringify(prior.command)===JSON.stringify(command)?{ok:true,data:current,audit:prior,duplicate:true}:fail('time_request_reused');
 const a=(current.assign||[]).find(x=>x&&String(x.id)===command.assignmentId);
 if(!a||a.cancelled)return fail('time_assignment_inactive');
 if(allocationToken(a)!==request.expectedSource)return fail('time_allocation_changed');
 if(employeeTimeToken(current,a.emp)!==request.expectedSessions)return fail('time_sessions_changed');
 const j=(current.jobs||[]).find(x=>x&&String(x.no)===String(a.job));
 if(!j||j.deleted)return fail('time_job_inactive');
 const belongs=s=>s&&String(s.emp)===String(a.emp)&&(s.assignmentId?String(s.assignmentId)===String(a.id):String(s.job)===String(a.job));
 const own=(current.sessions||[]).filter(belongs),s=op==='ADD_SESSION'?null:own.find(x=>String(x.id)===command.sessionId);
 const data=copy(current),row=data.assign.find(x=>String(x.id)===String(a.id));let before=copy(a),after=null;
 const running=own.some(x=>!x.end);
 if(['CORRECT_SESSION','ADD_SESSION','CANCEL_SESSION'].includes(op)){
  if(op!=='ADD_SESSION'&&(!s||!s.end||s.cancelled))return fail('time_session_inactive');
  before=s?copy(s):null;
  if(op==='CANCEL_SESSION'){
   // Zero the effective interval for legacy reports; retain the original in the row and audit.
   const dest=data.sessions.find(x=>String(x.id)===String(s.id));dest.originalTime=dest.originalTime||{start:s.start,end:s.end};dest.end=dest.start;dest.paused=false;dest.cancelled=true;dest.cancelledBy=actor.id;dest.cancelledAt=at;dest.cancelReason=reason;after=dest;
  }else{
   const start=Number(command.start),end=Number(command.end);
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<=0||end<=start||end>at||end-start>7*DAY)return fail('invalid_session_time');
   if((current.sessions||[]).some(x=>x&&!x.cancelled&&String(x.emp)===String(a.emp)&&String(x.id)!==String(s?.id)&&start<Number(x.end||at)&&end>Number(x.start)))return fail('time_session_overlap');
   if(op==='ADD_SESSION'){
    after={id:id+'-session',assignmentId:a.id,job:a.job,emp:a.emp,start,end,paused:true,pauseReason:'Manager added missing time',rework:!!a.rework,manual:true,createdBy:actor.id,createdAt:at};data.sessions=data.sessions||[];data.sessions.push(after);
   }else{after=data.sessions.find(x=>String(x.id)===String(s.id));after.start=start;after.end=end;}
  }
  after.managerTimeRevision=(Number(s?.managerTimeRevision)||0)+1;after.correctedBy=actor.id;after.correctedAt=at;
  data.corrections=data.corrections||[];data.corrections.push({id,session:after.id,assignmentId:a.id,operation:op,oldStart:before?.start??null,oldEnd:before?.end??null,newStart:after.start,newEnd:after.end,reason,by:actor.id,at});
 }else{
  if((op!=='CANCEL_ASSIGNMENT'&&(a.rework||String(a.job)==='ID001'))||j.delivered||j.archived)return fail('time_job_inactive');
  if(running)return fail('time_work_running');
  if(op==='CANCEL_ASSIGNMENT'){
   if(a.completed)return fail('time_assignment_inactive');
   row.cancelled=true;row.managerTimeCancellation=true;row.cancelledBy=actor.id;row.cancelledAt=at;row.cancelReason=reason;
   data.cancelledAssignments=data.cancelledAssignments||[];data.cancelledAssignments.push({id,assignmentId:a.id,job:a.job,from:a.emp,by:actor.id,at,reason});
  }else if(op==='SET_ALLOCATION'){
   const minutes=Number(command.minutes);if(!Number.isSafeInteger(minutes)||minutes<0||minutes>60000)return fail('invalid_time_change');row.suggested=minutes;
   data.suggestedEdits=data.suggestedEdits||[];data.suggestedEdits.push({id,assignmentId:a.id,job:a.job,emp:a.emp,old:a.suggested,newValue:minutes,reason,by:actor.id,at,source:'Manager Time Management'});
  }else if(op==='REOPEN'){
   if(!a.completed)return fail('time_assignment_inactive');
   if((current.assign||[]).some(x=>x&&x.id!==a.id&&!x.cancelled&&!x.completed&&x.job===a.job&&String(x.emp)===String(a.emp)))return fail('time_target_changed');
   row.completed=false;delete row.completedAt;row.reopened=true;row.lastReopenedAt=at;row.lastReopenedBy=actor.id;
   const jobRow=data.jobs.find(x=>String(x.no)===String(a.job));jobRow.status='Open';delete jobRow.completedAt;
   data.reopenLogs=data.reopenLogs||[];data.reopenLogs.push({id,assignmentId:a.id,job:a.job,emp:a.emp,suggested:a.suggested,actualAtReopen:workedMinutes(current,a,at),previousCompletedAt:a.completedAt,reason,by:actor.id,at});
  }else if(op==='REASSIGN'){
   if(a.completed||own.some(x=>!x.cancelled))return fail('time_reassign_work_logged');
   const emp=(current.users||[]).find(x=>x&&String(x.id)===command.targetEmployeeId&&x.role==='Employee'&&x.active!==false);
   if(!emp||String(emp.id)===String(a.emp))return fail('split_technician_invalid');
   if((current.assign||[]).some(x=>x&&!x.cancelled&&!x.completed&&x.job===a.job&&String(x.emp)===String(emp.id)))return fail('time_target_changed');
   row.cancelled=true;row.managerTimeCancellation=true;row.cancelledBy=actor.id;row.cancelledAt=at;row.cancelReason=reason;
   data.assign.push({id:id+'-assignment',job:a.job,emp:emp.id,suggested:a.suggested,completed:false,rework:false,assignedBy:actor.id,assignedAt:at,transferredFrom:a.id,timeManagementRevision:1});
   data.cancelledAssignments=data.cancelledAssignments||[];data.cancelledAssignments.push({id,assignmentId:a.id,job:a.job,from:a.emp,to:emp.id,by:actor.id,at,reason});
  }else return fail('invalid_time_change');
  row.timeManagementRevision=(Number(a.timeManagementRevision)||0)+1;after=row;
 }
 const labels={CORRECT_SESSION:'Time Correction',ADD_SESSION:'Add Missing Time',CANCEL_SESSION:'Cancel Time Entry',CANCEL_ASSIGNMENT:'Cancel Allotted Work',SET_ALLOCATION:'Edit Allocated Time',REOPEN:'Reopen Work',REASSIGN:'Reassign Work'};
 const audit={id,type:labels[op],command,managerTime:true,assignmentId:a.id,job:a.job,emp:a.emp,minutes:0,reason,by:actor.id,at,source:'Manager Time Management',before,after:copy(after)};
 data.additionalActions=data.additionalActions||[];data.additionalActions.push(audit);return{ok:true,data,audit,duplicate:false};
}
