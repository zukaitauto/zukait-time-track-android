import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const start=src.indexOf('/* V123 MANAGER WORKSHOP PERFORMANCE'),end=src.indexOf('/* V106 ID001 FINAL AUTHORITY',start),block=src.slice(start,end);
const at=Date.parse('2026-10-01T08:00:00Z'),finish=Date.parse('2026-10-01T05:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[at]))}static now(){return at}}
const state={jobs:[{no:'SHARED',vehicle:'Toyota Corolla'},{no:'OLD',vehicle:'Suzuki Swift'}],assign:[
 {id:'FIN',job:'SHARED',emp:'E1',completed:true,completedAt:finish,suggested:240},
 {id:'OPEN',job:'SHARED',emp:'E2',completed:false,suggested:600},
 {id:'SECOND',job:'SHARED',emp:'E3',completed:true,completedAt:finish-1000,suggested:60},
 {id:'CANCEL',job:'SHARED',emp:'E4',completed:true,cancelled:true,completedAt:finish,suggested:600},
 {id:'REPEAT',job:'SHARED',emp:'E4',completed:true,rework:true,completedAt:finish,suggested:600},
 {id:'ID',job:'ID001',emp:'E4',completed:true,completedAt:finish,suggested:600},
 {id:'PREVIOUS',job:'OLD',emp:'E1',completed:true,completedAt:Date.parse('2026-09-30T19:59:59Z'),suggested:600},
 {id:'MISSING',job:'OLD',emp:'E1',completed:true,suggested:600}
],sessions:[]};
const mins={FIN:120,SECOND:60,OPEN:1000};const calls=[];
const ctx={state,Date:Clock,Intl,Set,Map,Number,Math,window:{v107AssignmentNormal(a,from,to){calls.push({id:a.id,from,to});return mins[a.id]||0}},user:id=>({name:'Technician '+id}),job:no=>state.jobs.find(j=>j.no===no),fmt:m=>Math.floor(m/60)+'h '+Math.round(m%60)+'m',me:{role:'Manager'},document:{getElementById(){return null},createElement(){return{}},head:{appendChild(){}}},setTimeout(){},openModal(html){ctx.modal=html}};
vm.runInNewContext(block.replace(' window.v123ManagerPerformanceOpen=open;',' window.__performance=finishedPerformance;window.__data=data;window.__detail=performanceDetail;window.v123ManagerPerformanceOpen=open;'),ctx);
let x=ctx.window.__performance();assert.equal(x.rows.length,2);assert.equal(x.jcCount,1);assert.equal(x.sg,300);assert.equal(x.ac,180);assert.equal(x.eff,300/180*100,'aggregate efficiency uses summed hours, not average percentages');assert.equal(x.cost,7.5);assert.equal(x.from,Date.parse('2026-09-30T20:00Z'));assert.equal(x.to,Date.parse('2026-10-31T20:00Z'));
assert.ok(calls.every(c=>c.from===0&&c.to===state.assign.find(a=>a.id===c.id).completedAt),'include full prior-month work but stop at finish timestamp');
ctx.window.v123ManagerPerformanceOpen('eff');assert.match(ctx.modal,/Technician E1/);assert.match(ctx.modal,/Technician E3/);assert.doesNotMatch(ctx.modal,/<td>Technician E2<\/td>/);assert.match(ctx.modal,/1 job cards · 2 finished assignments/);assert.match(ctx.modal,/166.7%/);assert.match(ctx.modal,/7.500 OMR/);assert.match(ctx.modal,/zukaitOpenJobReview360\(this.dataset.job\)/);const eff=ctx.modal;ctx.window.v123ManagerPerformanceOpen('cost');assert.match(ctx.modal,/Labour Cost/);assert.equal(ctx.modal.slice(ctx.modal.indexOf('<section')),eff.slice(eff.indexOf('<section')),'efficiency and labour cost show identical contributing rows');
const before=JSON.stringify(state);mins.OPEN=10000;assert.equal(ctx.window.__performance().ac,180,'unfinished live work cannot change finished totals');assert.equal(JSON.stringify(state),before,'reports never mutate workflow records');
state.assign[0].completed=false;assert.equal(ctx.window.__performance().sg,60,'reopened technician is removed while other finished staff remain');state.assign[0].completed=true;
state.assign[0].completedAt=Date.parse('2026-09-30T19:59:59Z');assert.equal(ctx.window.__performance().sg,60,'previous Oman month excluded');state.assign[0].completedAt=Date.parse('2026-10-31T20:00Z');assert.equal(ctx.window.__performance().sg,60,'next month boundary excluded');state.assign[0].completedAt=finish;
ctx.window.v123ManagerPerformanceRange('today');assert.equal(ctx.window.__performance().from,Date.parse('2026-09-30T20:00Z'));assert.equal(ctx.window.__performance().to,Date.parse('2026-10-01T20:00Z'));
state.assign[0].completed=false;state.assign[2].completed=false;x=ctx.window.__performance();assert.equal(x.eff,null);assert.equal(x.cost,0);ctx.window.v123ManagerPerformanceOpen('eff');assert.match(ctx.modal,/No finished technician assignments/);assert.match(ctx.modal,/Efficiency: <strong>—/);
state.assign[0].completed=true;mins.FIN=0;assert.equal(ctx.window.__performance().eff,null,'zero actual does not divide by zero');
console.log('Finished-assignment performance passed: shared JCs, only finished technicians, full history, Oman date boundaries, weighted totals, consistent drilldowns, reopen and read-only reports.');
