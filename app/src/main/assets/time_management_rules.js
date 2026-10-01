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
