import {qcStatus} from "./qc_delivery_rules.js";

// Server-authoritative read-only projection; no purchases, amounts, time,
// password hashes or full workshop state are exposed to Reception clients.
const text=v=>String(v??"").trim();
const norm=v=>text(v).toUpperCase();
export function validPromiseDate(s) {
 if(typeof s!=="string"||!/^(19|20)\d\d-\d\d-\d\d$/.test(s))return false;
 const d=new Date(s+"T00:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function omanDate(value) {
 if(value==null||value==="")return "";
 const d=new Date(typeof value==="number"?value:(/^\d+$/.test(String(value))?Number(value):value));
 if(!Number.isFinite(d.getTime()))return "";
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Muscat",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(d).map(x=>[x.type,x.value]));
 return p.year+"-"+p.month+"-"+p.day;
}
const serial=(a,b)=>String(b).localeCompare(String(a),"en",{numeric:true});
const sortRc=(a,b)=>(Number(b.sequence_no||0)-Number(a.sequence_no||0))||serial(a.rc_no,b.rc_no);
const sortJobs=(a,b)=>serial(a.job_card,b.job_card);
function safeRc(r,company) {
 const d=r?.details||{};
 return {rc_no:text(r.rc_no),sequence_no:Number(r.sequence_no||0),
 job_card:text(r.job_card),job_type:text(r.job_type||"INSURANCE"),
 vehicle:[d.make,d.model,d.year].filter(Boolean).join(" ").slice(0,240),
 registration:text(d.registration),customer:text(d.customer),
 insurance_company:company||"",received_at:r.received_at||"",
 received_date:omanDate(r.received_at),location:text(r.location),
 outcome:text(r.outcome),approval_status:text(r.approval_status),
 promise_date:"",delivered_date:"",created_date:omanDate(r.received_at),status:text(r.outcome||r.approval_status)};
}
function safeJob(j,rc) {
 return {rc_no:text(j.receptionNo||rc?.rc_no),sequence_no:Number(rc?.sequence_no||0),
 job_card:text(j.no),job_type:text(j.jobType||rc?.job_type),vehicle:
   [j.make||j.brand,j.model,j.year||j.vehicleYear].filter(Boolean).join(" ").trim()||
   text(j.vehicle||rc?.vehicle),
 registration:text(j.reg||j.registration||rc?.registration),
 customer:text(rc?.customer),insurance_company:text(j.insuranceCompany||rc?.insurance_company),
 received_at:rc?.received_at||"",received_date:rc?.received_date||"",
 created_date:omanDate(j.createdAt)||rc?.received_date||"",
 delivered_date:omanDate(j.deliveredAt),promise_date:validPromiseDate(j.promiseDate)?j.promiseDate:"",
 location:text(rc?.location||j.receptionLocation),outcome:text(rc?.outcome),
 approval_status:text(rc?.approval_status),
 status:j.delivered?"Delivered":text(j.status||"Open"),delivered:!!j.delivered,
 qc_revision:Number(j.qcWorkflow?.revision||0)};
}
function matchFilter(row,opts,kind) {
 const search=text(opts.search).toLowerCase();
 if(search&&![row.rc_no,row.job_card,row.registration,row.vehicle,row.customer,row.insurance_company].some(v=>text(v).toLowerCase().includes(search)))return false;
 const month=text(opts.month),from=text(opts.from),to=text(opts.to);
 const date=kind==="delivered"?row.delivered_date:kind==="followup"?row.promise_date:
  (kind==="jobs"||kind==="ready"||kind==="vwc-jobs")?row.created_date:row.received_date;
 if(kind==="followup"){
  if(opts.missing_only===true&&!row.promise_date)return true;
  if(opts.missing_only===true)return false;
  if(opts.dated_only===true&&!row.promise_date)return false;
 }
 if(month && (!/^\d{4}-\d{2}$/.test(month)||!date.startsWith(month)))return false;
 if(from && (!validPromiseDate(from)||!date||date<from))return false;
 if(to && (!validPromiseDate(to)||!date||date>to))return false;
 return true;
}
export function receptionDashboardProjection(data,receptions,opts={}) {
 const rows=(Array.isArray(receptions)?receptions:[]).map(x=>safeRc(x,x.insurance_company));
 const byRc=new Map(rows.map(x=>[x.rc_no,x]));
 const jobs=(data?.jobs||[]).filter(j=>j&&j.no&&norm(j.no)!=="ID001"&&!j.deleted&&!j.archived&&
   !j.cancelled&&norm(j.status)!=="CANCELLED").map(j=>({raw:j,row:safeJob(j,byRc.get(text(j.receptionNo)))}));
 const allJobs=jobs.map(x=>x.row),activeJobs=jobs.filter(x=>!x.raw.delivered).map(x=>x.row);
 const checklists=rows.slice().sort(sortRc);
 const waiting=checklists.filter(r=>r.job_type==="INSURANCE"&&!r.job_card&&!r.outcome&&r.approval_status==="WAITING");
 const approved=checklists.filter(r=>r.job_type==="INSURANCE"&&!r.job_card&&!r.outcome&&r.approval_status==="APPROVED");
 const vwcChecklists=checklists.filter(r=>r.location==="VWC"&&!r.job_card&&!r.outcome);
 const vwcJobs=activeJobs.filter(r=>r.location==="VWC"&&!r.outcome);
 const ready=jobs.filter(x=>!x.raw.delivered&&qcStatus(data,x.raw).deliveryReady).map(x=>x.row);
 const delivered=jobs.filter(x=>x.raw.delivered).map(x=>x.row);
 const followup=activeJobs.filter(r=>!r.outcome);
 const lists={checklists,jobs:allJobs.sort(sortJobs),waiting,approved,
 "vwc-checklists":vwcChecklists,"vwc-jobs":vwcJobs.sort(sortJobs),
 ready:ready.sort(sortJobs),delivered:delivered.sort((a,b)=>b.delivered_date.localeCompare(a.delivered_date)||sortJobs(a,b)),
 followup:followup.sort((a,b)=>(a.promise_date||"9999").localeCompare(b.promise_date||"9999")||sortJobs(a,b))};
 const counts=Object.fromEntries(Object.entries(lists).map(([k,v])=>[k,v.length]));
 counts.vwc=counts["vwc-checklists"]+counts["vwc-jobs"];
 counts.no_promise_date=followup.filter(r=>!r.promise_date).length;
 const section=text(opts.section)||"checklists";
 if(!Object.hasOwn(lists,section))return {ok:false,code:"reception_invalid_section"};
 if(!["", "true", "false"].includes(String(opts.missing_only??"")))return {ok:false,code:"reception_invalid_filter"};
 const selected=lists[section].filter(x=>matchFilter(x,opts,section));
 const page=Math.max(0,Math.min(100000,Number.isInteger(Number(opts.page))?Number(opts.page):0));
 const limit=50;
 return {ok:true,counts,section,total:selected.length,page,page_size:limit,
 rows:selected.slice(page*limit,(page+1)*limit)};
}
export function receptionPromiseTransition(data,user,request,now){
 const role=text(user?.role);
 if(!["Manager","Supervisor"].includes(role))return {ok:false,code:"reception_promise_forbidden"};
 if(!request||!Array.isArray(data?.jobs)||Object.keys(request).some(k=>!["action","job_card","promise_date","expected_promise_date","request_id"].includes(k)))
  return {ok:false,code:"reception_promise_invalid_fields"};
 const reqid=text(request.request_id),no=norm(request.job_card),promise=request.promise_date,expected=request.expected_promise_date;
 if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(reqid))
  return {ok:false,code:"reception_request_required"};
 if(!no||no==="ID001"||typeof promise!=="string"||(promise!==""&&!validPromiseDate(promise))||
    typeof expected!=="string"||(expected!==""&&!validPromiseDate(expected)))
  return {ok:false,code:"reception_promise_invalid_date"};
 const current=(data.jobs||[]).find(j=>norm(j?.no)===no);
 if(!current||current.deleted||current.archived||current.cancelled||norm(current.status)==="CANCELLED"||current.delivered)
  return {ok:false,code:"reception_job_not_open"};
 const prev=(current.promiseAudit||[]).find(a=>a.request_id===reqid);
 if(prev){
  return prev.by===text(user.id)&&prev.to===promise&&prev.expected===expected?
    {ok:true,duplicate:true,promise_date:prev.to,job_card:no}:
    {ok:false,code:"reception_request_conflict"};
 }
 const old=text(current.promiseDate);
 if(old!==expected)return {ok:false,code:"reception_promise_conflict"};
 const next=structuredClone(data),job=next.jobs.find(j=>norm(j?.no)===no);
 job.promiseDate=promise;
 job.promiseAudit=[...(Array.isArray(job.promiseAudit)?job.promiseAudit:[]),
   {request_id:reqid,by:text(user.id),at:now,from:old,to:promise,expected}];
 return {ok:true,data:next,job_card:no,promise_date:promise};
}

export function preserveReceptionPromiseAuthority(candidate,current) {
 const originals=new Map((current?.jobs||[]).filter(j=>j?.no).map(j=>[norm(j.no),j]));
 for(const job of candidate?.jobs||[]) {
  if(!job?.no)continue;
  const before=originals.get(norm(job.no));
  for(const field of ["promiseDate","promiseAudit"]) {
   if(before&&Object.prototype.hasOwnProperty.call(before,field))
     job[field]=structuredClone(before[field]);
   else delete job[field];
  }
 }
 return candidate;
}
