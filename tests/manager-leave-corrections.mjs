import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
process.env.TZ='Asia/Muscat';
const source=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const rules=fs.readFileSync('app/src/main/assets/v2/features/leave/rules.js','utf8');
const start=source.indexOf("(function(){'use strict';",source.indexOf('V75.5 LEAVE CONTROL'));
const end=source.indexOf(' window.v755OpenLeaveHub',start);
const del=source.indexOf(' let leaveDeleteRefreshing=',end),delEnd=source.indexOf(' const v114BaseLeaveListHtml=',del);
assert.ok(start>0&&end>start&&del>end&&delEnd>del);
const now=Date.parse('2026-10-04T12:00:00+04:00'),staff=[{id:'M',name:'Manager',role:'Manager'},{id:'S',name:'Supervisor',role:'Supervisor'},{id:'E',name:'Employee',role:'Employee'}];
let serial=0,html='',alerts=[],confirmations=[],saved=0,reason='Marked by mistake',accept=true;
const fields={v755LeaveDate:{value:'2026-10-03'},v755LeavePeriod:{value:'FULL'},v755LeaveRemark:{value:'Forgotten entry'},v755LeaveFrom:{value:''}};
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
const c={Date:Clock,console,state:{sessions:[],leaves:[],leaveAudit:[]},users:staff,me:staff[0],user:id=>staff.find(u=>u.id===id),uid:()=>String(++serial),document:{getElementById:id=>fields[id]},navigator:{onLine:true},alert:x=>alerts.push(x),confirm:x=>(confirmations.push(x),accept),prompt:()=>reason,save:()=>saved++,closeModal(){},render(){},setTimeout(){},openModal:x=>html=x};
c.window=c;c.v75IsClosedWorkshopDay=ts=>new Date(ts).getDay()===5;vm.createContext(c);vm.runInContext(rules,c);
vm.runInContext(source.slice(start,end)+source.slice(del,delEnd)+'})();',c);
c.v755OpenLeaveForm('E');assert.doesNotMatch(html,/min=/);assert.match(html,/Forgotten leave/);
c.v755SaveLeave('E');assert.equal(c.state.leaves.length,1);assert.equal(c.state.leaves[0].backdated,true);
assert.equal(c.state.leaveAudit[0].reason,'Forgotten entry');assert.equal(c.state.leaveAudit[0].leaveDate,'2026-10-03');
assert.equal(c.state.leaves[0].by,'M');const id=c.state.leaves[0].id;
assert.equal(c.zukaitV2.leave.days(c.state.leaves[0]),1);
c.v755SaveLeave('E');assert.equal(c.state.leaves.length,1);assert.match(alerts.at(-1),/already recorded/);
for(const person of [staff[1],staff[2]]){
 c.me=person;c.v755OpenLeaveForm(person.id==='E'?'E':'E');assert.match(html,/min="2026-10-04"/);
 const count=c.state.leaveAudit.length;c.v755SaveLeave('E');assert.match(alerts.at(-1),/Only a Manager/);
 await c.v114DeleteLeave(id);assert.equal(c.state.leaveAudit.length,count);assert.equal(c.state.leaves[0].cancelled,false);
}
c.me=staff[0];c.state.leaves=[];c.state.leaveAudit=[];fields.v755LeaveRemark.value='';
c.v755SaveLeave('E');assert.match(alerts.at(-1),/reason/);assert.equal(c.state.leaves.length,0);
fields.v755LeaveRemark.value='Forgotten entry';fields.v755LeaveDate.value='2026-10-02';
c.v755SaveLeave('E');assert.match(alerts.at(-1),/Friday/);assert.equal(c.state.leaves.length,0);
fields.v755LeaveDate.value='2026-10-03';
const work={id:'work',emp:'E',job:'JC',start:Date.parse('2026-10-03T08:00:00+04:00'),end:Date.parse('2026-10-03T10:00:00+04:00')};
c.state.sessions=[work];const workBefore=JSON.stringify(c.state.sessions);c.v755SaveLeave('E');
assert.equal(c.state.leaves[0].startAt,work.end);assert.equal(JSON.stringify(c.state.sessions),workBefore);
let record=c.state.leaves[0],recordId=record.id;const before=JSON.stringify(record);
for(const value of [null,'  ']){reason=value;await c.v114DeleteLeave(recordId);assert.equal(JSON.stringify(record),before)}
reason='Marked by mistake';accept=false;await c.v114DeleteLeave(recordId);assert.equal(JSON.stringify(record),before);accept=true;
c.zukaitCloud={dirty:false,pull:async()=>true};
await c.v114DeleteLeave(recordId);
assert.equal(record.cancelled,true);assert.equal(record.cancelledBy,'M');assert.equal(record.cancelReason,reason);
assert.equal(c.state.leaveAudit.at(-1).action,'DELETE');assert.equal(c.state.leaveAudit.at(-1).before.cancelled,false);
assert.equal(c.zukaitV2.leave.active().length,0);assert.equal(c.zukaitV2.leave.isOnLeave(c.state.leaves,'E',work.end),false);
assert.equal(JSON.stringify(c.state.sessions),workBefore);
assert.match(confirmations.at(-1),/Employee.*Date: 2026-10-03/s);
const audits=c.state.leaveAudit.length;await c.v114DeleteLeave(recordId);assert.equal(c.state.leaveAudit.length,audits);
// Marking leave again is possible after the erroneous entry is cancelled.
await c.v755SaveLeave('E');assert.equal(c.zukaitV2.leave.active().length,1);
record=c.zukaitV2.leave.active()[0];recordId=record.id;
c.zukaitCloud.dirty=true;await c.v114DeleteLeave(recordId);assert.equal(record.cancelled,false);assert.match(alerts.at(-1),/syncing/);
c.zukaitCloud.dirty=false;c.zukaitCloud.pull=async()=>{throw Error('network')};
await c.v114DeleteLeave(recordId);assert.equal(record.cancelled,false);
// Account changes during a preflight never authorize a correction.
c.zukaitCloud.pull=async()=>{c.me=staff[1];return true};await c.v114DeleteLeave(recordId);assert.equal(record.cancelled,false);c.me=staff[0];
// Re-read the selected record after refreshing; do not cancel a stale object.
const stale=record;c.zukaitCloud.pull=async()=>{c.state.leaves=c.state.leaves.map(l=>l.id===recordId?{...l,remark:'Fresh server correction'}:l);return true};
await c.v114DeleteLeave(recordId);assert.equal(stale.cancelled,false);assert.equal(c.state.leaves.find(l=>l.id===recordId).cancelled,true);
assert.equal(c.state.leaveAudit.at(-1).before.remark,'Fresh server correction');
// Offline correction remains queued locally rather than losing the action.
c.navigator.onLine=false;record={id:'offline',emp:'E',date:'2026-10-01',period:'FULL',cancelled:false};c.state.leaves.push(record);
await c.v114DeleteLeave('offline');assert.equal(record.cancelled,true);
// Both click entrypoints share one pending operation.
c.navigator.onLine=true;record={id:'double',emp:'E',date:'2026-10-01',period:'FULL',cancelled:false};c.state.leaves.push(record);
let release,pulls=0;c.zukaitCloud.pull=()=>{pulls++;return new Promise(resolve=>release=resolve)};
const pending=c.v114DeleteLeave('double');await c.v114DeleteLeave('double');release(true);await pending;
assert.equal(pulls,1);assert.equal(c.state.leaveAudit.filter(a=>a.leaveId==='double').length,1);
console.log('Manager leave corrections passed: past dates/reasons, role restrictions, Friday/duplicates, recorded work preserved, direct audited cancellation, refreshed rows, offline queue, account change and double-click safety.');

