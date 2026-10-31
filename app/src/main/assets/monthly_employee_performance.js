import {normalAssignments} from './workshop_performance.js?v=377-overalloc';
import {workedMinutes} from './time_management_rules.js?v=2026102701';

// Manager Reports: employee and monthly tabs share one read-only calculation.
// Completed work is attributed to the Oman month of technician completion;
// full duty-time on each finished assignment is used for efficiency.
const OMAN=4*3600000,DAY=86400000,HOUR=3600000;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const key=v=>String(v??'').trim().toUpperCase();
const fmt=m=>{const n=Math.max(0,Math.round(number(m)));return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m';};
const pct=n=>n==null?'—':n.toFixed(1)+'%';
const when=ms=>new Date(ms).toLocaleString('en-GB',{timeZone:'Asia/Muscat',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
export function omanMonth(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))return null;
 const [y,m]=month.split('-').map(Number);
 return {month,from:Date.UTC(y,m-1,1)-OMAN,to:Date.UTC(y,m,1)-OMAN};
}
const currentMonth=()=>new Date(Date.now()+OMAN).toISOString().slice(0,7);
function holidayDates(data){
 return new Set((data.workshopHolidays||[]).map(h=>String(typeof h==='object'?(h.date||h.dateKey||h.day||''):h).slice(0,10)));
}
function dutyMinutes(start,end,from,to,holidays){
 let total=0,cur=Math.max(number(start),from),stop=Math.min(number(end),to);
 if(!Number.isFinite(cur)||!Number.isFinite(stop)||stop<=cur)return 0;
 while(cur<stop){
  const local=new Date(cur+OMAN),midnight=Math.floor((cur+OMAN)/DAY)*DAY-OMAN,segmentEnd=Math.min(stop,midnight+DAY);
  const date=local.toISOString().slice(0,10);
  if(local.getUTCDay()!==5&&!holidays.has(date)){
   for(const [a,b] of [[8,13],[15,19]]){
    total+=Math.max(0,Math.min(segmentEnd,midnight+b*HOUR)-Math.max(cur,midnight+a*HOUR))/60000;
   }
  }
  cur=segmentEnd;
 }
 return total;
}
export function id001Hours(data,employeeId,month,at=Date.now()){
 const bounds=omanMonth(month);if(!bounds)return 0;
 const holidays=holidayDates(data),seen=new Set();
 return (data.sessions||[]).reduce((minutes,s)=>{
  if(!s||s.emp!==employeeId||key(s.job)!=='ID001'||s.cancelled===true)return minutes;
  if(s.id!=null){const id=String(s.id);if(seen.has(id))return minutes;seen.add(id);}
  const start=number(s.start),end=s.end==null?at:number(s.end);
  return minutes+dutyMinutes(start,Math.min(end,at),bounds.from,bounds.to,holidays);
 },0);
}
export function employeeMonthReport(data,month,at=Date.now()){
 const bounds=omanMonth(month);if(!bounds)return null;
 const people=(data.users||[]).filter(u=>u&&u.role==='Employee');
 const jobs=new Map((data.jobs||[]).filter(Boolean).map(j=>[key(j.no),j]));
 const byEmployee=new Map(people.map(u=>[String(u.id),{id:String(u.id),name:String(u.name||u.id),department:String(u.department||''),completedAssignments:0,completedVehicles:0,deliveredVehicles:0,suggested:0,actual:0,id001:id001Hours(data,u.id,month,at),missingTime:0,details:[]}]));
 for(const a of normalAssignments(data)){
  if(a.completed!==true||!Number.isFinite(Number(a.completedAt))||Number(a.completedAt)<bounds.from||Number(a.completedAt)>=bounds.to)continue;
  const employee=byEmployee.get(String(a.emp));if(!employee)continue;
  const job=jobs.get(key(a.job))||{},actual=workedMinutes(data,a,Math.min(Number(a.completedAt),at));
  const allocated=Math.max(0,number(a.suggested));
  const row={jc:String(a.job),assignmentId:String(a.id),vehicle:String(job.vehicle||[job.make,job.model,job.year].filter(Boolean).join(' ')||'—'),registration:String(job.reg||job.registration||'—'),
    completedAt:Number(a.completedAt),delivered:job.delivered===true,allocated,actual,efficiency:actual>0?allocated/actual*100:null};
  employee.details.push(row);
  employee.completedAssignments++;
  // Zero-time finished work stays visible but cannot manufacture efficiency.
  if(actual>0){employee.suggested+=allocated;employee.actual+=actual;}else employee.missingTime++;
 }
 for(const e of byEmployee.values()){
  const distinct=new Set(e.details.map(d=>key(d.jc)));
  e.completedVehicles=distinct.size;
  e.deliveredVehicles=[...distinct].filter(jc=>jobs.get(jc)?.delivered===true).length;
  e.efficiency=e.actual>0?e.suggested/e.actual*100:null;
  e.details.sort((a,b)=>b.completedAt-a.completedAt||a.jc.localeCompare(b.jc));
 }
 const employees=[...byEmployee.values()].sort((a,b)=>{
  if(a.efficiency==null&&b.efficiency!=null)return 1;
  if(b.efficiency==null&&a.efficiency!=null)return -1;
  return (b.efficiency??0)-(a.efficiency??0)||a.name.localeCompare(b.name);
 });
 const totalJobs=new Set(employees.flatMap(e=>e.details.map(d=>key(d.jc))));
 const suggested=employees.reduce((n,e)=>n+e.suggested,0),actual=employees.reduce((n,e)=>n+e.actual,0);
 return {month,from:bounds.from,to:bounds.to,employees,totals:{employees:employees.length,completedVehicles:totalJobs.size,
  completedAssignments:employees.reduce((n,e)=>n+e.completedAssignments,0),suggested,actual,efficiency:actual>0?suggested/actual*100:null,
  id001:employees.reduce((n,e)=>n+e.id001,0),missingTime:employees.reduce((n,e)=>n+e.missingTime,0)}};
}
function stateData(){
 // No writes: use the same authoritative synchronized snapshot as Workshop Efficiency.
 const s=typeof state==='object'&&state?state:{};
 return {...s,users:typeof users!=='undefined'?users:s.users||[]};
}
function summaryCards(e){
 return '<div class="zukait-monthly-summary">'+[
  ['Completed vehicles',e.completedVehicles],['Delivered (now)',e.deliveredVehicles],
  ['Finished assignments',e.completedAssignments],['Allocated',fmt(e.suggested)],
  ['Actual productive',fmt(e.actual)],['Efficiency',pct(e.efficiency)],
  ['ID001 waiting',fmt(e.id001)]
 ].map(([label,value])=>'<div class="zukait-monthly-kpi"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>').join('')+'</div>';
}
function detailTable(e){
 if(!e.details.length)return '<p class="notice">No completed productive work in this month. ID001 hours are still included above.</p>';
 return '<div class="report-table-wrap zukait-monthly-scroll"><table><thead><tr><th>JC</th><th>Vehicle / Registration</th><th>Finished (Oman)</th><th>Allocated</th><th>Actual</th><th>Efficiency</th><th>Vehicle status</th></tr></thead><tbody>'+
 e.details.map(r=>'<tr><td><b>'+esc(r.jc)+'</b></td><td>'+esc(r.vehicle)+'<small class="zukait-monthly-sub">'+esc(r.registration)+'</small></td><td>'+esc(when(r.completedAt))+'</td><td>'+fmt(r.allocated)+'</td><td>'+fmt(r.actual)+'</td><td>'+pct(r.efficiency)+'</td><td>'+(r.delivered?'Delivered':'Not delivered')+'</td></tr>').join('')+
 '</tbody></table></div>';
}
const note='<p class="zukait-monthly-note">Completed work is selected by the technician finish date in Oman. Allocated and actual productive time cover each finished assignment, including work done before this month. Efficiency = total allocated ÷ total actual × 100, not an average of job percentages. ID001 includes normal duty hours in the selected month only; it is not added to productive actual or efficiency. Repeat, overtime and Mechanical department jobs are excluded from Body Workshop performance. Delivered status reflects the current vehicle status.</p>';
const styles='<style>.zukait-monthly-report{color:#18324d;font-size:14px}.zukait-monthly-report label{display:grid;gap:5px;color:#284767;font-weight:700}.zukait-monthly-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:14px 0}.zukait-monthly-toolbar input,.zukait-monthly-toolbar select{min-height:44px;min-width:160px;border-radius:10px;border:1px solid #b6cbe1;background:#fff;color:#1c3554;padding:8px}.zukait-monthly-toolbar button{min-height:44px}.zukait-monthly-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:9px;margin:12px 0}.zukait-monthly-kpi{border:1px solid #d2e1ee;border-radius:12px;background:#f4f8fd;padding:12px;display:grid;gap:8px}.zukait-monthly-kpi span{font-size:12px;font-weight:750;color:#486482}.zukait-monthly-kpi b{font-size:18px;color:#153e65;font-variant-numeric:tabular-nums}.zukait-monthly-scroll{overflow-x:auto}.zukait-monthly-scroll table{min-width:650px;width:100%}.zukait-monthly-scroll th,.zukait-monthly-scroll td{font-size:13px;padding:10px 8px;text-align:left;vertical-align:middle}.zukait-monthly-sub{display:block;color:#647b90;margin-top:4px}.zukait-monthly-note{font-size:12px;line-height:1.5;color:#4b6279;margin:15px 0}.zukait-monthly-report .zukait-monthly-employee{min-width:110px;text-align:left;font-weight:750}.zukait-monthly-report [data-monthly-employee]:focus-visible{outline:3px solid #2563eb;outline-offset:2px}@media(max-width:480px){.zukait-monthly-toolbar{align-items:stretch}.zukait-monthly-toolbar label{flex:1 1 100%}.zukait-monthly-toolbar select,.zukait-monthly-toolbar input{width:100%}.zukait-monthly-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>';
function employeeUI(){
 const people=(stateData().users||[]).filter(u=>u?.role==='Employee');
 return '<section class="zukait-monthly-report" id="zukaitEmployeePerformance">'+styles+'<h3>Employee Completed-Work Performance</h3><div class="zukait-monthly-toolbar"><label>Month (Oman)<input type="month" id="empRptMonth" value="'+currentMonth()+'" onchange="refreshEmployeeReport()"></label><label>Employee<select id="empReportPerson" onchange="refreshEmployeeReport()">'+people.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>').join('')+'</select></label><button class="green" onclick="exportManagerReport(\'employee\')">Export Excel</button></div><div id="empReportResults"></div></section>';
}
function monthlyUI(){
 return '<section class="zukait-monthly-report" id="zukaitAllEmployeePerformance">'+styles+'<h3>Monthly Employee Performance — All Employees</h3><div class="zukait-monthly-toolbar"><label>Month (Oman)<input id="monthlyReportMonth" type="month" value="'+currentMonth()+'" onchange="refreshMonthlyReport()"></label><button class="green" onclick="exportManagerReport(\'monthly\')">Export Excel</button></div><div id="monthlyReportResults"></div></section>';
}
function renderEmployee(){
 const month=document.getElementById('empRptMonth')?.value||currentMonth(),id=document.getElementById('empReportPerson')?.value;
 const result=document.getElementById('empReportResults'),report=employeeMonthReport(stateData(),month);
 if(!result)return;
 const e=report?.employees.find(x=>x.id===id);result.innerHTML=e?summaryCards(e)+detailTable(e)+(e.missingTime?'<p class="notice">'+e.missingTime+' finished assignment(s) have no recorded productive time and are excluded from efficiency.</p>':'')+note:'<p class="notice">Select a valid employee and month.</p>';
}
function renderMonthly(){
 const month=document.getElementById('monthlyReportMonth')?.value||currentMonth(),result=document.getElementById('monthlyReportResults'),report=employeeMonthReport(stateData(),month);
 if(!result)return;
 if(!report){result.innerHTML='<p class="notice">Select a valid month.</p>';return;}
 const total=report.totals;
 result.innerHTML='<div class="zukait-monthly-summary">'+[
 ['Employees',total.employees],['Unique completed vehicles',total.completedVehicles],['Finished assignments',total.completedAssignments],
 ['Allocated',fmt(total.suggested)],['Actual productive',fmt(total.actual)],['Efficiency',pct(total.efficiency)],['Total ID001',fmt(total.id001)]
 ].map(([label,v])=>'<div class="zukait-monthly-kpi"><span>'+esc(label)+'</span><b>'+esc(v)+'</b></div>').join('')+'</div>'+
 '<div class="report-table-wrap zukait-monthly-scroll"><table><thead><tr><th>Employee</th><th>Department</th><th>Completed vehicles</th><th>Delivered (now)</th><th>Allocated</th><th>Actual</th><th>Efficiency</th><th>ID001 hours</th></tr></thead><tbody>'+
 report.employees.map(e=>'<tr><td><button class="secondary zukait-monthly-employee" data-monthly-employee="'+esc(e.id)+'">'+esc(e.name)+'</button></td><td>'+esc(e.department||'—')+'</td><td>'+e.completedVehicles+'</td><td>'+e.deliveredVehicles+'</td><td>'+fmt(e.suggested)+'</td><td>'+fmt(e.actual)+'</td><td>'+pct(e.efficiency)+'</td><td><b>'+fmt(e.id001)+'</b></td></tr>').join('')+
 '</tbody></table></div>'+(total.missingTime?'<p class="notice">'+total.missingTime+' finished assignment(s) have no productive time logged and are excluded from efficiency totals.</p>':'')+note;
 result.querySelectorAll('[data-monthly-employee]').forEach(button=>button.onclick=()=>openEmployee(button.dataset.monthlyEmployee,month));
}
function openEmployee(id,month){
 if(typeof window.showReportTab!=='function')return;
 window.showReportTab('employee');
 const person=document.getElementById('empReportPerson'),picker=document.getElementById('empRptMonth');
 if(person)person.value=id;if(picker)picker.value=month;
 renderEmployee();
}
function exportReport(type){
 const eMonth=document.getElementById(type==='monthly'?'monthlyReportMonth':'empRptMonth')?.value||currentMonth();
 const report=employeeMonthReport(stateData(),eMonth);if(!report)return;
 if(typeof window.downloadExcelFile!=='function')return;
 if(type==='monthly'){
  window.downloadExcelFile('zukait-employee-performance-'+eMonth,
   ['Employee','Department','Completed Vehicles','Delivered Now','Finished Assignments','Allocated','Actual Productive','Efficiency','ID001 Hours'],
   report.employees.map(e=>[e.name,e.department,e.completedVehicles,e.deliveredVehicles,e.completedAssignments,fmt(e.suggested),fmt(e.actual),pct(e.efficiency),fmt(e.id001)]));
 }else{
  const emp=document.getElementById('empReportPerson')?.value,e=report.employees.find(x=>x.id===emp);if(!e)return;
  window.downloadExcelFile('zukait-employee-'+emp+'-performance-'+eMonth,
   ['Employee','JC Number','Vehicle','Registration','Completed (Oman)','Allocated','Actual','Efficiency','Delivered Now','Employee Total ID001'],
   e.details.map(d=>[e.name,d.jc,d.vehicle,d.registration,when(d.completedAt),fmt(d.allocated),fmt(d.actual),pct(d.efficiency),d.delivered?'Yes':'No',fmt(e.id001)]).concat(e.details.length?[]:[[e.name,'No completed jobs','','','','','','','',fmt(e.id001)]]));
 }
}
if(typeof window!=='undefined'){
 const oldExport=window.exportManagerReport;
 window.employeeReportUI=employeeUI;
 window.monthlyReportUI=monthlyUI;
 window.refreshEmployeeReport=renderEmployee;
 window.refreshMonthlyReport=renderMonthly;
 window.exportManagerReport=function(type){
  if(type==='employee'||type==='monthly')return exportReport(type);
  return typeof oldExport==='function'?oldExport.apply(this,arguments):undefined;
 };
 window.zukaitMonthlyEmployeePerformance={calculate:employeeMonthReport,id001Hours,omanMonth,openEmployee,refreshEmployee:renderEmployee,refreshMonthly:renderMonthly};
 const oldTab=window.showReportTab;
 if(typeof oldTab==='function'){
  window.showReportTab=function(tab){
   const result=oldTab.apply(this,arguments);
   if(tab==='employee')renderEmployee();
   if(tab==='monthly')renderMonthly();
   return result;
  };
 }
}
