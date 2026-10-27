import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {JSDOM} from 'jsdom';
const src=fs.readFileSync('supabase/functions/workshop-api/time_management_rules.js','utf8');
assert.equal(src,fs.readFileSync('app/src/main/assets/time_management_rules.js','utf8'));
const rules=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const {timeManagementTransition:change,allocationToken,employeeTimeToken,workedMinutes,assignmentHasStarted}=rules;
const manager={id:'M1',name:'QA Manager',role:'Manager'},employee={id:'E1',name:'QA Employee',role:'Employee'};
const start=Date.parse('2026-10-27T07:00:00Z'),at=Date.parse('2026-10-27T12:00:00Z');
const fixture=()=>({users:[manager,employee],jobs:[{no:'12098',status:'Open',vehicle:'Synthetic vehicle'}],assign:[{id:'A1',emp:'E1',job:'12098',suggested:420,completed:false}],sessions:[]});
const command=(d,extra={})=>({operation:'ADD_SESSION',requestId:'tm-'+randomUUID(),assignmentId:'A1',sessionId:'',start,end:null,workStatus:'CONTINUE',reason:'Verified actual start',expectedSource:allocationToken(d.assign[0]),expectedSessions:employeeTimeToken(d,'E1'),...extra});
const initial=fixture(),req=command(initial),result=change(initial,manager,req,at);
assert.equal(result.ok,true);const session=result.data.sessions[0];
assert.equal(session.start,start);assert.equal(session.end,null);assert.equal(session.paused,false);assert.equal(session.finished,false);assert.equal(session.serverAuthoritative,true);
assert.equal(result.data.assign[0].completed,false);assert.equal(result.data.jobs[0].status,'Open');assert.deepEqual(initial.sessions,[]);
assert.equal(result.audit.before,null);assert.equal(result.audit.after.end,null);assert.equal(result.audit.by,'M1');assert.equal(result.audit.reason,req.reason);assert.equal(result.audit.at,at);
assert.equal(workedMinutes(result.data,result.data.assign[0],at),180,'11–13 and15–16 Oman, excluding lunch');
assert.equal(workedMinutes(result.data,result.data.assign[0],at+60000),181,'running timer grows');
assert.equal(change(result.data,manager,req,at+1).duplicate,true);
assert.equal(change(result.data,manager,{...req,start:start-1},at).code,'time_request_reused');
for(const role of ['Employee','Supervisor','Accountant','Mechanical Supervisor'])assert.equal(change(initial,{id:'X',role},req,at).code,'time_permission_denied');
for(const extra of [{start:at+1},{start:0},{end:at}])assert.equal(change(initial,manager,command(initial,extra),at).code,'invalid_session_time');
assert.equal(change(initial,manager,command(initial,{operation:'CORRECT_SESSION'}),at).code,'invalid_work_status');
for(const flag of ['delivered','archived','cancelled','deleted']){const d=fixture();d.jobs[0][flag]=true;assert.equal(change(d,manager,command(d),at).code,'time_job_inactive');}
const completed=fixture();completed.assign[0].completed=true;assert.equal(change(completed,manager,command(completed),at).code,'time_reopen_required');
for(const other of [
 {job:'12098',assignmentId:'A1',start:start-60000,end:start+60000,paused:true},
 {job:'OTHER',start:start+60000,end:at-1,finished:true},
 {job:'OTHER',start:at,end:null},
 {job:'ID001',start:start-1,end:start+1}
]){const d=fixture();d.sessions.push({id:'OTHER',emp:'E1',...other});assert.equal(change(d,manager,command(d),at).code,'time_session_overlap');}
const idle=fixture();idle.sessions.push({id:'IDLE',emp:'E1',job:'ID001',start:at-60000,end:null});assert.equal(change(idle,manager,command(idle),at).code,'time_id001_conflict');
const historical=fixture();historical.sessions.push({id:'PAST',emp:'E1',job:'OLD',start:start-3600000,end:start,finished:true});
const preserved=change(historical,manager,command(historical),at);assert.equal(preserved.ok,true);assert.deepEqual(preserved.data.sessions[0],historical.sessions[0]);
const stale=fixture(),staleReq=command(stale);stale.sessions.push({id:'RACE',emp:'E1',job:'OTHER',start:at,end:null});assert.equal(change(stale,manager,staleReq,at).code,'time_sessions_changed');

// Execute the real Employee transitions and live-status projection.
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const employeeSource=api.slice(api.indexOf('function employeeTimeTransition('),api.indexOf('// ID001_ASSIGNMENT_RULE_BEGIN'));
const employeeChange=vm.runInNewContext(stripTypeScriptTypes(employeeSource)+';employeeTimeTransition',{cloneValue:structuredClone});
for(const event_type of ['PAUSE','FINISH']){
 const stopped=employeeChange(result.data,employee,{event_type,action_id:randomUUID(),session_id:session.id,assignment_id:'A1',job:'12098'},at+60000);
 assert.equal(stopped.ok,true);assert.equal(stopped.session.end,at+60000);assert.equal(stopped.session.start,start);
 assert.equal(stopped.session.paused,event_type==='PAUSE');assert.equal(stopped.assignment.completed,event_type==='FINISH');
 assert.equal(change(stopped.data,manager,req,at+120000).duplicate,true,'lost Manager receipt cannot reopen stopped work');
}
const liveSource=api.slice(api.indexOf('function computeLiveStatus('),api.indexOf('async function loadAuthoritativeLiveStatus('));
const live=vm.runInNewContext(stripTypeScriptTypes(liveSource)+';computeLiveStatus');
assert.equal(live(result.data,2,'M1')[0].status,'Working');assert.equal(live(result.data,2,'M1')[0].session_start,start);

// Real route: CAS conflict re-reads Employee changes; exact retry does not commit twice.
const block=api.slice(api.indexOf('    if (action === "time_management") {'),api.indexOf('    if (action === "qc_delivery") {'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const route=new AsyncFunction('admin','timeManagementTransition','computeLiveStatus','reply','user','body','action',api.split('// FINAL_SESSION_STATUS_BEGIN')[1].split('// FINAL_SESSION_STATUS_END')[0]+block);
let remote=fixture(),revision=1,commits=0,conflict=false;
const db={from(){return{select(){return this},eq(){return this},async single(){return{data:{revision,data:remote}}}}},async rpc(_name,args){commits++;if(conflict){remote.sessions.push({id:'RACE',emp:'E1',job:'OTHER',start:at,end:null});revision++;return{data:{ok:false,code:'conflict'}}}assert.equal(args.p_expected_revision,revision);assert.equal(args.p_live[0].status,'Working');remote=args.p_data;revision++;return{data:{ok:true,revision}}}};
const invoke=q=>route(db,(d,a,r)=>change(d,a,r,at),live,(body,status=200)=>({body,status}),manager,q,'time_management');
const routeReq=command(remote);assert.equal((await invoke(routeReq)).body.ok,true);assert.equal((await invoke(routeReq)).body.duplicate,true);assert.equal(commits,1);
remote=fixture();revision=1;conflict=true;const race=await invoke(command(remote));assert.equal(race.body.code,'time_sessions_changed');assert.equal(commits,2,'second CAS is not attempted after employee work changes');

// Real DOM form and durable lost-response/reload retry.
const ui=fs.readFileSync('app/src/main/assets/time_management.js','utf8').replace(/^import[^\n]+\n/,'');
let saved=new Map(),server=fixture(),lose=true,sends=[],uiCommits=0;
async function boot(id='M1',{broken=false}={}){
 const dom=new JSDOM('<html><head></head><body><div id="modal"></div></body></html>',{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;
 Object.assign(w,{me:{...manager,id},state:structuredClone(server),users:server.users,allocationToken,employeeTimeToken,workedMinutes,assignmentHasStarted,alert:m=>{w.lastAlert=m},openModal:html=>{w.document.getElementById('modal').innerHTML=html},closeModal(){}});
 Object.defineProperty(w,'localStorage',{value:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>{if(broken)throw Error('quota');saved.set(k,v)},removeItem:k=>saved.delete(k)}});
 w.zukaitCloud={syncHealth:{ready:true},readLatest:async()=>({data:structuredClone(server)}),timeManagement:async q=>{sends.push(structuredClone(q));const r=change(server,w.me,q,Date.now());if(!r.ok)throw Object.assign(Error(r.code),{code:r.code});if(!r.duplicate){uiCommits++;server=r.data}if(lose){lose=false;throw Error('NETWORK')}w.state=structuredClone(server);return r}};
 w.eval(ui);await w.zukaitOpenManagerTimeManagement();return w;
}
let w=await boot();w.zukaitManagerTimeSelect('A1');w.zukaitManagerTimeAction('ADD_SESSION');
const get=id=>w.document.getElementById(id);
assert.ok([...get('mtWorkStatus').options].some(o=>o.value==='CONTINUE'));
get('mtWorkStatus').value='CONTINUE';w.zukaitManagerTimeStatusChanged();assert.equal(get('mtEnd').disabled,true);assert.equal(get('mtEndLabel').hidden,true);
get('mtStart').value='2026-10-27T11:00';get('mtReason').value='Actual work start verified';w.zukaitManagerTimeReview();assert.match(get('mtReview').textContent,/Running — no end time/);
await Promise.all([w.zukaitManagerTimeConfirm(),w.zukaitManagerTimeConfirm()]);assert.equal(sends.length,1);assert.equal(uiCommits,1);assert.ok(saved.has('zukait_manager_time_pending_v1:M1'));
const original=structuredClone(sends[0]);w.zukaitManagerTimeEdit();assert.match(w.document.body.textContent,/Retry same confirmation/,'uncertain payload cannot be edited or replaced');assert.deepEqual(JSON.parse(saved.get('zukait_manager_time_pending_v1:M1')).command,original);w.close();w=await boot();assert.match(w.document.body.textContent,/Retry same confirmation/);await w.zukaitManagerTimeConfirm();assert.deepEqual(sends[1],original);assert.equal(uiCommits,1);assert.equal(saved.size,0);
// A distinct Manager cannot consume another Manager's pending command.
saved.set('zukait_manager_time_pending_v1:M1',JSON.stringify({actor:'M1',command:original}));w.close();w=await boot('M2');assert.doesNotMatch(w.document.body.textContent,/Retry same confirmation/);assert.ok(saved.has('zukait_manager_time_pending_v1:M1'));w.close();saved.clear();server=fixture();
w=await boot('M1',{broken:true});w.zukaitManagerTimeSelect('A1');w.zukaitManagerTimeAction('ADD_SESSION');get('mtWorkStatus').value='CONTINUE';get('mtStart').value='2026-10-27T11:00';get('mtReason').value='Storage failure fixture';w.zukaitManagerTimeReview();const before=sends.length;await w.zukaitManagerTimeConfirm();assert.equal(sends.length,before,'storage failure blocks send');w.close();
const privacy=fs.readFileSync('app/src/main/assets/session_privacy.js','utf8');
const retained=vm.runInNewContext(privacy.slice(privacy.indexOf('  function retained('),privacy.indexOf('  function clearCachedStorage('))+';retained');assert.equal(retained('zukait_manager_time_pending_v1:M1'),true);
console.log('PASS Continue Working: open authoritative session, duty/lunch timer, Pause/Finish, conflicts, permissions, audit, duplicate and concurrent CAS, live projection, real form and durable network recovery.');
