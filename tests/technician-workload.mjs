import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/src/main/assets/technician_workload.js','utf8');
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.ok(html.indexOf('technician_workload.js')>html.indexOf('live_status_authority.js'));
assert.match(fs.readFileSync('.github/workflows/pages.yml','utf8'),/for source in parser.sources:/,'PC deployment must copy all script assets');
const elements=new Map(),intervals=new Map();let serial=0,title='';
const element=()=>({innerHTML:'',isConnected:true,dataset:{},classList:{add(){}},focus(){},contains(){return true;}});
const modal=element();elements.set('modal',modal);
const state={jobs:[],assign:[],sessions:[]};
const users=['Denter','Painter','Mechanic'].map((department,i)=>({id:String(i+1),name:i?'Employee '+i:'AKHIL <test>',role:'Employee',department}));
let live={status:'Working',session:{emp:'1',job:'LC-1003',assignmentId:'a'}};
const context={state,users,me:{role:'Supervisor'},document:{hidden:false,head:{appendChild(){}},createElement:element,getElementById:id=>elements.get(id)},
  setInterval(fn){intervals.set(++serial,fn);return serial;},clearInterval(id){intervals.delete(id);},
  fmt:n=>String(n)+'m',totalForAssignment:a=>a.worked||0,empStatus:a=>a.testStatus||'New',
  v84TechState:()=>live,
  showSupervisorModal(t,body){title=t;for(const [id,e] of elements)if(id!=='modal'){e.isConnected=false;elements.delete(id);}
    for(const match of body.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
    const id=body.includes('twDepartment')?'twDepartment':'twWorkload';elements.get(id).innerHTML=body;
  }};
context.window=context;vm.createContext(context);vm.runInContext(source,context);
const tick=()=>[...intervals.values()].forEach(fn=>fn());
const body=()=>elements.get('twWorkload').innerHTML;
for(const emp of users){
  state.jobs=[{no:'LC-1003',vehicle:'Toyota Avalon',year:2005,reg:'123 <AB>'},{no:'JC2',vehicle:'Nissan'},{no:'JC3'},{no:'JC4'},{no:'JC5',delivered:true},{no:'JC6',archived:true},{no:'ID001'}];
  state.assign=[{id:'a',emp:emp.id,job:'LC-1003',suggested:180,worked:80},{id:'b',emp:emp.id,job:'JC2',suggested:60,worked:75,testStatus:'Paused'},
    {id:'c',emp:emp.id,job:'JC3',suggested:90},{id:'d',emp:emp.id,job:'JC4',completed:true},
    {id:'e',emp:emp.id,job:'JC4',cancelled:true},{id:'f',emp:emp.id,job:'JC5'},{id:'g',emp:emp.id,job:'JC6'},
    {id:'h',emp:emp.id,job:'ID001'},{id:'i',emp:'someone-else',job:'JC4'},
    {id:'history',emp:emp.id,job:'LC-1003',completed:true,worked:999}];
  live={status:'Working',session:{emp:emp.id,job:'LC-1003',assignmentId:'a'}};
  const before=JSON.stringify(state);
  context.openTechnicianDepartment(emp.department);
  assert.match(elements.get('twDepartment').innerHTML,/Total 3 JC/);
  assert.match(elements.get('twDepartment').innerHTML,/LC-1003 · Toyota Avalon 2005/);
  const row={dataset:{twEmp:emp.id}};
  elements.get('twDepartment').onclick({target:{closest:()=>row}});
  assert.match(body(),/Present Jobs: 3/);
  assert.match(body(),/123 &lt;AB&gt;/);
  assert.match(body(),/Working/);assert.match(body(),/Paused/);assert.match(body(),/Not Started/);
  assert.match(body(),/100m/);assert.match(body(),/0m/);assert.doesNotMatch(body(),/999m|JC4|JC5|JC6|ID001/);
  assert.equal(intervals.size,1);
  assert.equal(JSON.stringify(state),before,'view must not mutate assignments, sessions or jobs');
  // A finish received while the page stays open removes only this employee's completed work.
  state.assign[0].completed=true;live={status:'Available',session:null};tick();
  assert.match(body(),/Present Jobs: 2/);assert.doesNotMatch(body(),/LC-1003/);
  elements.get('twBack').onclick();assert.match(elements.get('twDepartment').innerHTML,/Total 2 JC/);
  context.openTechnicianWorkload(emp.id);
  state.assign.forEach(a=>{if(a.emp===emp.id)a.completed=true;});tick();
  assert.match(body(),/No unfinished job cards assigned/);
  // Remote reassignment appears without reopening; duplicate open rows count as one JC.
  state.assign.push({id:'new',emp:emp.id,job:'JC3'},{id:'duplicate',emp:emp.id,job:'JC3'});tick();
  assert.match(body(),/Present Jobs: 1/);
  live={status:'Syncing',session:null};tick();assert.match(body(),/Syncing/);
  const current=elements.get('twWorkload');current.isConnected=false;tick();assert.equal(intervals.size,0,'closing view stops its timer');
}
context.me.role='Employee';title='unchanged';context.openTechnicianWorkload('1');assert.equal(title,'unchanged');
assert.doesNotMatch(source,/save\(|commitEvent\(|syncNow\(|MutationObserver/);
console.log('Technician workload: all departments, row navigation, unique unfinished JCs, times, escaping, realtime finish/reassignment, read-only state and timer cleanup passed');
