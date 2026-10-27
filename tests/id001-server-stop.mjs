import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const updates=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const controls=updates.slice(updates.indexOf('/* V300 SERVER-AUTHORITATIVE EMPLOYEE TIME CONTROLS'),updates.indexOf('/* EMPLOYEE OCEAN TIMER'));
const authority=fs.readFileSync('app/src/main/assets/live_status_authority.js','utf8');
function harness(){
 const storage=new Map(),els=new Map();let finishCount=0,saves=0,syncs=0,resolve,reject;
 const closed={id:'IDLE',emp:'EMP008',job:'ID001',assignmentId:'WAIT',start:100,end:200,finished:true};
 const c={me:{id:'EMP008',role:'Employee'},state:{sessions:[closed],assign:[{id:'WAIT',emp:'EMP008',job:'ID001',completed:true}]},navigator:{onLine:true},Date,console,crypto:{randomUUID:()=> 'action-id'},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:()=>0,addEventListener(){},render(){},renderEmployee(){},activeSession:()=>null,finish(){finishCount++},save(){saves++},v74Msg(m){c.message=m},alert(m){c.message=m},openModal(html){c.modal=html},closeModal(){c.modal=null}};
 c.document={hidden:false,addEventListener(){},getElementById:id=>els.get(id)||null,querySelectorAll:()=>[],createElement(){return {dataset:{},style:{},remove(){els.delete(this.id)}}},body:{appendChild(e){els.set(e.id,e)}}};
 c.zukaitCloud={dirty:true,revision:4,syncNow(){syncs++},employeeTimeAction(command){c.commands.push(command);return new Promise((a,b)=>{resolve=a;reject=b})}};c.commands=[];
 c.zukaitServerLive={fresh:true,fetchedAt:Date.now(),revision:4,rows:[{employee_id:'EMP008',status:'ID001',job_no:'ID001',session_id:'IDLE',assignment_id:'WAIT',session_start:100}]};
 c.window=c;vm.createContext(c);vm.runInContext(controls,c);vm.runInContext(authority,c);
 return {c,closed,counts:()=>({finishCount,saves,syncs}),resolve:()=>resolve({ok:true,audit:{confirmed:true,id:c.commands[0].action_id,emp:c.me.id,type:c.commands[0].event_type}}),reject:()=>reject(Error('NETWORK'))};
}
let h=harness();assert.equal(h.c.zukaitEmployeeDisplaySession('EMP008').id,'IDLE','unconfirmed legacy stop cannot hide server-running ID001');
const before=JSON.stringify(h.c.state);h.c.finish();assert.match(h.c.modal,/zukaitConfirmID001Stop/);assert.deepEqual(h.counts(),{finishCount:0,saves:0,syncs:0});
const request=h.c.zukaitConfirmID001Stop();assert.equal(h.c.commands.length,1);assert.equal(h.c.commands[0].event_type,'STOP_ID001');assert.equal(h.c.commands[0].session_id,'IDLE');assert.equal(h.c.commands[0].assignment_id,'WAIT');assert.equal(JSON.stringify(h.c.state),before,'no optimistic local stop');assert.ok(h.c.zukaitEmployeeDisplaySession('EMP008'));
await h.c.zukaitConfirmID001Stop();assert.equal(h.c.commands.length,1,'double tap must not send another stop');
h.c.zukaitServerLive={...h.c.zukaitServerLive,revision:5,rows:[{employee_id:'EMP008',status:'Available'}]};h.c.zukaitCloud.revision=5;h.resolve();await request;assert.equal(h.c.zukaitEmployeeDisplaySession('EMP008'),null,'confirmed server stop clears running display');
h=harness();h.c.finish();const failed=h.c.zukaitConfirmID001Stop();h.reject();await failed;assert.match(h.c.message,/NOT confirmed/);assert.equal(h.c.zukaitEmployeeDisplaySession('EMP008').id,'IDLE','failed stop retains usable running controls');
h=harness();h.c.finish();h.c.me={id:'EMP009',role:'Employee'};await h.c.zukaitConfirmID001Stop();assert.equal(h.c.commands.length,0,'stop confirmation is scoped to the employee who opened it');
h=harness();h.c.finish();h.c.zukaitServerLive.rows[0].session_id='DIFFERENT-IDLE';await h.c.zukaitConfirmID001Stop();assert.equal(h.c.commands.length,0,'stale confirmation cannot stop a newer idle session');assert.match(h.c.message,/changed on another device/);
h=harness();h.c.zukaitServerLive.revision=3;assert.equal(h.c.zukaitEmployeeDisplaySession('EMP008'),null,'older poll cannot undo a later acknowledged stop');
console.log('PASS: ID001 Stop uses server confirmation, recovers hidden live sessions, preserves pending data, rejects account switches, blocks double taps, and retains controls on network failure.');
