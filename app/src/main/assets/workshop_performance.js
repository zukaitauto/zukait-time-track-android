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
  if(!allowed())return;const d=data(),rows=overAllocatedRows(d),names=new Map(d.users.map(u=>[text(u.id),u.name]));
  window.openModal('<div class="section-title"><h2>Over Allocated Working Time</h2><button onclick="closeModal()">Close</button></div><p>Active and paused normal assignments. Finished assignments move to the existing completed-time review.</p><div style="overflow:auto"><table><thead><tr><th>Job Card</th><th>Employee</th><th>Allocated</th><th>Actual</th><th>Exceeded</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><button data-v377-job="'+esc(r.assignment.job)+'">'+esc(r.assignment.job)+'</button></td><td>'+esc(names.get(text(r.assignment.emp))||r.assignment.emp)+'</td><td>'+duration(r.suggested)+'</td><td>'+duration(r.actual)+'</td><td>'+duration(r.exceeded)+'</td></tr>').join('')+'</tbody></table></div>');
  document.querySelectorAll('[data-v377-job]').forEach(b=>b.onclick=()=>{if(allowed())window.zukaitOpenRunningDetails?.(b.dataset.v377Job);});
 };
 window.dispatchEvent(new Event('zukait:state-updated'));
}
