// Preserve classification during unrelated or stale full-state saves.
export function preserveJobTypeAuthority(candidate,current,user){
 const valid=v=>['CASH','CREDIT','INSURANCE'].includes(String(v||'').trim().toUpperCase());
 const type=j=>j?.jobType||j?.job_type||'';
 const byNo=new Map((current.jobs||[]).map(j=>[String(j.no),j]));
 const oldAudits=new Set((current.jobTypeAudit||[]).map(x=>JSON.stringify(x)));
 const changes=(candidate.jobTypeAudit||[]).filter(x=>x&&String(x.by)===String(user?.id)&&!oldAudits.has(JSON.stringify(x)));
 for(const j of candidate.jobs||[]){const old=byNo.get(String(j.no));if(!old||!valid(type(old)))continue;
  const correction=changes.find(x=>String(x.job)===String(j.no)&&String(x.to||'').toUpperCase()===String(type(j)).toUpperCase()&&String(x.from||'').toUpperCase()===String(type(old)).toUpperCase());
  const authorized=valid(type(j))&&['Manager','Supervisor'].includes(user?.role)&&(!old.delivered||user.role==='Manager')&&correction&&(!old.delivered||String(correction.reason||'').trim());
  if(authorized)continue;
  for(const key of ['jobType','job_type','insuranceCompany','insurance_company','insurance']){if(Object.prototype.hasOwnProperty.call(old,key))j[key]=old[key];else delete j[key];}
 }
 const merged=candidate.jobTypeAudit=Array.isArray(candidate.jobTypeAudit)?candidate.jobTypeAudit:[],seen=new Set(merged.map(x=>JSON.stringify(x)));
 for(const x of current.jobTypeAudit||[])if(!seen.has(JSON.stringify(x)))merged.push(JSON.parse(JSON.stringify(x)));
 return candidate;
}
