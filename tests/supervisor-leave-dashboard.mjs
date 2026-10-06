import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Deliberately run outside Oman: the dashboard must use the workshop date.
process.env.TZ='America/Los_Angeles';
let now=Date.parse('2026-09-30T20:00:00Z'),modal='',writes=0;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
const timers=[],intervals=[],events={};
const row={_html:'',get innerHTML(){return this._html},set innerHTML(s){writes++;this._html=s}};
const root={querySelector:sel=>sel==='#v78SupervisorLeaveRow'?row:null};
const people=[{id:'E1',name:'One',role:'Employee'},{id:'E2',name:'Two',role:'Employee'},{id:'E3',name:'Three',role:'Employee'}];
const leaves=[
 {id:'full',emp:'E1',date:'2026-10-01',period:'FULL'},
 {id:'am',emp:'E2',date:'2026-10-01',period:'AM'},
 {id:'pm',emp:'E2',date:'2026-10-01',period:'PM'},
 {id:'cancel',emp:'E3',date:'2026-10-01',period:'FULL',cancelled:true},
 {id:'last',emp:'E3',date:'2026-09-30',period:'FULL'},
 {id:'future',emp:'E3',date:'2026-10-31',period:'PM'},
 // Reporting retains recorded leave independently of Friday/holiday rules.
 {id:'friday',emp:'E3',date:'2026-10-02',period:'FULL'},
 {id:'next',emp:'E3',date:'2026-11-01',period:'FULL'}
];
const c={Date:Clock,Intl,Set,console,state:{leaves,leave:[],workshop_v2_leave:[],holidays:['2026-10-01']},
 me:{id:'S',role:'Supervisor'},users:people,user:id=>people.find(u=>u.id===id),
 document:{visibilityState:'visible',getElementById:id=>id==='supervisorView'?root:null,createElement:()=>({}),head:{appendChild(){}},addEventListener:(e,fn)=>events[e]=fn},
 addEventListener:(e,fn)=>events[e]=fn,setTimeout:fn=>timers.push(fn),setInterval:fn=>intervals.push(fn),
 render(){},showSupervisorModal:(title,body)=>modal=body,openModal:body=>modal=body};
c.window=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('app/src/main/assets/v2/features/leave/rules.js','utf8'),c);
c.v755LeaveLabel=c.zukaitV2.leave.label;
const src=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const start=src.indexOf('/* V78 SUPERVISOR LEAVE STATUS'),end=src.indexOf('window.v78SupervisorLeavePrintReady=true;',start);
vm.runInContext(src.slice(start,end)+'})();',c);
const data=()=>c.zukaitV2.leave.dashboard(c.state);
const ids=rows=>Array.from(rows,x=>x.id);
const before=JSON.stringify(c.state);
assert.equal(data().day,'2026-10-01');
assert.deepEqual(ids(data().today),['full','am','pm']);
assert.equal(data().todayCount,2);assert.equal(data().monthCount,5);
now--;assert.equal(data().day,'2026-09-30');assert.equal(data().todayCount,1);now++;
c.v78RefreshSupervisorLeave();
assert.match(row.innerHTML,/data-leave-count="2"/);
assert.match(row.innerHTML,/THIS MONTH LEAVE<\/span><b>5<\/b>/);
const firstWrites=writes;c.v78RefreshSupervisorLeave();assert.equal(writes,firstWrites,'unchanged refresh must not mutate DOM');
c.v755OpenLeaveList('today');
assert.match(modal,/<b>2<\/b> people/);assert.match(modal,/<b>3<\/b> records/);
assert.match(modal,/Full Day/);assert.match(modal,/Morning Half Day/);assert.match(modal,/Afternoon Half Day/);
assert.doesNotMatch(modal,/>Three</);
c.v755OpenLeaveList('month');assert.match(modal,/<b>5<\/b> records/);
assert.equal((modal.match(/<tr><td>/g)||[]).length,data().month.length,'all and only counted records appear in the list');
assert.equal(JSON.stringify(c.state),before,'reporting must not mutate or fabricate leave/calendar data');

// A cloud replacement, edit, and cancellation all update the same mounted row.
c.state={...c.state,leaves:leaves.map(l=>l.id==='full'?{...l,cancelled:true}:l)};
c.v42AfterCloudPull();timers.splice(0).forEach(fn=>fn());
assert.match(row.innerHTML,/data-leave-count="1"/);
c.state.leaves=c.state.leaves.map(l=>l.id==='pm'?{...l,date:'2026-11-01'}:l);
c.v755OpenLeaveList('today');assert.match(modal,/<b>1<\/b> records/);
assert.match(row.innerHTML,/THIS MONTH LEAVE<\/span><b>3<\/b>/);
now=Date.parse('2026-10-31T20:00:00Z');intervals.forEach(fn=>fn());
assert.match(row.innerHTML,/data-leave-count="2"/,'Muscat month rollover refreshes without a state write');
events.focus();events.visibilitychange();
c.state={leaves:[]};c.v78RefreshSupervisorLeave();c.v755OpenLeaveList('month');
assert.match(modal,/No leave records/);assert.match(row.innerHTML,/THIS MONTH LEAVE<\/span><b>0<\/b>/);
c.me.role='Manager';const unchanged=row.innerHTML;c.v755OpenLeaveList('month');
assert.match(modal,/PRINT LEAVE REPORT/);assert.equal(row.innerHTML,unchanged,'Manager list must not mutate Supervisor DOM');
c.me.role='Employee';c.v78RefreshSupervisorLeave();assert.equal(row.innerHTML,unchanged);

// Execute the real stable render function: it bypasses the legacy chain, so
// it must mount and populate the leave row itself on every initial/re-render.
const stable=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8');
const rs=stable.indexOf('function renderStable(){'),re=stable.indexOf('window.v143OpenSpareParts=',rs);
let rendered='',refreshCalls=0;
const view={contains:()=>false,classList:{remove(){}},dataset:{},set innerHTML(s){rendered=s}};
const sc={role:()=> 'Supervisor',document:{getElementById:id=>id==='supervisorView'?view:null,activeElement:null},
 hideLegacy(){},S:()=>({}),staff:()=>[],jobs:()=>[],esc:String,me:{name:'Supervisor'},v251KpiHTML:()=>'',countAttention:()=>0,
 techOptions:()=>'',countOver:()=>0,techBoard:()=>'',voiceStopVisible(){},voiceListening:false,pendingVoiceEntry:null,
 window:{v78RefreshSupervisorLeave(){refreshCalls++;assert.match(rendered,/id="v78SupervisorLeaveRow"/)}},console};
vm.runInNewContext(stable.slice(rs,re)+'renderStable();renderStable();',sc);
assert.equal(refreshCalls,2,'stable initial and repeat renders must populate leave cards');
assert.equal((rendered.match(/id="v78SupervisorLeaveRow"/g)||[]).length,1);

// The real cloud structural gate patches leave on pull, save acknowledgement
// and conflict reconciliation without rebuilding Manager/Supervisor shells.
const cloud=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const cs=cloud.indexOf('  function roleStructuralSnapshot'),ce=cloud.indexOf('  function status(',cs);
let patches=0;
vm.runInNewContext(cloud.slice(cs,ce)+"scheduleDashboardRender({leaves:[]},{leaves:[{id:'remote'}]});",{
 me:{role:'Supervisor'},window:{v78RefreshSupervisorLeave(){patches++}},setTimeout(){throw Error('must preserve shell')},console
});
assert.equal(patches,1);
console.log('Supervisor leave dashboard: source parity, full/half/cancelled, Muscat boundaries, card/list parity, stable render, cloud refresh, read-only reporting passed.');
