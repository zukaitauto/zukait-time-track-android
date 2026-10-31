import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {employeeMonthReport,id001Hours,omanMonth} from '../app/src/main/assets/monthly_employee_performance.js';
import {completedRanking} from '../app/src/main/assets/workshop_performance.js';

const om=(day,hour,minute=0)=>Date.parse('2026-10-'+String(day).padStart(2,'0')+'T'+String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')+':00+04:00');
const completed=(id,job,emp,minutes,at)=>({id,job,emp,suggested:minutes,completed:true,completedAt:at});
const session=(id,assignmentId,job,emp,start,end,extras={})=>({id,assignmentId,job,emp,start,end,...extras});
const state={
 users:[
  {id:'E1',name:'Akhil',role:'Employee',department:'Denter'},
  {id:'E2',name:'Yousuf',role:'Employee',department:'Painter'},
  {id:'E3',name:'Mechanical Worker',role:'Employee',department:'Mechanic'},
  {id:'E4',name:'Pramod',role:'Employee',department:'Denter'}
 ],
 jobs:[{no:'J100',vehicle:'Toyota Corolla',reg:'ABC123',delivered:true},{no:'J200',vehicle:'Nissan',delivered:false},{no:'J300',vehicle:'Honda',delivered:true}],
 assign:[
  completed('A','J100','E1',120,om(1,12)),
  completed('B','J100','E1',60,om(3,11)),
  completed('C','J200','E2',120,om(2,12)),
  completed('M','J300','E3',80,om(1,12)),
  completed('P','J100','E4',60,om(1,10)),
  {...completed('R','J200','E2',900,om(3,12)),rework:true},
  {...completed('X','J200','E2',900,om(3,12)),cancelled:true},
  {id:'U',job:'J200',emp:'E1',suggested:9000,completed:false}
 ],
 sessions:[
  session('SA','A','J100','E1',om(1,8),om(1,9)),
  session('SB','B','J100','E1',om(3,8),om(3,10)),
  session('SC','C','J200','E2',om(2,8),om(2,9)), // Friday: zero productive time
  session('SM','M','J300','E3',om(1,8),om(1,9)), // Separate Mechanical dept
  session('SP','P','J100','E4',om(1,8),om(1,9)),
  session('SR','R','J200','E2',om(3,8),om(3,10)),
  session('SU','U','J200','E1',om(3,8),om(3,10)),
  session('ID1',null,'ID001','E1',om(1,12,30),om(1,15,30)), // 1h duty
  session('ID2',null,'ID001','E1',om(2,8),om(2,10)), // Friday zero
  session('ID3',null,'ID001','E1',om(31,18),om(31,20)), // Only 1h before duty end
  session('ID3',null,'ID001','E1',om(31,18),om(31,20)), // Sync duplicate
  session('ID4',null,'ID001','E1',om(3,15),om(3,17),{cancelled:true}),
  session('ID5',null,'ID001','E1',om(5,8),om(5,9)), // Workshop holiday excluded
  session('ID6',null,'ID001','E2',om(3,15),om(3,17))
 ],
 workshopHolidays:['2026-10-05']
};
const before=JSON.stringify(state),at=om(31,23);
const bounds=omanMonth('2026-10');
assert.equal(bounds.from,Date.parse('2026-09-30T20:00:00Z'));
assert.equal(bounds.to,Date.parse('2026-10-31T20:00:00Z'));
assert.equal(omanMonth('2026-13'),null);
const report=employeeMonthReport(state,'2026-10',at);
assert.equal(report.employees.length,4,'all employees must appear, including those with no Body Workshop completions');
const akhil=report.employees.find(r=>r.id==='E1');
assert.equal(akhil.completedAssignments,2,'both separate technician finishes retained');
assert.equal(akhil.completedVehicles,1,'same JC counted as one vehicle per employee');
assert.equal(akhil.deliveredVehicles,1);
assert.equal(akhil.suggested,180);
assert.equal(akhil.actual,180);
assert.equal(akhil.efficiency,100,'weighted efficiency calculated from the summed allocated/actual minutes');
assert.equal(akhil.id001,120,'ID001 duty clipped to morning and afternoon windows; excludes Fri, holiday, cancelled and duplicate sessions');
assert.equal(id001Hours(state,'E1','2026-10',at),120);
assert.equal(id001Hours(state,'E1','2026-11',at),0);
const zero=report.employees.find(r=>r.id==='E2');
assert.equal(zero.completedVehicles,1,'finished vehicle with zero duty time still visible');
assert.equal(zero.missingTime,1,'flag missing time');
assert.equal(zero.efficiency,null,'zero actual cannot inflate efficiency');
assert.equal(zero.suggested,0,'zero-time suggested excluded from aggregate calculation');
assert.equal(zero.id001,120,'ID001 appears even if no productive hours for employee');
assert.equal(report.employees.find(r=>r.id==='E3').completedVehicles,0,'mechanical jobs isolated from Body Workshop report');
assert.equal(report.totals.completedVehicles,2,'workshop-wide distinct JC count not multiplied by employee');
assert.equal(report.totals.completedAssignments,4);
assert.equal(report.totals.id001,240);
const rank=completedRanking(state,'2026-10',at);
assert.equal(rank.find(r=>r.id==='E1').efficiency,akhil.efficiency,'uses existing verified efficiency calculation');
assert.equal(JSON.stringify(state),before,'reports must not write to working state');
assert.equal(employeeMonthReport(state,'2026-11',at).totals.completedAssignments,0,'Oman monthly boundary');

const html=readFileSync(new URL('../app/src/main/assets/offline_test.html',import.meta.url),'utf8');
const src=readFileSync(new URL('../app/src/main/assets/monthly_employee_performance.js',import.meta.url),'utf8');
assert.match(html,/type="module" src="monthly_employee_performance\.js\?v=/,'module is loaded into existing Reports');
assert.match(src,/window\.employeeReportUI=employeeUI/,'existing Employee tab replaced');
assert.match(src,/window\.monthlyReportUI=monthlyUI/,'existing Monthly tab replaced');
assert.match(src,/window\.exportManagerReport=function/,'Excel export uses consolidated report');
assert.match(src,/data-monthly-employee/,'employee drilldown available in all-staff table');
assert.match(src,/ID001 hours/,'ID001 included as a column in same report');
console.log('Monthly employee completed-vehicle, efficiency and ID001 integrated Reports: PASS');
