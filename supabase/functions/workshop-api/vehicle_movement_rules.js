// Dedicated temporary vehicle movement; never a delivery or financial edit.
export function vehicleMovement(data,user,r,now=Date.now()){
 const fail=code=>({ok:false,code});
 if(!['Manager','Supervisor','Receptionist'].includes(user?.role))return fail('movement_forbidden');
 if(!r||Object.keys(r).some(k=>!['action','request_id','job_card','location','expected_location','movement_date','reason'].includes(k)))return fail('movement_invalid');
 if(!/^[a-f0-9-]{36}$/i.test(r.request_id||'')||!['VIW','VWC'].includes(r.location)||!['VIW','VWC'].includes(r.expected_location)||typeof r.reason!=='string'||!r.reason.trim()||r.reason.length>2000)return fail('movement_invalid');
 const date=r.movement_date,today=new Date(now+14400000).toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date+'T12:00:00+04:00'))||new Date(Date.parse(date+'T12:00:00+04:00')+14400000).toISOString().slice(0,10)!==date||date>today)return fail('movement_invalid_date');
 const matches=(data.jobs||[]).flatMap(j=>(j.vehicleMovements||[]).filter(a=>a.request_id===r.request_id).map(a=>({j,a})));
 if(matches.length){const {j,a}=matches[0];return matches.length===1&&j.no===r.job_card&&a.by===user.id&&a.to===r.location&&a.expected===r.expected_location&&a.date===date&&a.reason===r.reason.trim()?{ok:true,duplicate:true,job:j}:fail('movement_request_conflict');}
 const j=(data.jobs||[]).find(j=>j.no===r.job_card);if(!j||j.no==='ID001'||j.deleted||j.cancelled||j.archived||j.delivered||['DELIVERED','CANCELLED','DELETED','ARCHIVED'].includes(String(j.status).toUpperCase()))return fail('movement_job_closed');
 if(j.receptionNo)return fail('movement_use_linked_checklist');
 if((j.receptionLocation||'VIW')!==r.expected_location)return fail('movement_conflict');
 if(r.location===r.expected_location)return fail('movement_no_change');
 const last=(j.vehicleMovements||[]).at(-1);if(last?.date&&date<last.date)return fail('movement_before_previous');
 const opened=new Date(Number(j.createdAt)+14400000);if(Number.isFinite(opened.getTime())&&date<opened.toISOString().slice(0,10))return fail('movement_before_intake');
 const next=structuredClone(data),job=next.jobs.find(x=>x.no===j.no);job.receptionLocation=r.location;job.vehicleMovements=[...(job.vehicleMovements||[]),{request_id:r.request_id,from:r.expected_location,expected:r.expected_location,to:r.location,date,reason:r.reason.trim(),by:user.id,at:now}];return {ok:true,data:next,job};
}
