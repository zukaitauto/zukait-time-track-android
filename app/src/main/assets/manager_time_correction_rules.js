export function managerCorrectionSessionToken(session){
 return session?JSON.stringify([String(session.id),String(session.assignmentId||''),String(session.job||''),String(session.emp||''),Number(session.start)||0,Number(session.end)||0,!!session.paused]):null;
}
export function managerTimeCorrectionTransition(current,actor,request,at=Date.now()){
 const fail=code=>({ok:false,code});
 if(!actor||actor.role!=='Manager')return fail('manager_time_permission_denied');
 request=request||{};
 const id=String(request.requestId||''),reason=String(request.reason||'').trim(),assignmentId=String(request.assignmentId||''),startAt=Number(request.startAt);
 if(!/^mtc-[a-zA-Z0-9-]{16,100}$/.test(id)||!assignmentId||!Number.isSafeInteger(startAt)||startAt<=0||startAt>at||at-startAt>16*60*60*1000)return fail('manager_time_invalid');
 if(!reason||reason.length>500)return fail('manager_time_reason_required');
 const command={assignmentId,startAt,reason};
 const prior=(current.additionalActions||[]).find(x=>x&&x.id===id);
 if(prior)return prior.by===actor.id&&JSON.stringify(prior.command)===JSON.stringify(command)?{ok:true,data:current,audit:prior,duplicate:true}:fail('manager_time_request_reused');
 const a=(current.assign||[]).find(x=>x&&String(x.id)===assignmentId);
 if(!a||a.completed||a.cancelled||a.rework||String(a.job).toUpperCase()==='ID001')return fail('manager_time_assignment_inactive');
 const j=(current.jobs||[]).find(x=>x&&String(x.no)===String(a.job));
 if(!j||j.delivered||j.archived||j.deleted)return fail('manager_time_job_inactive');
 const employee=(current.users||[]).find(x=>x&&String(x.id)===String(a.emp)&&x.role==='Employee'&&x.active!==false);
 if(!employee)return fail('manager_time_employee_inactive');
 const sessions=(current.sessions||[]).filter(s=>s&&String(s.emp)===String(a.emp));
 const open=sessions.filter(s=>!Number(s.end||0));
 if(open.length>1)return fail('manager_time_multiple_open_sessions');
 let target=open[0]||null;
 if(target&&(String(target.assignmentId||'')!==assignmentId||String(target.job)!==String(a.job)))return fail('manager_time_other_job_running');
 if(managerCorrectionSessionToken(target)!==(request.expectedSessionToken??null))return fail('manager_time_session_changed');
 for(const s of sessions){
  if(target&&String(s.id)===String(target.id))continue;
  const ss=Number(s.start),se=Math.min(Number(s.end)||at,at);
  if(Number.isFinite(ss)&&ss<at&&se>startAt)return fail('manager_time_overlap');
 }
 const data=JSON.parse(JSON.stringify(current));
 let session=null;
 if(target){
  session=data.sessions.find(s=>String(s.id)===String(target.id));
  session.start=startAt;session.paused=false;session.managerStartCorrectedAt=at;session.managerStartCorrectedBy=actor.id;
 }else{
  const sessionId=id+'-session';
  if(data.sessions.some(s=>s&&String(s.id)===sessionId))return fail('manager_time_request_reused');
  session={id:sessionId,assignmentId:a.id,job:a.job,emp:a.emp,start:startAt,paused:false,managerStartCorrectedAt:at,managerStartCorrectedBy:actor.id};
  data.sessions.push(session);
 }
 const audit={id,type:'Manager Start Time Correction',command,assignmentId:a.id,job:a.job,emp:a.emp,sessionId:session.id,oldStart:target?Number(target.start)||0:null,newStart:startAt,sessionCreated:!target,reason,by:actor.id,at,source:'Manager Time Correction'};
 data.additionalActions=Array.isArray(data.additionalActions)?data.additionalActions:[];data.additionalActions.push(audit);
 return {ok:true,data,audit,duplicate:false};
}
