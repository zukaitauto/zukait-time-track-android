import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app/src/main/assets/v74_updates.js', 'utf8');
const authority = source.slice(source.indexOf('/* V130 ID001 NORMAL WORKING HOURS FINAL AUTHORITY'));
const setup = authority.slice(authority.indexOf("(function(){'use strict';") + "(function(){'use strict';".length, authority.indexOf(' // Calculation separation:'));
function fixture() {
  const state = {assign: [{id:'normal',job:'JC001',emp:'EMP011',completed:false}],sessions:[]};
  const staff = {id:'EMP011',name:'Surab',role:'Employee',department:'Painter'};
  const ctx = {state,users:[staff],me:{id:'SUP001',role:'Supervisor'},Date,
    user:id=>id===staff.id?staff:null, uid:()=> 'ideal', save(){},render(){},setLastAction(){},
    empStatus:()=> 'New', activeSession:id=>state.sessions.find(s=>s.emp===id&&!s.end),
    alert(){},document:{getElementById:()=>null}};
  ctx.window=ctx;
  ctx.v75IsClosedWorkshopDay=()=>false;
  ctx.v75IsID001DutyTime=()=>true;
  ctx.v63IsOnLeave=()=>false;
  ctx.start=no=>state.sessions.push({emp:'EMP011',job:no,start:Date.now()});
  vm.runInNewContext(setup,ctx);
  return ctx;
}
let c=fixture();
assert.equal(c.v75IdealAvailableEmployees()[0].name,'Surab','pending normal job must not hide Surab');
assert.equal(c.assignJobCore('ID001','EMP011',0).job,'ID001','pending job must not reject assignment');
assert.equal(c.v75IdealAvailableEmployees().length,0,'existing ID001 must prevent duplicates');
assert.equal(c.assignJobCore('ID001','EMP011',0),undefined);
assert.equal(c.state.assign.length,2);
c.me={id:'EMP011',role:'Employee'};
c.state.sessions.push({emp:'EMP011',job:'ID001',start:Date.now()});
c.start('JC001');
assert.ok(c.state.assign.find(a=>a.job==='ID001').completed,'normal START must complete ID001');
assert.ok(c.state.sessions.find(s=>s.job==='ID001').end,'normal START must stop ID001 session');
for (const [name,block] of [
  ['running work',c=>c.state.sessions.push({emp:'EMP011',job:'JC001'})],
  ['leave',c=>c.v63IsOnLeave=()=>true],
  ['holiday',c=>c.v75IsClosedWorkshopDay=()=>true],
  ['outside duty hours',c=>c.v75IsID001DutyTime=()=>false]
]) {
  c=fixture();block(c);
  assert.equal(c.v75IdealAvailableEmployees().length,0,name+' must block dropdown eligibility');
  assert.equal(c.assignJobCore('ID001','EMP011',0),undefined,name+' must block direct assignment');
  assert.equal(c.state.assign.length,1,name+' must not create ID001');
}
console.log('ID001 eligibility regression checks passed');
