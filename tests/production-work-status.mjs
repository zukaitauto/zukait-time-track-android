import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/src/main/assets/workshop_overview.js','utf8');
const handlers=[];let modal='';
const st={jobs:[{no:'12078',vehicle:'Test Vehicle',reg:'TEST'}],users:[
 {id:'E1',name:'Jomir',department:'Painter'},
 {id:'E2',name:'Yousuf',department:'Painter'},
 {id:'E3',name:'New <employee>',department:'Painter'}],assign:[
 {id:'done',job:'12078',emp:'E1',completed:true,suggested:240},
 {id:'open',job:'12078',emp:'E2',completed:false,suggested:54},
 {id:'new',job:'12078',emp:'E3',completed:false,suggested:60}],
 sessions:[{id:'s1',assignmentId:'done',job:'12078',emp:'E1',start:100,end:200,finished:true},
 {id:'s2',assignmentId:'open',job:'12078',emp:'E2',start:200,end:300,paused:true}],
 additionalActions:[]};
const live={fresh:true,rows:{E2:{emp:'E2',status:'Paused',assignment:{id:'open'}}}};
const sandbox={fixture:st,staff:st.users,window:{openModal:html=>modal=html,
 zukaitLiveStatusAuthority:{fresh:()=>live.fresh},
 currentStaffStatus:emp=>live.rows[emp]||{emp,status:'Available'}},
 document:{addEventListener:(type,fn)=>{if(type==='click')handlers.push(fn)},createElement:()=>({}),
 head:{appendChild(){}},body:{},getElementById:()=>null,querySelector:()=>null},
 navigator:{onLine:true},MutationObserver:class{observe(){}},setTimeout(){},setInterval(){},totalForAssignment:()=>30};
const ctx=vm.createContext(sandbox);
vm.runInContext('let state=fixture;let users=staff;let me={role:"Manager"};',ctx);
vm.runInContext(source,ctx);
const detail=()=>sandbox.window.zukaitWorkshopOverview.detail('12078');
const click=action=>{for(const fn of handlers)fn({target:{closest:selector=>selector.includes('=')&&selector!=='[data-workshop-action="'+action+'"]'?null:({dataset:{workshopAction:action,job:'12078'}})},preventDefault(){},stopPropagation(){}})};
const before=JSON.stringify(st);
detail();
for(const text of ['Jomir','Yousuf','Finished','Paused / To continue','Not started','New &lt;employee&gt;','Unfinished'])assert.ok(modal.includes(text),text);
assert.ok(!modal.includes('<span>In Progress</span></button>'),'department efficiency must not imply a running timer');
click('prod-painting');
assert.ok(modal.includes('Finished')&&modal.includes('Paused / To continue')&&modal.includes('Not started'));
live.rows.E2={emp:'E2',status:'Working',assignment:{id:'open'}};
detail();assert.ok(modal.includes('Working now'));
live.rows.E2.status='Overtime';detail();assert.ok(modal.includes('Working now · Overtime'));
live.fresh=false;detail();assert.ok(modal.includes('Waiting for live status'));assert.ok(!modal.includes('Working now'));
assert.ok(modal.includes('Finished'),'completion remains explicit with stale live status');
live.fresh=true;
live.rows.E2={emp:'E2',status:'Working',assignment:{id:'other-job'}};
detail();assert.ok(!modal.includes('Working now'),'work on another assignment must not mark this one running');
assert.equal(JSON.stringify(st),before,'rendering must not mutate workshop data');
// Same employee, same JC, repeat-work history must not leak into normal assignment.
st.assign.push({id:'repeat',job:'12078',emp:'E2',rework:true,suggested:10});
st.sessions.push({id:'repeat-session',assignmentId:'repeat',job:'12078',emp:'E2',start:999,end:null,rework:true});
live.rows.E2={emp:'E2',status:'Working',assignment:{id:'repeat'}};
click('prod-painting');
assert.ok(!modal.includes('Working now'));
assert.ok(!modal.includes('Running'),'normal detail must exclude running repeat session');
click('prod-repeat');assert.ok(modal.includes('Working now'));
// Closed sessions are not completion evidence.
st.sessions[1].finished=true;st.sessions[1].paused=false;
click('prod-painting');assert.ok(modal.includes('Paused / To continue'));
// Legacy sessions are assigned only when identity is unambiguous.
delete st.sessions[1].assignmentId;detail();assert.ok(modal.includes('Paused / To continue'));
st.assign.push({id:'older',job:'12078',emp:'E2',cancelled:true});
click('prod-painting');assert.ok(modal.includes('Status unavailable'));
console.log('PASS: employee names/statuses in both screens, fresh/stale live status, other-job and repeat isolation, safe legacy matching, escaping and read-only rendering');
