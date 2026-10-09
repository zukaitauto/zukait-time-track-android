// Shared pure rules: the server owns every QC/delivery write.
const key=v=>String(v??'').trim().toUpperCase();
export function invoiceDateValid(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01')return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function invoiceComplete(job){return !!(job&&job.finalInvoiceAmount!==null&&job.finalInvoiceAmount!==undefined&&job.finalInvoiceAmount!==''&&Number.isFinite(Number(job.finalInvoiceAmount))&&Number(job.finalInvoiceAmount)>=0&&invoiceDateValid(job.invoiceDate));}
export function qcWork(data,no){
 const assignments=(data.assign||[]).filter(a=>a&&!a.cancelled&&key(a.job)===key(no));
 const sessions=(data.sessions||[]).filter(s=>s&&!s.cancelled&&key(s.job)===key(no));
 return {complete:assignments.length>0&&assignments.every(a=>a.completed===true)&&!sessions.some(s=>!s.end),fingerprint:JSON.stringify([assignments.map(a=>[a.id,a.emp,!!a.completed,a.completedAt||0,!!a.rework]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),sessions.map(s=>[s.id,s.start,s.end||0,!!s.paused]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))])};
}
export function qcStatus(data,job){
 const work=qcWork(data,job.no),qc=job.qcWorkflow||{},valid=work.complete&&qc.fingerprint===work.fingerprint;
 const painting=valid&&qc.painting?.result==='PASS',final=painting&&qc.final?.result==='PASS';
 return {workComplete:work.complete,painting,final,deliveryReady:final&&!job.delivered&&!job.cancelled&&key(job.status)!=='CANCELLED',stage:job.cancelled||key(job.status)==='CANCELLED'?'CANCELLED':!work.complete?'WORK_PENDING':!painting?'PAINTING_QC':!final?'FINAL_QC':job.delivered?'DELIVERED':'DELIVERY'};
}
export function qcTransition(data,user,request,now){
 const candidate=JSON.parse(JSON.stringify(data)),job=(candidate.jobs||[]).find(j=>key(j?.no)===key(request.jobCard));
 const error=code=>({ok:false,code});
 if(!job||key(job.no)==='ID001'||job.deleted||job.archived||job.cancelled||key(job.status)==='CANCELLED')return error('job_not_available');
 const op=request.operation,id=String(user.id||''),cash=String(job.jobType||'').toUpperCase()==='CASH';
 if(!['PAINTING_QC','FINAL_QC','DELIVER','CASH_AMOUNT_UPDATE','FINAL_INVOICE_CORRECTION','FINAL_INVOICE_ENTRY','DELIVERY_DATE_CORRECTION'].includes(op))return error('bad_qc_operation');
 if(op==='CASH_AMOUNT_UPDATE'){
  if(!['Supervisor','Manager'].includes(String(user.role||'')))return error('qc_permission_denied');
  if(job.delivered)return error('already_delivered');
  if(!cash)return error('cash_job_required');
  const amount=Number(request.amount);if(!Number.isFinite(amount)||amount<0||amount>1000000)return error('cash_amount_required');
  const revision=Number(job.qcWorkflow?.revision||0);if(Number(request.expectedQcRevision)!==revision)return error('qc_conflict');
  const from=Number(job.amount||0),to=Math.round(amount*1000)/1000,audit={operation:op,by:id,name:user.name,at:now,from,to};
  job.amount=to;job.financialAudit=[...(job.financialAudit||[]),audit];job.qcWorkflow={...(job.qcWorkflow||{}),revision:revision+1,history:[...(job.qcWorkflow?.history||[]),audit]};
  return {ok:true,data:candidate,job};
 }
 if(op==='DELIVERY_DATE_CORRECTION'){
  if(user.role!=='Manager')return error('manager_required');
  if(!job.delivered)return error('delivery_required');
  const reason=String(request.reason||'').trim();if(!reason)return error('delivery_date_reason_required');if(reason.length>2000)return error('reason_too_long');
  const to=Number(request.deliveredAt);if(!Number.isFinite(to)||to<=0)return error('delivery_date_required');
  const revision=Number(job.qcWorkflow?.revision||0);if(Number(request.expectedQcRevision)!==revision)return error('qc_conflict');
  const from=Number(job.deliveredAt||0);const audit={operation:'DELIVERY_DATE_CORRECTION',by:id,name:user.name,at:now,from,to,reason};
  job.deliveredAt=to;job.deliveryAudit=[...(job.deliveryAudit||[]),audit];job.qcWorkflow={...(job.qcWorkflow||{}),revision:revision+1,history:[...(job.qcWorkflow?.history||[]),audit]};
  return {ok:true,data:candidate,job};
 }
 if(op==='FINAL_INVOICE_ENTRY'){
  if(!['Supervisor','Manager'].includes(user.role))return error('qc_permission_denied');
  if(!job.delivered)return error('delivery_required');
  if(!['CASH','CREDIT','INSURANCE'].includes(key(job.jobType)))return error('invoice_job_type_required');
  if(invoiceComplete(job))return error('final_invoice_already_entered');
  if(!invoiceDateValid(request.invoiceDate))return error('invoice_date_required');
  const amount=Number(request.amount);if(request.amount==null||String(request.amount).trim()===''||!Number.isFinite(amount)||amount<0||amount>1000000)return error('final_invoice_amount_required');
  const reason=String(request.reason||'').trim(),to=Math.round(amount*1000)/1000,hasAmount=job.finalInvoiceAmount!==undefined&&job.finalInvoiceAmount!==null&&job.finalInvoiceAmount!=='';
  if(hasAmount&&Number(job.finalInvoiceAmount)!==to){if(user.role!=='Manager')return error('manager_required');if(!reason)return error('financial_correction_reason_required');}
  if(reason.length>2000)return error('qc_reason_too_long');
  const revision=Number(job.qcWorkflow?.revision||0);if(Number(request.expectedQcRevision)!==revision)return error('qc_conflict');
  const from=Number(job.finalInvoiceAmount??job.amount??0),audit={operation:op,by:id,name:user.name,at:now,from,to,fromDate:job.invoiceDate||'',toDate:request.invoiceDate,reason};
  if(cash)job.amount=to;job.finalInvoiceAmount=to;job.invoiceDate=request.invoiceDate;job.invoiceEnteredAt=now;job.invoiceEnteredBy=id;job.invoiceEnteredByName=user.name;job.financialAudit=[...(job.financialAudit||[]),audit];job.qcWorkflow={...(job.qcWorkflow||{}),revision:revision+1,history:[...(job.qcWorkflow?.history||[]),audit]};
  return {ok:true,data:candidate,job};
 }
 if(op==='FINAL_INVOICE_CORRECTION'){
  if(user.role!=='Manager')return error('qc_permission_denied');
  if(!job.delivered)return error('delivery_required');
  if(!['CASH','CREDIT','INSURANCE'].includes(key(job.jobType)))return error('invoice_job_type_required');
  const reason=String(request.reason||'').trim();if(!reason)return error('financial_correction_reason_required');if(reason.length>2000)return error('qc_reason_too_long');
  const amount=Number(request.amount);if(request.amount==null||String(request.amount).trim()===''||!Number.isFinite(amount)||amount<0||amount>1000000)return error('final_invoice_amount_required');
  if('invoiceDate' in request&&!invoiceDateValid(request.invoiceDate))return error('invoice_date_required');
  const revision=Number(job.qcWorkflow?.revision||0);if(Number(request.expectedQcRevision)!==revision)return error('qc_conflict');
  const from=Number(job.finalInvoiceAmount??job.amount??0),to=Math.round(amount*1000)/1000,audit={operation:op,by:id,name:user.name,at:now,from,to,reason,fromDate:job.invoiceDate||'',toDate:request.invoiceDate||job.invoiceDate||''};
  if(cash)job.amount=to;job.finalInvoiceAmount=to;if('invoiceDate' in request)job.invoiceDate=request.invoiceDate;job.financialAudit=[...(job.financialAudit||[]),audit];job.qcWorkflow={...(job.qcWorkflow||{}),revision:revision+1,history:[...(job.qcWorkflow?.history||[]),audit]};
  return {ok:true,data:candidate,job};
 }
 const receptionistDelivery=user.role==='Receptionist'&&op==='DELIVER'&&!!job.receptionNo;
 if(receptionistDelivery&&(Object.prototype.hasOwnProperty.call(request,'finalInvoiceAmount')||Object.prototype.hasOwnProperty.call(request,'amount')||Object.prototype.hasOwnProperty.call(request,'invoiceDate')))return error('qc_permission_denied');
 if((user.role!=='Supervisor'&&!receptionistDelivery)||(op==='PAINTING_QC'&&id!=='SUP002')||(op==='FINAL_QC'&&id!=='SUP001'))return error('qc_permission_denied');
 if(job.delivered)return error('already_delivered');
 const work=qcWork(candidate,job.no);if(!work.complete)return error('work_not_finished');
 const status=qcStatus(candidate,job),revision=Number(job.qcWorkflow?.revision||0);
 if(Number(request.expectedQcRevision)!==revision)return error('qc_conflict');
 const audit={operation:op,by:id,name:user.name,at:now};
 if(op==='DELIVER'){
  if(!status.deliveryReady)return error('both_qc_required');
  // New clients enter the invoice after delivery; older clients still send it here.
  if(cash&&Object.prototype.hasOwnProperty.call(request,'finalInvoiceAmount')){
   const finalAmount=Number(request.finalInvoiceAmount);
   if(request.finalInvoiceAmount==null||request.finalInvoiceAmount===''||!Number.isFinite(finalAmount)||finalAmount<0||finalAmount>1000000)return error('final_invoice_amount_required');
   const from=Number(job.amount||0);job.amount=Math.round(finalAmount*1000)/1000;job.finalInvoiceAmount=job.amount;
   job.financialAudit=[...(job.financialAudit||[]),{operation:'FINAL_INVOICE_CONFIRMED',by:id,name:user.name,at:now,from,to:job.amount}];
  }
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
  if(old?.financialAudit){j.financialAudit=JSON.parse(JSON.stringify(old.financialAudit));j.amount=old.amount;if('finalInvoiceAmount' in old)j.finalInvoiceAmount=old.finalInvoiceAmount;else delete j.finalInvoiceAmount;}if(old?.deliveryAudit){j.deliveryAudit=JSON.parse(JSON.stringify(old.deliveryAudit));j.deliveredAt=old.deliveredAt;}
  for(const field of ['finalInvoiceAmount','financialAudit','invoiceDate','invoiceEnteredAt','invoiceEnteredBy','invoiceEnteredByName']){if(old&&field in old)j[field]=JSON.parse(JSON.stringify(old[field]));else delete j[field];}
  // Legacy full-state clients cannot fabricate delivery or undo an audited delivery.
  if((!old?.delivered&&j.delivered)||old?.qcWorkflow){for(const field of ['delivered','deliveredAt','deliveredBy','deliveredByName']){if(old&&field in old)j[field]=old[field];else delete j[field]}if(old?.qcWorkflow&&old.delivered)j.status=old.status;else if(j.status==='Delivered'&&!old?.delivered)j.status=old?.status||'Open';}
  if(j.qcWorkflow)j.qcPassed=qcStatus(candidate,j).final;
 }
 return candidate;
}

