import {invoiceDateValid,qcStatus} from './qc_delivery_rules.js';
const key=v=>String(v??'').trim().toUpperCase();
const date=v=>{const d=new Date(Number(v||0));return Number(v)>0&&Number.isFinite(d.getTime())?new Date(d.getTime()+14400000).toISOString().slice(0,10):'';};
export const lpoComplete=j=>!!(j?.insuranceLpo&&Number.isFinite(j.insuranceLpo.amount)&&j.insuranceLpo.amount>=0&&invoiceDateValid(j.insuranceLpo.receivedDate));
export function insuranceProjection(data,receptions,opts={}){
 const unique=new Map();
 for(const j of data?.jobs||[]){if(!j?.no||key(j.no)==='ID001'||key(j.jobType)!=='INSURANCE'||j.deleted||j.archived||j.cancelled||key(j.status)==='CANCELLED')continue;
  const prev=unique.get(key(j.no));if(!prev||Number(j.createdAt||0)>Number(prev.createdAt||0))unique.set(key(j.no),j);}
 const jobs=[...unique.values()];
 const receptionByNo=new Map((receptions||[]).filter(r=>r?.rc_no).map(r=>[key(r.rc_no),r]));
 const month=String(opts.month||new Date(Date.now()+14400000).toISOString().slice(0,7));
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return {ok:false,code:'insurance_invalid_filter'};
 if((opts.from&&!invoiceDateValid(opts.from))||(opts.to&&!invoiceDateValid(opts.to))||(opts.from&&opts.to&&opts.from>opts.to))return {ok:false,code:'insurance_invalid_filter'};
 const company=String(opts.company||'');
 const filtered=jobs.filter(j=>!company||j.insuranceCompany===company);
 const delivered=filtered.filter(j=>j.delivered&&date(j.deliveredAt).startsWith(month));
 const breakdown=Object.entries(delivered.reduce((a,j)=>{const c=j.insuranceCompany||'Not recorded';a[c]=(a[c]||0)+1;return a;},{})).map(([company,count])=>({company,count})).sort((a,b)=>a.company.localeCompare(b.company));
 const collected=filtered.filter(j=>lpoComplete(j)&&j.insuranceLpo.receivedDate.startsWith(month));
 const waiting=(receptions||[]).filter(r=>key(r.job_type)==='INSURANCE'&&!r.job_card&&!r.outcome&&(!r.repair_status||r.repair_status==='PENDING')&&!r.released_date&&r.approval_status==='WAITING'&&r.details?.direct_job_only!==true&&(!company||r.insurance_company===company));
 const wip=filtered.filter(j=>!j.delivered&&!qcStatus(data,j).deliveryReady);
 const section=opts.section||'jobs';
 const selected={jobs:filtered,pending:filtered.filter(j=>!lpoComplete(j)),collected,delivered,wip}[section];
 if(!selected)return {ok:false,code:'insurance_invalid_section'};
 const search=String(opts.search||'').toLowerCase();
 const rows=selected.map(j=>{const reception=receptionByNo.get(key(j.receptionNo));const approvalHistory=reception?.insurance?.approvals||reception?.approvals||[];const approvedDates=approvalHistory.map(a=>String(a?.approval_date||'')).filter(d=>invoiceDateValid(d));return {job_card:String(j.no),date:date(j.createdAt),vehicle:[j.make||j.brand,j.model].filter(Boolean).join(' ')||j.vehicle||'',
  year:j.year||j.modelYear||j.vehicleYear||j.model_year||j.vehicle_year||'',registration:j.reg||'',claim:j.claimNo||'',insurance_company:j.insuranceCompany||'',delivered_date:date(j.deliveredAt),
  lpo_amount:lpoComplete(j)?j.insuranceLpo.amount:null,lpo_received_date:j.insuranceLpo?.receivedDate||'',
  lpo_revision:Number(j.insuranceLpo?.revision||0),lpo_history:j.insuranceLpo?.history||[],approval_date:approvedDates[0]||'',reception_location:['VWC','VIW'].includes(key(reception?.location||j.receptionLocation))?key(reception?.location||j.receptionLocation):'',status:j.delivered?'Delivered':j.status||'Open'};})
 .filter(r=>{const day=section==='collected'?r.lpo_received_date:section==='delivered'?r.delivered_date:r.date;
  return (!opts.month||day.startsWith(month))&&(!opts.from||day>=opts.from)&&(!opts.to||day<=opts.to)&&(!search||[r.job_card,r.vehicle,r.registration,r.claim,r.insurance_company].some(x=>String(x).toLowerCase().includes(search)));})
 .sort((a,b)=>b.job_card.localeCompare(a.job_card,'en',{numeric:true}));
 const page=Math.max(0,Number.isInteger(Number(opts.page))?Number(opts.page):0);
 return {ok:true,section,month,companies:[...new Set(jobs.map(j=>j.insuranceCompany).filter(Boolean))].sort(),
  summary:{collected_amount:collected.reduce((s,j)=>s+Math.round(j.insuranceLpo.amount*1000),0)/1000,delivered_count:delivered.length,approval_pending:waiting.length,wip_count:wip.length},
  company_breakdown:breakdown,total:rows.length,page,page_size:50,rows:rows.slice(page*50,(page+1)*50)};
}
export function insuranceLpoTransition(data,user,request,now){
 if(user?.role!=='Manager')return {ok:false,code:'insurance_manager_required'};
 if(Object.keys(request||{}).some(k=>!['action','job_card','amount','received_date','expected_revision','request_id','reason'].includes(k)))return {ok:false,code:'insurance_invalid_fields'};
 if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(request.request_id||''))return {ok:false,code:'insurance_request_required'};
 const no=key(request.job_card),amountText=String(request.amount??''),reason=String(request.reason||'').trim();
 if(!/^\d+(\.\d{1,3})?$/.test(amountText)||Number(amountText)>1000000||!invoiceDateValid(request.received_date)||request.received_date>date(now)||reason.length>2000)return {ok:false,code:'insurance_invalid_lpo'};
 const amount=Number(amountText);
 const matches=(data.jobs||[]).flatMap(j=>(j.insuranceLpo?.history||[]).filter(a=>a.request_id===request.request_id).map(a=>({j,a})));
 if(matches.length){const {j,a}=matches[0];return matches.length===1&&key(j.no)===no&&a.by===user.id&&a.toAmount===amount&&a.toDate===request.received_date&&a.reason===reason&&a.expectedRevision===request.expected_revision?{ok:true,duplicate:true,job:j}:{ok:false,code:'insurance_request_conflict'};}
 const candidate=structuredClone(data),job=candidate.jobs?.find(j=>key(j.no)===no);
 if(!job||key(job.jobType)!=='INSURANCE'||job.deleted||job.archived||job.cancelled||key(job.status)==='CANCELLED')return {ok:false,code:'insurance_job_required'};
 const previous=job.insuranceLpo;
 if(!Number.isInteger(request.expected_revision)||request.expected_revision!==Number(previous?.revision||0))return {ok:false,code:'insurance_lpo_conflict'};
 if(previous&&!reason)return {ok:false,code:'insurance_correction_reason_required'};
 job.insuranceLpo={amount,receivedDate:request.received_date,revision:Number(previous?.revision||0)+1,
  history:[...(previous?.history||[]),{request_id:request.request_id,by:user.id,name:user.name,at:now,source:'LPO_ENTRY',fromAmount:previous?.amount??null,fromDate:previous?.receivedDate||'',toAmount:amount,toDate:request.received_date,reason,expectedRevision:request.expected_revision}]};
 return {ok:true,data:candidate,job};
}
