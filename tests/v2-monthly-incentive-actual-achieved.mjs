import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync(new URL('../app/src/main/assets/v74_updates.js',import.meta.url),'utf8');
const start=source.indexOf('/* V107 INCENTIVE FINAL AUTHORITY');
const end=source.indexOf('/* V108 retired',start);
assert.ok(start>=0&&end>start,'final incentive engine must exist');
const moduleSource=source.slice(start,end);
const t=(day,h,m=0)=>Date.parse('2026-11-'+String(day).padStart(2,'0')+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00+04:00');
function run(data){
 const context={state:data,window:{},Date,Math,console};
 vm.runInNewContext(moduleSource,context);
 return context.window;
}
test('achieved is JC actual duty plus ID001 for finished and unfinished work, with deduplication',()=>{
 const data={assign:[
  {id:'A',emp:'E',job:'J1',suggested:30,completed:true,completedAt:t(2,10)},
  {id:'B',emp:'E',job:'J2',suggested:240,completed:false},
  {id:'H',emp:'E',job:'ID001',suggested:300}
 ],sessions:[
  {id:'a',assignmentId:'A',emp:'E',job:'J1',start:t(2,8),end:t(2,10)},
  {id:'a',assignmentId:'A',emp:'E',job:'J1',start:t(2,8),end:t(2,10)},
  {id:'h',assignmentId:'H',emp:'E',job:'ID001',start:t(2,9),end:t(2,11)},
  {id:'b',assignmentId:'B',emp:'E',job:'J2',start:t(2,11),end:t(2,12)},
  {id:'cancel',assignmentId:'B',emp:'E',job:'J2',start:t(2,12),end:t(2,13),cancelled:true},
  {id:'ot',assignmentId:'B',emp:'E',job:'J2',start:t(2,19),end:t(2,20)}
 ]};
 const r=run(data).incentiveFor('E',t(8,12));
 assert.equal(r.achieved,240,'2h JC + 1h ID001 + 1h unfinished JC');
 assert.equal(r.actual,240);
 assert.equal(r.target,13650,'26 Oman working days x 525 minutes');
 assert.equal(r.excess,90,'Excess remains separate from achieved');
 assert.equal(r.incentive,0);
});
test('Oman month boundaries, Friday and holiday are respected',()=>{
 const data={workshopHolidays:['2026-11-03'],assign:[{id:'A',emp:'E',job:'J1',suggested:800}],sessions:[
  {id:'prev',assignmentId:'A',emp:'E',job:'J1',start:Date.parse('2026-10-31T23:00:00+04:00'),end:Date.parse('2026-11-01T00:00:00+04:00')},
  {id:'today',assignmentId:'A',emp:'E',job:'J1',start:t(2,8),end:t(2,9)},
  {id:'hol',assignmentId:'A',emp:'E',job:'J1',start:t(3,8),end:t(3,9)},
  {id:'fri',assignmentId:'A',emp:'E',job:'J1',start:t(6,8),end:t(6,9)}
 ]};
 const result=run(data).incentiveFor('E',t(8,12));
 assert.equal(result.achieved,60);
 assert.equal(result.target,13125,'Holiday removes a workday');
});
test('repeat JC actual is included once; repeat penalty is separate',()=>{
 const data={assign:[{id:'R',emp:'E',job:'J2',rework:true,mistakeEmp:'E',suggested:60}],sessions:[
  {id:'r',assignmentId:'R',emp:'E',job:'J2',rework:true,start:t(2,8),end:t(2,9)}
 ]};
 const r=run(data).incentiveFor('E',t(8,12));
 assert.equal(r.achieved,60);
 assert.equal(r.repeat,300,'one repeat job deducts fixed five hours');
 assert.equal(r.incentive,0);
});

test('different repeat worker earns actual while original employee receives penalty',()=>{
 const data={assign:[{id:'R',emp:'REPAIR',job:'J2',rework:true,mistakeEmp:'ORIGINAL',suggested:60}],sessions:[{id:'r',assignmentId:'R',emp:'REPAIR',job:'J2',start:t(2,8),end:t(2,9)}]};
 const api=run(data);assert.equal(api.incentiveFor('REPAIR',t(8,12)).achieved,60);assert.equal(api.incentiveFor('REPAIR',t(8,12)).repeat,0);assert.equal(api.incentiveFor('ORIGINAL',t(8,12)).achieved,0);assert.equal(api.incentiveFor('ORIGINAL',t(8,12)).repeat,300);
});

test('one five-hour penalty per repeat cycle, not per worker or continuation month',()=>{
 const october=(d,h)=>Date.parse('2026-10-'+String(d).padStart(2,'0')+'T'+String(h).padStart(2,'0')+':00:00+04:00');
 const assign=[
  {id:'R1',emp:'REPAIR',job:'J7',rework:true,mistakeEmp:'ORIGINAL',repeatCycleNo:1,suggested:90},
  {id:'R2',emp:'OTHER',job:'J7',rework:true,mistakeEmp:'ORIGINAL',repeatCycleNo:1,suggested:90},
  {id:'R3',emp:'REPAIR',job:'J7',rework:true,mistakeEmp:'ORIGINAL',repeatCycleNo:2,suggested:90}
 ];
 const sessions=[
  {id:'a',assignmentId:'R1',emp:'REPAIR',job:'J7',start:october(29,8),end:october(29,9)},
  {id:'b',assignmentId:'R2',emp:'OTHER',job:'J7',start:october(29,10),end:october(29,11)},
  {id:'c',assignmentId:'R1',emp:'REPAIR',job:'J7',start:t(2,8),end:t(2,9)},
  {id:'d',assignmentId:'R3',emp:'REPAIR',job:'J7',start:t(3,8),end:t(3,10)}
 ];
 const api=run({assign,sessions});
 assert.equal(api.incentiveFor('ORIGINAL',october(30,12)).repeat,300,'split cycle charged once in October');
 assert.equal(api.incentiveFor('ORIGINAL',t(8,12)).repeat,300,'November continuation not recharged; second cycle charged');
 assert.equal(api.incentiveFor('REPAIR',t(8,12)).repeat,0,'repair worker not penalized');
});
