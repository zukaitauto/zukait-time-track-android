import assert from 'node:assert/strict';
import {overAllocatedRows,overAllocatedJobGroups,completedRanking} from '../app/src/main/assets/workshop_performance.js';
const t=hour=>Date.parse('2026-10-05T'+String(hour).padStart(2,'0')+':00:00+04:00');
const a={id:'A',job:'JC1',emp:'E',suggested:60,assignedAt:t(8)},s={id:'S',assignmentId:'A',job:'JC1',emp:'E',start:t(8),end:null};
const data={jobs:[{no:'JC1'}],users:[{id:'E',name:'Employee',department:'Denter'}],assign:[a],sessions:[s]};
assert.equal(overAllocatedRows(data,t(9)).length,0);
assert.equal(overAllocatedRows(data,t(10))[0].exceeded,60,'running normal time');
s.end=t(10);assert.equal(overAllocatedRows(data,t(11))[0].exceeded,60,'pause stops accumulation');
data.sessions.push({...s});data.assign.push({...a});assert.equal(overAllocatedRows(data,t(11))[0].exceeded,60,'assignment/session IDs counted once');
data.assign=[a];a.suggested=90;assert.equal(overAllocatedRows(data,t(11))[0].exceeded,30,'manager allocation correction');
data.sessions=[{...s,end:t(9)}];assert.equal(overAllocatedRows(data,t(11)).length,0,'manager session correction');
data.sessions=[{...s,start:t(18),end:t(21)}];assert.equal(overAllocatedRows(data,t(21)).length,0,'overtime excluded');
data.sessions=[s];a.suggested=60;a.completed=true;a.completedAt=t(10);
assert.equal(overAllocatedRows(data,t(11)).length,0,'finished assignment leaves active-overrun report');
assert.equal(completedRanking(data,'2026-10',t(11))[0].efficiency,50);
assert.equal(completedRanking(data,'2026-09',t(11)).length,0);
for(const patch of [{cancelled:true},{rework:true},{repeat:true},{job:'ID001'}]){const d={...data,assign:[{...a,...patch}]};assert.equal(completedRanking(d,'2026-10',t(11)).length,0);}
const b={id:'B',job:'JC2',emp:'E',suggested:180,completed:true,completedAt:t(12)};data.assign.push(b);data.sessions.push({id:'S2',assignmentId:'B',job:'JC2',emp:'E',start:t(10),end:t(12)});
assert.equal(completedRanking(data,'2026-10',t(13))[0].efficiency,100,'weighted totals, not average of percentages');
assert.equal(completedRanking(data,'2026-10',t(13))[0].jobs,2);
data.users[0].department='Mechanic';assert.equal(completedRanking(data,'2026-10',t(13)).length,0,'Mechanical work excluded from Body ranking');

// Every JC must show its real vehicle, job type and each separate employee.
// Reuse the authoritative per-assignment normal-duty calculation and do not
// substitute total JC elapsed time or combine two workers into a false person.
const reportData={
 jobs:[
  {no:'12021',vehicle:'Toyota Camry 2020',reg:'1234 AB',jobType:'INSURANCE'},
  {no:'12036',make:'Honda',model:'Accord',year:2022,reg:'7890 CD',jobType:'CASH'},
  {no:'12083',vehicle:'Nissan Patrol',jobType:'CREDIT'}
 ],
 users:[
  {id:'E1',name:'Pramod',department:'Denter'},
  {id:'E2',name:'Zaheer',department:'Painter'}
 ],
 assign:[
  {id:'RA',job:'12021',emp:'E1',suggested:30},
  {id:'RB',job:'12021',emp:'E2',suggested:60},
  {id:'RC',job:'12036',emp:'E1',suggested:90},
  {id:'RD',job:'12083',emp:'E2',suggested:110}
 ],
 sessions:[
  ...[['RA','12021','E1'],['RB','12021','E2'],['RC','12036','E1'],['RD','12083','E2']].map(([assignmentId,job,emp])=>({
   id:'session-'+assignmentId,assignmentId,job,emp,start:t(8),end:t(10)
  }))
 ]
};
const grouped=overAllocatedJobGroups(reportData,t(10));
assert.deepEqual(grouped.map(x=>x.jobCard),['12021','12036','12083'],'sorted by total excess');
assert.equal(grouped[0].jobType,'Insurance');
assert.equal(grouped[0].vehicle,'Toyota Camry 2020');
assert.equal(grouped[0].registration,'1234 AB');
assert.equal(grouped[0].exceeded,150,'two employee overruns summed for one JC');
assert.deepEqual(grouped[0].employees.map(e=>[e.name,e.suggested,e.actual,e.exceeded]),
 [['Pramod',30,120,90],['Zaheer',60,120,60]],'all exceeding employees shown distinctly');
assert.equal(grouped[1].vehicle,'Honda Accord 2022','vehicle fallback uses make / model / year');
assert.equal(grouped[1].jobType,'Cash');
assert.equal(grouped[1].employees[0].exceeded,30);
assert.equal(grouped[2].jobType,'Credit');
assert.equal(grouped[2].exceeded,10);
assert.equal(grouped.reduce((n,g)=>n+g.exceeded,0),190,'not doubled across assignments');
reportData.jobs[1].jobType=undefined;
assert.equal(overAllocatedJobGroups(reportData,t(10))[1].jobType,'Not recorded','never mislabel missing financial type');
reportData.jobs[1].delivered=true;
assert.equal(overAllocatedJobGroups(reportData,t(10)).some(g=>g.jobCard==='12036'),false,'delivered JC excluded');
reportData.jobs[1].delivered=false;
reportData.users[1].department='Mechanic';
assert.equal(overAllocatedJobGroups(reportData,t(10)).find(g=>g.jobCard==='12021').employees.length,1,'Mechanical employees excluded');

console.log('PASS V377 performance: start/pause/finish, manager corrections, deduplication, duty/overtime, weighted ranking, month and department isolation');
