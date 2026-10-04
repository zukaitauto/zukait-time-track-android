import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const src=fs.readFileSync('app/src/main/assets/time_management_rules.js','utf8');
assert.equal(src,fs.readFileSync('supabase/functions/workshop-api/time_management_rules.js','utf8'));
const {timeManagementTransition:transition,allocationToken,employeeTimeToken,workedMinutes}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const at=Date.parse('2026-10-01T06:00:00Z'),manager={id:'MGR1',role:'Manager',name:'Manager'},clone=x=>JSON.parse(JSON.stringify(x));
const fixture=()=>({users:[manager,{id:'EMP1',role:'Employee',name:'Babu'},{id:'EMP2',role:'Employee',name:'Akhil'}],jobs:[{no:'JC1',vehicle:'Toyota',reg:'12345',status:'Open'}],assign:[{id:'A1',job:'JC1',emp:'EMP1',suggested:240,assignedAt:at-86400000,completed:false}],sessions:[{id:'S1',assignmentId:'A1',emp:'EMP1',job:'JC1',start:at-3600000,end:at,paused:true}],requests:[{id:'R1'}],consumables:{issues:[{id:'C1'}]}});
const command=(d,operation,extra={})=>({requestId:'tm-'+randomUUID(),operation,assignmentId:'A1',sessionId:'S1',reason:'Incorrect entry',expectedSource:allocationToken(d.assign[0]),expectedSessions:employeeTimeToken(d,'EMP1'),...extra});
let d=fixture(),req=command(d,'CORRECT_SESSION',{start:at-1800000,end:at}),r=transition(d,manager,req,at);
assert.equal(r.ok,true);assert.equal(r.data.sessions[0].start,at-1800000);assert.equal(d.sessions[0].start,at-3600000);assert.deepEqual(r.audit.before,d.sessions[0]);assert.equal(r.audit.after.start,at-1800000);assert.deepEqual(r.data.requests,d.requests);assert.deepEqual(r.data.consumables,d.consumables);
assert.equal(transition(r.data,manager,req,at+1).duplicate,true);assert.equal(transition(r.data,manager,{...req,reason:'Changed'},at).code,'time_request_reused');
for(const operation of ['CORRECT_SESSION','ADD_SESSION','CANCEL_SESSION','CANCEL_ASSIGNMENT','SET_ALLOCATION','REOPEN','REASSIGN']){
 for(const role of ['Supervisor','Employee','Purchaser'])assert.equal(transition(d,{id:'X',role},command(d,operation),at).code,'time_permission_denied');
 assert.equal(transition(d,manager,command(d,operation,{reason:'  '}),at).code,'time_reason_required');
}
r=transition(d,manager,command(d,'CANCEL_SESSION'),at);assert.equal(r.ok,true);assert.equal(r.data.sessions.length,1);assert.equal(r.data.sessions[0].cancelled,true);assert.equal(r.data.sessions[0].end,r.data.sessions[0].start);assert.equal(workedMinutes(r.data,r.data.assign[0],at),0);assert.equal(r.audit.before.end,at);
r=transition(d,manager,command(d,'ADD_SESSION',{start:at-7200000,end:at-3600000}),at);assert.equal(r.ok,true);assert.equal(r.data.sessions.length,2);assert.equal(r.data.sessions[1].assignmentId,'A1');assert.equal(r.data.sessions[1].manual,true);
assert.equal(transition(d,manager,command(d,'ADD_SESSION',{start:at-1800000,end:at}),at).code,'time_session_overlap');
for(const extra of [{start:at,end:at},{start:0,end:at},{start:at,end:at+60000},{start:NaN,end:at}])assert.equal(transition(d,manager,command(d,'CORRECT_SESSION',extra),at).code,'invalid_session_time');
const running=fixture();delete running.sessions[0].end;
for(const operation of ['CANCEL_SESSION','CORRECT_SESSION'])assert.equal(transition(running,manager,command(running,operation),at).code,'time_session_inactive');
for(const operation of ['CANCEL_ASSIGNMENT','SET_ALLOCATION','REASSIGN','REOPEN'])assert.equal(transition(running,manager,command(running,operation),at).code,'time_work_running');
r=transition(d,manager,command(d,'CANCEL_ASSIGNMENT'),at);assert.equal(r.ok,true);assert.equal(r.data.assign.length,1);assert.equal(r.data.assign[0].cancelled,true);assert.deepEqual(r.data.sessions,d.sessions,'cancelling allotted work preserves actual work');assert.equal(r.data.cancelledAssignments[0].reason,'Incorrect entry');
for(const type of ['repeat','ID001']){const f=fixture();f.sessions=[];if(type==='repeat')f.assign[0].rework=true;else{f.assign[0].job='ID001';f.jobs[0].no='ID001'}assert.equal(transition(f,manager,command(f,'CANCEL_ASSIGNMENT'),at).data.assign[0].cancelled,true);}
r=transition(d,manager,command(d,'SET_ALLOCATION',{minutes:30}),at);assert.equal(r.ok,true);assert.equal(r.data.assign[0].suggested,30);assert.deepEqual(r.data.sessions,d.sessions);
assert.equal(transition(d,manager,command(d,'SET_ALLOCATION',{minutes:-1}),at).code,'invalid_time_change');
const completed=fixture();completed.assign[0].completed=true;completed.assign[0].completedAt=at;
r=transition(completed,manager,command(completed,'REOPEN'),at);assert.equal(r.ok,true);assert.equal(r.data.assign[0].completed,false);assert.deepEqual(r.data.sessions,completed.sessions);assert.equal(completed.jobs[0].status,'Open');assert.equal(completed.assign[0].completed,true);
assert.equal(transition(d,manager,command(d,'REASSIGN',{targetEmployeeId:'EMP2'}),at).code,'time_reassign_work_logged');
const unused=fixture();unused.sessions=[];
r=transition(unused,manager,command(unused,'REASSIGN',{targetEmployeeId:'EMP2'}),at);assert.equal(r.ok,true);assert.equal(r.data.assign[0].cancelled,true);assert.equal(r.data.assign[1].emp,'EMP2');assert.equal(r.data.assign[1].suggested,240);
const stale=fixture();req=command(stale,'CANCEL_ASSIGNMENT');stale.sessions.push({id:'S2',assignmentId:'A1',job:'JC1',emp:'EMP1',start:at});assert.equal(transition(stale,manager,req,at).code,'time_sessions_changed');
req=command(d,'CORRECT_SESSION',{start:at-1800000,end:at});const changed=fixture();changed.assign[0].suggested++;assert.equal(transition(changed,manager,req,at).code,'time_allocation_changed');
// Exercise the actual server route and stale full-state preservation.
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8'),block=api.slice(api.indexOf('    if (action === "time_management") {'),api.indexOf('    if (action === "qc_delivery") {'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,endpoint=new AsyncFunction('admin','timeManagementTransition','computeLiveStatus','reply','user','body','action',block);
let committed,casCalls=0,remote=fixture();const db={from(){return{select(){return this},eq(){return this},async single(){return{data:{revision:1,data:remote}}}}},async rpc(name,args){committed=args;casCalls++;return{data:{ok:true,revision:2}}}};
let response=await endpoint(db,(...args)=>transition(...args.slice(0,3),at),()=>[],(body,status=200)=>({body,status}),manager,command(remote,'CANCEL_ASSIGNMENT'),'time_management');assert.equal(response.body.ok,true);assert.equal(committed.p_changed_by,'MGR1');assert.equal(committed.p_data.assign[0].cancelled,true);
response=await endpoint(db,transition,()=>[],(body,status=200)=>({body,status}),{id:'SUP1',role:'Supervisor'},command(remote,'CANCEL_ASSIGNMENT'),'time_management');assert.equal(response.status,403);assert.equal(casCalls,1);
const keep=api.slice(api.indexOf('function preserveManagerTimeAuthority('),api.indexOf('// A delayed legacy client'));
const protect=new Function('cloneValue',keep.replace(/: any\b/g,'').replace(/:any\b/g,'').replace(/ as const/g,'')+';return preserveManagerTimeAuthority;')(clone);
const corrected=transition(d,manager,command(d,'CANCEL_SESSION'),at).data,protectedData=protect(clone(d),corrected);assert.deepEqual(protectedData.sessions,corrected.sessions);assert.deepEqual(protectedData.additionalActions,corrected.additionalActions);assert.deepEqual(protectedData.corrections,corrected.corrections);
const cancelled=transition(d,manager,command(d,'CANCEL_ASSIGNMENT'),at).data;assert.equal(protect(clone(d),cancelled).assign[0].cancelled,true);
// Real rendered handlers: dashboard -> Manager hub -> assignment -> review -> save.
const ui=fs.readFileSync('app/src/main/assets/time_management.js','utf8'),dashboard=fs.readFileSync('app/src/main/assets/v67_updates.js','utf8');
function harness(role='Manager'){
 const elements=new Map();class Element{value='';hidden=false;disabled=false;textContent='';focus(){}get innerHTML(){return this.html||''}set innerHTML(v){this.html=v;const options=[...v.matchAll(/<option value="([^"]*)"/g)].map(m=>({value:m[1]}));if(options.length){this.options=options;this.value=options[0].value}for(const m of v.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){const el=new Element();el.hidden=/\bhidden\b/.test(m[0]);el.value=m[0].match(/\bvalue="([^"]*)"/)?.[1]||'';elements.set(m[1],el)}}}
 const ctx={state:fixture(),users:fixture().users,me:{...manager,role},allocationToken,workedMinutes,employeeTimeToken,crypto:{randomUUID},navigator:{onLine:true},Date,console,document:{getElementById:id=>elements.get(id)||null,createElement:()=>new Element(),head:{appendChild(){}}},alert(msg){ctx.lastAlert=msg},openModal(html){elements.clear();ctx.html=html;new Element().innerHTML=html},closeModal(){elements.clear()}};ctx.window=ctx;
 ctx.zukaitCloud={syncHealth:{ready:true},async syncNow(){},async timeManagement(command){ctx.calls=(ctx.calls||0)+1;const r=transition(ctx.state,ctx.me,command,Date.now());if(!r.ok)throw Object.assign(Error(r.code),{code:r.code});ctx.state=r.data;return r}};
 vm.createContext(ctx);vm.runInContext(ui.replace(/^import[^\n]+\n/,''),ctx);return{ctx,get:id=>elements.get(id),click:async handler=>await vm.runInContext(handler,ctx)};
}
const launcher=dashboard.match(/data-manager-time-management="1" onclick="([^"]+)"/);assert.ok(launcher);assert.equal(dashboard.match(/data-manager-time-management="1"/g).length,1);
let h=harness();await h.click(launcher[1]);assert.match(h.ctx.html,/Time Management/);assert.match(h.get('mtRows').innerHTML,/Babu/);
h.get('mtSearch').value='12345';h.ctx.zukaitManagerTimeSearch();assert.match(h.get('mtRows').innerHTML,/JC1/);
h.ctx.zukaitManagerTimeSelect('A1');assert.match(h.ctx.html,/Edit \/ Correct Time/);assert.match(h.ctx.html,/Cancel Allotted Work/);h.ctx.zukaitManagerTimeAction('CORRECT_SESSION','S1');
const inputTime=t=>new Date(t-new Date(t).getTimezoneOffset()*60000).toISOString().slice(0,16);h.get('mtStart').value=inputTime(at-1800000);h.get('mtEnd').value=inputTime(at);
h.ctx.zukaitManagerTimeReview();assert.match(h.get('mtNotice').textContent,/reason/);h.get('mtReason').value='Wrong start';h.ctx.zukaitManagerTimeReview();assert.equal(h.ctx.calls,undefined);assert.equal(h.get('mtInputs').disabled,true);
await Promise.all([h.ctx.zukaitManagerTimeConfirm(),h.ctx.zukaitManagerTimeConfirm()]);assert.equal(h.ctx.calls,1);assert.match(h.ctx.html,/Work History/);h.ctx.zukaitManagerTimeHistory(true);assert.match(h.ctx.html,/Wrong start/);assert.match(h.ctx.html,/Original \/ changed values/);
for(const role of ['Supervisor','Employee','Purchaser']){h=harness(role);await h.click(launcher[1]);assert.equal(h.ctx.html,undefined);h.ctx.zukaitManagerTimeSelect('A1');assert.equal(h.ctx.html,undefined);}
h=harness();h.ctx.navigator.onLine=false;await h.click(launcher[1]);assert.match(h.ctx.lastAlert,/Connection/);assert.equal(h.ctx.html,undefined);
h=harness();await h.click(launcher[1]);h.ctx.zukaitManagerTimeSelect('A1');h.ctx.zukaitManagerTimeAction('CANCEL_ASSIGNMENT');h.get('mtReason').value='Wrong allocation';h.ctx.zukaitManagerTimeReview();const save=h.ctx.zukaitCloud.timeManagement;let requestId;h.ctx.zukaitCloud.timeManagement=async req=>{requestId=req.requestId;await save(req);throw Error('TIMEOUT')};await h.ctx.zukaitManagerTimeConfirm();assert.match(h.get('mtNotice').textContent,/timed out/);h.ctx.zukaitCloud.timeManagement=async req=>{assert.equal(req.requestId,requestId);return save(req)};await h.ctx.zukaitManagerTimeConfirm();assert.equal(h.ctx.state.additionalActions.length,1);assert.equal(h.ctx.state.assign[0].cancelled,true);
h=harness();await h.click(launcher[1]);h.ctx.zukaitManagerTimeSelect('A1');h.ctx.zukaitManagerTimeAction('CANCEL_ASSIGNMENT');h.get('mtReason').value='Wrong allocation';h.ctx.zukaitManagerTimeReview();h.ctx.zukaitCloud.timeManagement=async()=>{h.ctx.closeModal();return{ok:true}};await h.ctx.zukaitManagerTimeConfirm();assert.equal(h.get('mtReview'),undefined);
console.log('Manager Time Management: permissions, correction, missing time, cancellation, reopen/reassign, audit, stale writes, retries and real click handlers passed.');
