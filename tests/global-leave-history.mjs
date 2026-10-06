import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
process.env.TZ='America/Los_Angeles';
let now=Date.parse('2026-09-30T20:00:00Z'),html='',printed='',shared='',writes=0;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
const nodes={},events={};
const element=()=>({_html:'',get innerHTML(){return this._html},set innerHTML(v){this._html=v;writes++},textContent:''});
const c={Date:Clock,Intl,console,navigator:{onLine:true},document:{visibilityState:'visible',getElementById:id=>nodes[id]||null,querySelectorAll:()=>[],addEventListener:(e,fn)=>events[e]=fn},setInterval(){},setTimeout(){},alert(){},openModal(s){html=s;for(const id of ['zukaitLeaveHistory','leaveHistoryMonth','leaveHistoryEmployee','leaveHistoryResults','leaveHistorySync'])nodes[id]=element()},window:{addEventListener(){},open:url=>shared=url}};
vm.createContext(c);
// Match production: state and me are lexical globals, not window properties.
vm.runInContext(`let state={leaves:[
 {id:'a',emp:'E1',date:'2026-09-01',period:'FULL',by:'S'},
 {id:'b',emp:'E1',date:'2026-10-01',period:'AM',by:'S'},
 {id:'c',emp:'E2',date:'2026-10-01',period:'PM',by:'S'},
 {id:'d',emp:'OLD',date:'2025-12-01',period:'FULL',by:'S',cancelled:true}
 ],leave:[]};let me={id:'S',role:'Supervisor'};let users=[{id:'E1',name:'One <Employee>'},{id:'E2',name:'Two'}];`,c);
vm.runInContext(fs.readFileSync('app/src/main/assets/v2/features/leave/rules.js','utf8'),c);
const r=c.window.zukaitV2.leave;
assert.equal(c.window.state,undefined);assert.equal(r.active().length,3,'reader must use lexical state');
assert.equal(r.dashboard(vm.runInContext('state',c)).todayCount,2);
const before=vm.runInContext('JSON.stringify(state)',c);r.rows();r.history();assert.equal(vm.runInContext('JSON.stringify(state)',c),before,'selectors are read-only');
c.window.v78RefreshSupervisorLeave=()=>{};
c.window.v110ReportActions=body=>printed=body;
vm.runInContext(fs.readFileSync('app/src/main/assets/leave_history.js','utf8'),c);
const h=c.window.zukaitLeaveHistory;
for(const role of ['Supervisor','Manager']){
 vm.runInContext(`me.role='${role}'`,c);h.open('history');
 assert.equal(h.rows().length,3);assert.match(nodes.leaveHistoryMonth.innerHTML,/2025-12/,'all historical months, including cancelled history, are available');
 assert.match(nodes.leaveHistoryEmployee.innerHTML,/OLD/,'history survives removal from staff directory');
 h.filter('month','2026-09');assert.equal(h.rows().length,1);assert.match(nodes.leaveHistoryResults.innerHTML,/<b>1<\/b> records/);
 h.filter('month','2026-10');h.filter('employee','E1');assert.equal(h.rows().length,1);assert.match(nodes.leaveHistoryResults.innerHTML,/One &lt;Employee&gt;/);
 h.print();assert.match(printed,/2026-10-01/);assert.doesNotMatch(printed,/2026-09-01/);
 h.share();assert.match(decodeURIComponent(shared),/2026-10-01/);assert.doesNotMatch(decodeURIComponent(shared),/2026-09-01/);
 h.open('today');assert.equal(h.rows().length,2);assert.equal(h.rows().length,r.dashboard(vm.runInContext('state',c)).today.length);
 assert.equal(nodes.leaveHistoryResults.innerHTML.includes('data-leave-edit'),role==='Manager');
 h.open('history');h.filter('status','cancelled');assert.equal(h.rows().length,1);assert.match(nodes.leaveHistoryResults.innerHTML,/<b>0<\/b> leave days/);
 h.filter('status','all');assert.equal(h.rows().length,4);
}
// An already-open screen observes replacement state without closing or losing filters.
h.open('month');h.filter('employee','E1');
vm.runInContext("state={...state,leaves:[...state.leaves,{id:'new',emp:'E1',date:'2026-10-03',period:'FULL'}]}",c);
c.window.v42AfterCloudPull();assert.equal(h.rows().length,2);assert.match(nodes.leaveHistoryResults.innerHTML,/<b>2<\/b> records/);
const stableWrites=writes;h.refresh();assert.equal(writes,stableWrites,'no unchanged DOM rewrites');
vm.runInContext("state.leaves=state.leaves.map(l=>l.id==='new'?{...l,cancelled:true}:l)",c);h.refresh();assert.equal(h.rows().length,1);
let message='';c.window.v74Msg=m=>message=m;c.window.zukaitCloud={dirty:true,ready:true,async syncNow(){}};
await h.confirmSaved();assert.match(message,/Waiting to synchronize/);
c.window.zukaitCloud.dirty=false;await h.confirmSaved();assert.match(message,/Leave synchronized/);
vm.runInContext("me.role='Employee'",c);const previousHtml=html;h.open();assert.equal(html,previousHtml,'employees cannot open global staff history');
vm.runInContext("state={leaves:[]}",c);assert.equal(r.active().length,0,'empty current state cannot reuse stale leave');
const entry=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.ok(entry.indexOf('src="leave_history.js')>entry.indexOf('src="v74_updates.js'),'final history handler loads after legacy overrides');
console.log('Global leave history: lexical authority, both roles, all months/staff/status, print/share parity, remote refresh, privacy, save status passed.');
