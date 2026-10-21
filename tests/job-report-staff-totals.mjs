import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const assignments=[
 {id:'first',emp:'EMP002',job:'12043',suggested:330,minutes:100,completed:true},
 {id:'second',emp:'EMP002',job:'12043',suggested:210,minutes:80,completed:true},
 {id:'other',emp:'EMP019',job:'12043',suggested:210,minutes:60,completed:true},
 {id:'cancelled',emp:'EMP002',job:'12043',suggested:999,minutes:999,cancelled:true}
];
const before=JSON.stringify(assignments);
const updates=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const begin=updates.indexOf('/* V140 MANAGER JOB CARD REVIEW');
const end=updates.indexOf('})();',begin)+5;
let printed='',pdf='';
const context={state:{assign:assignments,sessions:[],labourRate:2.5},job:no=>({no,vehicle:'Test',reg:'ABC'}),user:emp=>({name:emp==='EMP002'?'Akhil':'Other',department:'Denter'}),fmt:n=>String(n)+' min',totalForAssignment:a=>a.minutes,alert:assert.fail,Date};
context.window={AndroidBridge:{printHtml:html=>printed=html,shareHtmlAsPdf:html=>pdf=html}};
context.AndroidBridge=context.window.AndroidBridge;
vm.runInNewContext(updates.slice(begin,end),context);
context.window.v140PrintManagerJob('12043');
assert.equal((printed.match(/<td>Akhil<\/td>/g)||[]).length,1,'one technician row in print');
assert.ok(printed.includes('<td>540 min</td><td>180 min</td>'),'suggested and actual both summed once');
assert.ok(printed.includes('OMR 22.500'),'suggested cost uses grouped total');
assert.ok(!printed.includes('999 min'),'cancelled assignments excluded');
context.window.v140PdfManagerJob('12043');
assert.equal(pdf,printed,'PDF uses same grouped rows');

const overview=fs.readFileSync('app/src/main/assets/workshop_overview.js','utf8');
const a=overview.indexOf('function woProductionDetail('),b=overview.indexOf('\nfunction detail(',a);
let production='';
const rows=assignments.filter(a=>!a.cancelled);
const p={aa:rows,normal:rows,repeat:[],additionalByAssignment:new Map([['first',60]]),suggested:750,assignedActual:240,actual:240,remaining:510,exceeded:0,eff:null};
const productionContext={woProduction:()=>p,users:[{id:'EMP002',name:'Akhil'},{id:'EMP019',name:'Other'}],woDept:()=> 'denter',woActual:a=>a.minutes,woMins:n=>String(n)+' min',esc:String,stateNow:()=>({sessions:[]}),norm:v=>String(v).toUpperCase(),shell:(_title,html)=>production=html};
vm.runInNewContext(overview.slice(a,b),productionContext);
productionContext.woProductionDetail('12043','denting');
assert.equal((production.match(/<b>Akhil<\/b>/g)||[]).length,1,'one technician in production detail');
assert.ok(production.includes('Approved Total 540 min · Actual 180 min'));
assert.ok(production.includes('Additional +60 min'),'additional allocation retained once');
assert.equal(JSON.stringify(assignments),before,'reporting must not mutate assignment history');
console.log('Grouped Job Card print, PDF and production report regression checks passed');

const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
const reportSource=html.slice(html.indexOf('function groupReportAssignments('),html.indexOf('/* V23 Supervisor'));
const elements={jobReportNo:{value:'12043'},jobResults:{},empReportPerson:{value:'EMP002'},empReportStatus:{value:'All'},monthlyReportMonth:{value:'2026-10'}};
let exported;
const reports={state:{assign:assignments,sessions:[],additionalActions:[]},users:[{id:'EMP002',name:'Akhil',role:'Employee'},{id:'EMP019',name:'Other',role:'Employee'}],me:{id:'MGR001'},job:no=>({no,vehicle:'Test',reg:'ABC'}),user:context.user,fmt:context.fmt,totalForAssignment:context.totalForAssignment,total:()=>assert.fail('aggregate must use exact assignment actual'),empStatus:a=>a.completed?'Completed':'New',now:()=>Date.now(),getRange:()=>[0,Date.now()],document:{getElementById:id=>elements[id]},alert:assert.fail,Date};
vm.runInNewContext(reportSource,reports);
reports.downloadExcelFile=(_name,headers,rows)=>exported={headers,rows};
assert.equal(reports.jobReportData('12043').as.length,2);
reports.refreshJobReport();
assert.equal((elements.jobResults.innerHTML.match(/<td>Akhil<\/td>/g)||[]).length,1);
assert.ok(elements.jobResults.innerHTML.includes('540 min'));
assert.ok(reports.employeeReportTable('EMP002',0,Date.now(),'All').includes('540 min'));
reports.exportManagerReport('job');
assert.equal(exported.rows.length,2);
assert.equal(exported.rows[0][4],'540 min');
reports.exportManagerReport('employee');
assert.equal(exported.rows.length,1);
assert.equal(exported.rows[0][4],'540 min');
reports.state.assign=[...assignments,{id:'other-addition',emp:'EMP019',job:'12043',suggested:90,minutes:20,completed:true}];
reports.exportManagerReport('job');
assert.equal(exported.rows.length,2,'every staff member is grouped, not only Akhil');
assert.equal(exported.rows[1][4],'300 min');
assert.equal(exported.rows[1][5],'80 min');
assert.equal(reports.jobReportData('12043').suggested,840);
assert.equal(reports.jobReportData('12043').actual,260);
console.log('Employee and job reports, Excel exports, all-staff grouping and inline syntax checks passed');
