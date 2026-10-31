import {workedMinutes} from './time_management_rules.js?v=2026102701';
const oman=4*3600000, text=v=>String(v??''), key=v=>text(v).trim().toUpperCase();
export function normalAssignments(data){
 const jobs=new Map((data.jobs||[]).map(j=>[key(j.no),j])),people=new Map((data.users||[]).map(u=>[text(u.id),u]));
 const unique=new Map();
 for(const a of data.assign||[]){
  if(!a||!a.id||a.cancelled||a.rework||a.repeat||key(a.job)==='ID001')continue;
  const j=jobs.get(key(a.job)),u=people.get(text(a.emp));
  if(j?.deleted||j?.cancelled||/mechanic/i.test(text(j?.workshopDepartment||j?.department||u?.department)))continue;
  unique.set(text(a.id),a);
 }
 return [...unique.values()];
}
export function overAllocatedRows(data,at=Date.now()){
 const jobs=new Map((data.jobs||[]).map(j=>[key(j.no),j]));
 return normalAssignments(data).filter(a=>!a.completed&&!jobs.get(key(a.job))?.delivered&&!jobs.get(key(a.job))?.archived).map(a=>{
  const suggested=Math.max(0,Number(a.suggested)||0),actual=workedMinutes(data,a,at);
  return {assignment:a,suggested,actual,exceeded:Math.max(0,actual-suggested)};
 }).filter(r=>r.suggested>0&&r.exceeded>0);
}
// Group only actual over-allocation records; keep the existing duty-time and
// exclusion rules, and show every offending employee rather than a bare JC.
export function overAllocatedJobGroups(data,at=Date.now()){
 const jobs=new Map((data.jobs||[]).map(j=>[key(j.no),j]));
 const people=new Map((data.users||[]).map(u=>[text(u.id),u]));
 const groups=new Map();
 for(const r of overAllocatedRows(data,at)){
  const jobCard=key(r.assignment.job),job=jobs.get(jobCard)||{},employee=people.get(text(r.assignment.emp))||{};
  const rawType=text(job.jobType||job.job_type||job.type).trim().toUpperCase();
  const jobType=rawType==='INSURANCE'?'Insurance':rawType==='CASH'?'Cash':rawType==='CREDIT'?'Credit':'Not recorded';
  let group=groups.get(jobCard);
  if(!group){
   const vehicle=text(job.vehicle).trim()||[job.make,job.model,job.year].map(text).filter(x=>x.trim()).join(' ').trim()||'Vehicle not recorded';
   group={jobCard:text(job.no||r.assignment.job),vehicle,registration:text(job.reg||job.registration||job.regNo).trim(),jobType,employees:[],exceeded:0};
   groups.set(jobCard,group);
  }
  group.employees.push({id:text(r.assignment.emp),name:text(employee.name||r.assignment.emp),department:text(employee.department),suggested:r.suggested,actual:r.actual,exceeded:r.exceeded});
  group.exceeded+=r.exceeded;
 }
 return [...groups.values()].map(g=>({...g,employees:g.employees.sort((a,b)=>b.exceeded-a.exceeded||a.name.localeCompare(b.name))}))
  .sort((a,b)=>b.exceeded-a.exceeded||a.jobCard.localeCompare(b.jobCard));
}
export function completedRows(data,from,to,at=Date.now()){
 return normalAssignments(data).filter(a=>a.completed&&Number.isFinite(Number(a.completedAt))&&Number(a.completedAt)>=from&&Number(a.completedAt)<to).map(a=>({a,sg:Math.max(0,Number(a.suggested)||0),ac:workedMinutes(data,a,Math.min(Number(a.completedAt),at))})).filter(r=>r.ac>0);
}
export function completedRanking(data,month,at=Date.now()){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];
 const [y,m]=month.split('-').map(Number),from=Date.UTC(y,m-1,1)-oman,to=Date.UTC(y,m,1)-oman,people=new Map((data.users||[]).map(u=>[text(u.id),u])),groups=new Map();
 for(const {a,ac:actual} of completedRows(data,from,to,at)){
  const id=text(a.emp),u=people.get(id),r=groups.get(id)||{id,name:u?.name||id,department:u?.department||'',suggested:0,actual:0,jobs:new Set()};
  r.suggested+=Math.max(0,Number(a.suggested)||0);r.actual+=actual;r.jobs.add(key(a.job));groups.set(id,r);
 }
 return [...groups.values()].map(r=>({...r,jobs:r.jobs.size,efficiency:r.suggested/r.actual*100})).sort((a,b)=>b.efficiency-a.efficiency||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
if(typeof window!=='undefined'){
 const allowed=()=>typeof me!=='undefined'&&me?.role==='Manager';
 const data=()=>({...state,users:typeof users!=='undefined'?users:state.users||[]});
 const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const duration=v=>{const n=Math.max(0,Math.round(v));return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m';};
 window.zukaitWorkshopPerformance={overAllocatedRows:()=>allowed()?overAllocatedRows(data()):[],completedRows:(from,to)=>allowed()?completedRows(data(),from,to):[]};
 window.openEmployeeEfficiency=function(month=new Date(Date.now()+oman).toISOString().slice(0,7)){
  if(!allowed())return;const rows=completedRanking(data(),month);
  window.openModal('<div class="section-title"><h2>Employee Efficiency</h2><button onclick="closeModal()">Close</button></div><label>Month <input id="v377EfficiencyMonth" type="month" value="'+esc(month)+'"></label><p>Completed normal assignments only · Oman completion month · full assignment normal duty time; ID001, repeat work and overtime excluded.</p><div style="overflow:auto"><table><thead><tr><th>Rank</th><th>Employee</th><th>Department</th><th>Completed jobs</th><th>Suggested hours</th><th>Actual hours</th><th>Efficiency</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.department)+'</td><td>'+r.jobs+'</td><td>'+duration(r.suggested)+'</td><td>'+duration(r.actual)+'</td><td>'+r.efficiency.toFixed(1)+'%</td></tr>').join('')+'</tbody></table></div><p>Efficiency = total suggested hours ÷ total actual hours × 100.</p>');
  document.getElementById('v377EfficiencyMonth').onchange=e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))window.openEmployeeEfficiency(e.target.value);};
 };
 window.v377OpenOverAllocated=function(){
  if(!allowed())return;
  const groups=overAllocatedJobGroups(data()),total=groups.reduce((n,g)=>n+g.exceeded,0);
  const assignments=groups.reduce((n,g)=>n+g.employees.length,0);
  const css='<style>.v377-overalloc{font-size:15px;line-height:1.45;color:#20354e}.v377-overalloc .section-title{gap:12px;align-items:center;flex-wrap:wrap}.v377-overalloc .section-title h2{font-size:21px}.v377-overalloc-summary{margin:10px 0 16px;padding:12px 14px;background:#f1f6fe;border-radius:12px;color:#284561;font-weight:700}.v377-overalloc-list{display:grid;gap:12px}.v377-overalloc-card{padding:15px;border:1px solid #d3e0ed;background:#fff;border-radius:14px;box-shadow:0 3px 12px #233e5910}.v377-overalloc-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.v377-overalloc-jc{border:1px solid #a7c7eb;border-radius:9px;background:#eaf3ff;color:#194e81;font-size:16px;font-weight:800;padding:9px 12px;min-height:44px}.v377-overalloc-kind{border-radius:999px;padding:5px 10px;font-size:13px;font-weight:800;background:#edf1f6;color:#33465e}.v377-overalloc-kind[data-kind="Insurance"]{background:#e7eaff;color:#413d94}.v377-overalloc-kind[data-kind="Cash"]{background:#e2f6eb;color:#176544}.v377-overalloc-kind[data-kind="Credit"]{background:#e8f3ff;color:#18568e}.v377-overalloc-total{margin-left:auto;font-size:15px;font-weight:900;color:#9f3f20}.v377-overalloc-vehicle{font-size:16px;font-weight:750;margin:9px 0 12px;overflow-wrap:anywhere}.v377-overalloc-reg{font-size:14px;color:#526882;font-weight:600}.v377-overalloc-worker{display:grid;grid-template-columns:minmax(125px,1fr) minmax(0,2fr);gap:10px;align-items:center;padding:10px 0;border-top:1px solid #e6edf5}.v377-overalloc-name{font-weight:800;overflow-wrap:anywhere}.v377-overalloc-dept{display:block;color:#61738a;font-size:13px}.v377-overalloc-times{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.v377-overalloc-times span{display:grid;gap:3px;padding:8px;border-radius:9px;background:#f3f7fc;color:#3b526b;font-size:12px;font-weight:700;min-width:0}.v377-overalloc-times b{color:#173958;font-size:15px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.v377-overalloc-times .v377-overalloc-exceeded{background:#fff0e8;color:#973d20}.v377-overalloc-times .v377-overalloc-exceeded b{color:#a33418}.v377-overalloc-note{color:#596e82;font-size:13px;margin-top:14px}@media(max-width:550px){.v377-overalloc-card{padding:11px}.v377-overalloc-worker{grid-template-columns:1fr;gap:7px}.v377-overalloc-total{margin-left:0}.v377-overalloc-vehicle{font-size:15px}.v377-overalloc-times span{padding:7px 5px;font-size:11px}.v377-overalloc-times b{font-size:14px}}</style>';
  const cards=groups.map(g=>'<article class="v377-overalloc-card"><div class="v377-overalloc-head"><button type="button" class="v377-overalloc-jc" data-v377-job="'+esc(g.jobCard)+'">JC '+esc(g.jobCard)+'</button><span class="v377-overalloc-kind" data-kind="'+esc(g.jobType)+'">'+esc(g.jobType)+'</span><strong class="v377-overalloc-total">Exceeded '+duration(g.exceeded)+'</strong></div><div class="v377-overalloc-vehicle">'+esc(g.vehicle)+(g.registration?'<span class="v377-overalloc-reg"> · '+esc(g.registration)+'</span>':'')+'</div><div>'+g.employees.map(p=>'<div class="v377-overalloc-worker"><div><div class="v377-overalloc-name">'+esc(p.name)+'</div>'+(p.department?'<span class="v377-overalloc-dept">'+esc(p.department)+'</span>':'')+'</div><div class="v377-overalloc-times"><span>Allocated<b>'+duration(p.suggested)+'</b></span><span>Actual<b>'+duration(p.actual)+'</b></span><span class="v377-overalloc-exceeded">Exceeded<b>'+duration(p.exceeded)+'</b></span></div></div>').join('')+'</div></article>').join('');
  window.openModal('<section class="v377-overalloc">'+css+'<div class="section-title"><h2>Over Allocated Jobs</h2><button type="button" onclick="closeModal()">Close</button></div><div class="v377-overalloc-summary">'+groups.length+' Job Cards · '+assignments+' over-allocated assignments · Total exceeded '+duration(total)+'</div><div class="v377-overalloc-list">'+(cards||'<p>No over-allocated active or paused jobs.</p>')+'</div><p class="v377-overalloc-note">Normal duty time only. Finished assignments, ID001, repeat work and Mechanical jobs are excluded. Select a Job Card for details.</p></section>');
  document.querySelectorAll('.v377-overalloc [data-v377-job]').forEach(b=>b.onclick=()=>{if(allowed())window.zukaitOpenRunningDetails?.(b.dataset.v377Job);});
 };
 window.dispatchEvent(new Event('zukait:state-updated'));
}
