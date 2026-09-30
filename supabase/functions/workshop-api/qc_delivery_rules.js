// Shared pure rules: the server owns every QC/delivery write.
const key=v=>String(v??'').trim().toUpperCase();
export function qcWork(data,no){
 const assignments=(data.assign||[]).filter(a=>a&&!a.cancelled&&key(a.job)===key(no));
 const sessions=(data.sessions||[]).filter(s=>s&&!s.cancelled&&key(s.job)===key(no));
 return {complete:assignments.length>0&&assignments.every(a=>a.completed===true)&&!sessions.some(s=>!s.end),fingerprint:JSON.stringify([assignments.map(a=>[a.id,a.emp,!!a.completed,a.completedAt||0,!!a.rework]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),sessions.map(s=>[s.id,s.start,s.end||0,!!s.paused]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))])};
}
export function qcStatus(data,job){
 const work=qcWork(data,job.no),qc=job.qcWorkflow||{},valid=work.complete&&qc.fingerprint===work.fingerprint;
 const painting=valid&&qc.painting?.result==='PASS',final=painting&&qc.final?.result==='PASS';
 return {workComplete:work.complete,painting,final,deliveryReady:final&&!job.delivered,stage:!work.complete?'WORK_PENDING':!painting?'PAINTING_QC':!final?'FINAL_QC':job.delivered?'DELIVERED':'DELIVERY'};
}
export function qcTransition(data,user,request,now){
 const candidate=JSON.parse(JSON.stringify(data)),job=(candidate.jobs||[]).find(j=>key(j?.no)===key(request.jobCard));
 const error=code=>({ok:false,code});
 if(!job||key(job.no)==='ID001'||job.deleted||job.archived)return error('job_not_available');
 const op=request.operation,id=String(user.id||'');
 if(user.role!=='Supervisor'||(op==='PAINTING_QC'&&id!=='SUP002')||(op==='FINAL_QC'&&id!=='SUP001'))return error('qc_permission_denied');
 if(!['PAINTING_QC','FINAL_QC','DELIVER'].includes(op))return error('bad_qc_operation');
 if(job.delivered)return error('already_delivered');
 const work=qcWork(candidate,job.no);if(!work.complete)return error('work_not_finished');
 const status=qcStatus(candidate,job),revision=Number(job.qcWorkflow?.revision||0);
 if(Number(request.expectedQcRevision)!==revision)return error('qc_conflict');
 const audit={operation:op,by:id,name:user.name,at:now};
 if(op==='DELIVER'){
  if(!status.deliveryReady)return error('both_qc_required');
  job.delivered=true;job.deliveredAt=now;job.deliveredBy=id;job.deliveredByName=user.name;job.status='Delivered';
 }else{
  if(!['PASS','FAIL'].includes(request.result))return error('bad_qc_result');
  const reason=String(request.reason||'').trim();if(request.result==='FAIL'&&!reason)return error('qc_failure_reason_required');
  if(reason.length>2000)return error('qc_reason_too_long');
  if(op==='FINAL_QC'&&!status.painting)return error('painting_qc_required');
  const old=job.qcWorkflow||{},qc=old.fingerprint===work.fingerprint?old:{revision,history:old.history||[]};
  qc.fingerprint=work.fingerprint;
  const event={result:request.result,reason,by:id,name:user.name,at:now};
  if(op==='PAINTING_QC'){qc.painting=event;delete qc.final}else qc.final=event;
  job.qcWorkflow=qc;Object.assign(audit,{result:request.result,reason});
 }
 job.qcWorkflow.revision=revision+1;job.qcWorkflow.history=[...(job.qcWorkflow.history||[]),audit];
 job.qcPassed=qcStatus(candidate,job).final;
 return {ok:true,data:candidate,job};
}
export function preserveQcAuthority(candidate,current){
 const oldJobs=new Map((current.jobs||[]).map(j=>[key(j?.no),j]));
 for(const j of candidate.jobs||[]){const old=oldJobs.get(key(j?.no));if(!j)continue;
  if(old?.qcWorkflow)j.qcWorkflow=JSON.parse(JSON.stringify(old.qcWorkflow));else delete j.qcWorkflow;
  // Legacy full-state clients cannot fabricate delivery or undo an audited delivery.
  if((!old?.delivered&&j.delivered)||old?.qcWorkflow){for(const field of ['delivered','deliveredAt','deliveredBy','deliveredByName']){if(old&&field in old)j[field]=old[field];else delete j[field]}if(old?.qcWorkflow&&old.delivered)j.status=old.status;else if(j.status==='Delivered'&&!old?.delivered)j.status=old?.status||'Open';}
  if(j.qcWorkflow)j.qcPassed=qcStatus(candidate,j).final;
 }
 return candidate;
}
