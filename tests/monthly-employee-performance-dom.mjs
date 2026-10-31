// Manager Reports DOM integration, including mobile-sized Employee and Monthly views.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<!doctype html><html><body><div id="reportContent"></div></body></html>',{
 url:'https://zukait.example.test/',pretendToBeVisual:true,runScripts:'outside-only'
});
const win=dom.window,doc=win.document,ctx=dom.getInternalVMContext();
const om=(d,h,m=0)=>Date.parse('2026-10-'+String(d).padStart(2,'0')+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00+04:00');
const data={
 users:[{id:'EMP002',name:'Akhil',role:'Employee',department:'Denter'},
        {id:'EMP012',name:'Jijesh',role:'Employee',department:'Painter'}],
 jobs:[{no:'12043',vehicle:'Toyota Land Cruiser',reg:'516.DD',delivered:true},
       {no:'12008',vehicle:'Nissan Versa',reg:'19697.HH',delivered:false}],
 assign:[{id:'A1',job:'12043',emp:'EMP002',suggested:180,completed:true,completedAt:om(6,12)},
         {id:'A2',job:'12043',emp:'EMP002',suggested:60,completed:true,completedAt:om(7,12)},
         {id:'B1',job:'12008',emp:'EMP012',suggested:120,completed:true,completedAt:om(9,10)}],
 sessions:[{id:'S1',assignmentId:'A1',job:'12043',emp:'EMP002',start:om(6,8),end:om(6,10)},
           {id:'S2',assignmentId:'A2',job:'12043',emp:'EMP002',start:om(7,8),end:om(7,9)},
           {id:'S3',assignmentId:'B1',job:'12008',emp:'EMP012',start:om(9,8),end:om(9,9)},
           {id:'ID',job:'ID001',emp:'EMP002',start:om(6,15),end:om(6,16)}]
};
win.state=data;win.users=data.users;
win.downloadExcelFile=(file,headers,rows)=>{win.__lastExport={file,headers,rows};};
win.exportManagerReport=()=>{};
win.employeeReportUI=()=>'<h3>OLD EMPLOYEE REPORT</h3>';
win.monthlyReportUI=()=>'<h3>OLD MONTHLY REPORT</h3>';
win.showReportTab=tab=>{
 doc.getElementById('reportContent').innerHTML=tab==='employee'?win.employeeReportUI():win.monthlyReportUI();
};
function load(path){
 return readFileSync(new URL('../'+path,import.meta.url),'utf8');
}
const rules=load('app/src/main/assets/time_management_rules.js').replace(/\bexport /g,'');
const engine=load('app/src/main/assets/workshop_performance.js').replace(/^import[^\n]*\n/,'').replace(/\bexport /g,'');
const report=load('app/src/main/assets/monthly_employee_performance.js').replace(/^import[^\n]*\n/gm,'').replace(/\bexport /g,'');
const worked=vm.runInContext(rules+'\nworkedMinutes',ctx);
ctx.workedMinutes=worked;
const normal=vm.runInContext(engine+'\nnormalAssignments',ctx);
ctx.normalAssignments=normal;
vm.runInContext(report,ctx);
assert.equal(typeof win.zukaitMonthlyEmployeePerformance?.calculate,'function');

win.showReportTab('monthly');
assert.match(doc.getElementById('reportContent').textContent,/Monthly Employee Performance/);
assert.doesNotMatch(doc.getElementById('reportContent').textContent,/OLD MONTHLY REPORT/);
assert.ok(doc.getElementById('monthlyReportMonth'));
assert.match(doc.getElementById('monthlyReportResults').textContent,/Akhil/);
assert.match(doc.getElementById('monthlyReportResults').textContent,/Jijesh/);
assert.match(doc.getElementById('monthlyReportResults').textContent,/ID001 hours/);
assert.match(doc.getElementById('monthlyReportResults').textContent,/100\.0%/);
const row=[...doc.querySelectorAll('#monthlyReportResults tbody tr')].find(tr=>tr.textContent.includes('Akhil'));
assert.ok(row);
assert.equal(row.querySelectorAll('td')[2].textContent,'1','deduplicate 12043 to one vehicle');
assert.equal(row.querySelectorAll('td')[7].textContent,'1h 00m','ID001 is in the same row');
assert.ok(doc.querySelector('[data-monthly-employee="EMP002"]'),'all-employee drilldown button available');
win.exportManagerReport('monthly');
assert.ok(win.__lastExport.headers.includes('ID001 Hours'),'monthly Excel includes ID001');

doc.querySelector('[data-monthly-employee="EMP002"]').click();
assert.match(doc.getElementById('reportContent').textContent,/Employee Completed-Work Performance/);
assert.equal(doc.getElementById('empReportPerson').value,'EMP002');
assert.equal(doc.getElementById('empRptMonth').value,'2026-10');
assert.match(doc.getElementById('empReportResults').textContent,/12043/);
assert.match(doc.getElementById('empReportResults').textContent,/ID001 waiting/);
assert.equal(doc.querySelectorAll('#empReportResults tbody tr').length,2,'individual finished assignments shown separately');
win.exportManagerReport('employee');
assert.ok(win.__lastExport.headers.includes('Employee Total ID001'),'employee Excel includes ID001');
doc.getElementById('empReportPerson').value='EMP012';
win.refreshEmployeeReport();
assert.match(doc.getElementById('empReportResults').textContent,/12008/,'employee selection updates the view');
assert.match(doc.getElementById('empReportResults').textContent,/Not delivered/,'open vehicle not counted as delivered');

const markup=load('app/src/main/assets/offline_test.html');
assert.match(markup,/type="module" src="monthly_employee_performance\.js\?v=/);
assert.match(report,/@media\(max-width:480px\)/,'small mobile controls are stacked');
assert.match(report,/overflow-x:auto/,'long tables scroll horizontally rather than clipping');
dom.window.close();
console.log('Manager Reports: mobile-sized monthly/employee DOM, vehicle deduplication, ID001 in same table, Excel and drilldowns PASS');
