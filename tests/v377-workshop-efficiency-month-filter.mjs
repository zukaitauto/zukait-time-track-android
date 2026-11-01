// Workshop Efficiency popup must allow viewing previous Oman months from the Manager card.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../app/src/main/assets/offline_test.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../app/src/main/assets/v74_updates.js',import.meta.url),'utf8');
const start=source.indexOf('/* V123 MANAGER WORKSHOP PERFORMANCE'),end=source.indexOf('/* V106 ID001 FINAL AUTHORITY',start);
assert.ok(start>=0&&end>start,'legacy detail popup is present');
const block=source.slice(start,end);
const at=Date.parse('2026-11-01T05:00:00Z');
class Clock extends Date{
 constructor(...args){super(...(args.length?args:[at]));}
 static now(){return at}
}
const oman=(m,d,h)=>Date.parse('2026-'+m+'-'+d+'T'+h+':00:00+04:00');
const october={id:'OCT',job:'12043',emp:'EMP002',completed:true,completedAt:oman('10','21','16'),suggested:180};
const november={id:'NOV',job:'12133',emp:'EMP002',completed:true,completedAt:oman('11','01','10'),suggested:75};
const september={id:'SEP',job:'11953',emp:'EMP002',completed:true,completedAt:oman('09','30','12'),suggested:300};
const repeat={id:'REWORK',job:'12000',emp:'EMP002',completed:true,rework:true,completedAt:oman('10','20','10'),suggested:7000};
const state={assign:[october,november,september,repeat,{id:'WAIT',job:'ID001',emp:'EMP002',completed:true,completedAt:oman('10','21','11'),suggested:5000}],jobs:[],sessions:[]};
const actuals={OCT:120,NOV:75,SEP:200,REWORK:900,WAIT:950};
let modal='',reads=[];
const ctx={
 Date:Clock,Math,Number,String,JSON,Set,Map,Intl,state,me:{id:'MAN',role:'Manager'},window:{
  v107AssignmentNormal:a=>actuals[a.id]??0,
  zukaitWorkshopPerformance:{completedRows:(from,to)=>{reads.push({from,to});return state.assign.filter(a=>a.completed&&!a.rework&&a.job!=='ID001'&&a.completedAt>=from&&a.completedAt<to).map(a=>({a,sg:a.suggested,ac:actuals[a.id]}));}},
  openEmployeeEfficiency:()=>{}
 },user:id=>({name:id==='EMP002'?'Akhil':'Manager'}),
 job:no=>({no,vehicle:'Toyota Land Cruiser'}),fmt:minutes=>Math.floor(minutes/60)+'h '+String(Math.round(minutes%60)).padStart(2,'0')+'m',
 document:{createElement:()=>({style:{}}),head:{appendChild:()=>{}},getElementById:()=>null},
 openModal:text=>{modal=text},setTimeout:()=>{},
};
vm.runInNewContext(block,ctx);
const unchanged=JSON.stringify(state);
ctx.window.v123ManagerPerformanceOpen('eff');
assert.match(modal,/Report month \(Oman\)/,'month filter visible inside popup');
assert.match(modal,/id="v123EfficiencyMonth" type="month" value="2026-11"/,'current Oman month defaults to November');
assert.match(modal,/12133/,'default current month includes November completion');
assert.doesNotMatch(modal,/12043/,'default November excludes October completion');
ctx.window.v123ManagerPerformanceMonth('2026-10');
assert.match(modal,/value="2026-10"/,'picker retains October when changed');
assert.match(modal,/October 2026 · Finished technician assignments/);
assert.match(modal,/12043/,'October finished JC appears');
assert.match(modal,/1 job cards · 1 finished assignments/,'deduped job cards and completed technician assignments');
assert.match(modal,/Efficiency: <strong>150.0%/,'weighted October efficiency preserved');
assert.doesNotMatch(modal,/12133/,'November completion does not leak into October');
assert.doesNotMatch(modal,/11953/,'September finish does not leak into October');
assert.doesNotMatch(modal,/REWORK/,'repeat work excluded');
assert.match(modal,/data-month="2026-10" onclick="openEmployeeEfficiency\(this.dataset.month\)"/,'ranking button passes selected month');
assert.deepEqual(Array.from(reads.slice(-1),x=>[x.from,x.to]),[[Date.parse('2026-09-30T20:00:00Z'),Date.parse('2026-10-31T20:00:00Z')]],'Oman month exact boundaries');
const beforeInvalid=modal;
ctx.window.v123ManagerPerformanceMonth('2026-13');
assert.equal(modal,beforeInvalid,'invalid month cannot change current report');
assert.equal(JSON.stringify(state),unchanged,'month filter does not change employee records');
assert.match(html,/window\.v123ManagerPerformanceOpen\('eff'\)/,'Workshop Efficiency tile opens the filtered popup');
console.log('V377 Workshop Efficiency month filter: current/previous Oman months, weighted totals, zero data edits, ranking handoff PASS');
