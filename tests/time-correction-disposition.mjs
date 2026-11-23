import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const source=fs.readFileSync('supabase/functions/workshop-api/time_management_rules.js','utf8');
assert.equal(source,fs.readFileSync('app/src/main/assets/time_management_rules.js','utf8'));
const {timeManagementTransition:change,allocationToken,employeeTimeToken,workedMinutes}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const at=Date.parse('2026-10-20T08:00:00Z'),manager={id:'M1',role:'Manager'};
const fixture=()=>({jobs:[{no:'12040',status:'Open'}],assign:[{id:'A',job:'12040',emp:'E',completed:false,suggested:120}],sessions:[{id:'S',assignmentId:'A',job:'12040',emp:'E',start:at-3600000,end:at,paused:true}],additionalActions:[]});
const command=(d,status='FINISHED',extra={})=>({requestId:'tm-'+randomUUID(),operation:'CORRECT_SESSION',assignmentId:'A',sessionId:'S',start:at-1800000,end:at,reason:'Verified actual end and work status',expectedSource:allocationToken(d.assign[0]),expectedSessions:employeeTimeToken(d,'E'),workStatus:status,...extra});
const d=fixture(),req=command(d),r=change(d,manager,req,at);
assert.equal(r.ok,true);assert.equal(r.data.assign[0].completed,true);assert.equal(r.data.assign[0].completedAt,at);
assert.equal(r.data.sessions[0].finished,true);assert.equal(r.data.sessions[0].paused,false);
assert.equal(r.data.assign.filter(a=>!a.cancelled&&!a.completed).length,0,'finished assignment leaves active work');
assert.equal(workedMinutes(r.data,r.data.assign[0],at),30,'corrected completed work stays in labour costing');
assert.equal(r.data.jobs[0].status,'Open','does not approve QC or deliver vehicle');
assert.equal(r.audit.assignmentBefore.completed,false);assert.equal(r.audit.assignmentAfter.completed,true);
assert.equal(r.audit.before.paused,true);assert.equal(r.audit.after.finished,true);
assert.equal(d.assign[0].completed,false,'input never mutated');
assert.equal(change(r.data,manager,req,at+1).duplicate,true);
assert.equal(change(r.data,manager,{...req,workStatus:'PAUSED'},at).code,'time_request_reused');
const paused=change(d,manager,command(d,'PAUSED'),at);assert.equal(paused.ok,true);assert.equal(paused.data.assign[0].completed,false);assert.equal(paused.data.sessions[0].paused,true);assert.equal(paused.data.sessions[0].finished,false);
assert.equal(change(r.data,manager,command(r.data,'PAUSED'),at).code,'time_reopen_required');
for(const value of ['',null,'COMPLETE',true])assert.equal(change(d,manager,command(d,value),at).code,'invalid_work_status');
for(const role of ['Employee','Supervisor','Accountant','Purchaser'])assert.equal(change(d,{id:'X',role},req,at).code,'time_permission_denied');
const later=fixture();later.sessions.push({id:'L',assignmentId:'A',job:'12040',emp:'E',start:at+1,end:at+60000});assert.equal(change(later,manager,command(later),at+60000).code,'time_later_session');
delete later.sessions[1].end;assert.equal(change(later,manager,command(later),at+60000).code,'time_work_running');
const stale=fixture();stale.sessions[0].end--;assert.equal(change(stale,manager,req,at).code,'time_sessions_changed');
const delivered=fixture();delivered.jobs[0].delivered=true;assert.equal(change(delivered,manager,command(delivered),at).code,'time_job_inactive');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const block=api.slice(api.indexOf('function preserveManagerTimeAuthority('),api.indexOf('// A delayed legacy client'));
const clone=x=>JSON.parse(JSON.stringify(x));
const protect=new Function('cloneValue',block.replace(/: any\b/g,'').replace(/:any\b/g,'').replace(/ as const/g,'')+';return preserveManagerTimeAuthority;')(clone);
const protectedData=protect(clone(d),r.data);assert.equal(protectedData.assign[0].completed,true);assert.equal(protectedData.sessions[0].finished,true,'stale full-state save cannot undo finished correction');
console.log('Time correction disposition: finish/pause, costing retention, permissions, historical safety, audit, idempotency and stale-save protection passed.');

// Missing intervals use the same explicit disposition as corrected intervals.
for(const status of ['PAUSED','FINISHED']){
 const missing=fixture();missing.sessions=[];
 const add=command(missing,status,{operation:'ADD_SESSION',sessionId:''});
 const result=change(missing,manager,add,at);
 assert.equal(result.ok,true);
 assert.equal(result.data.sessions[0].paused,status==='PAUSED');
 assert.equal(result.data.sessions[0].finished,status==='FINISHED');
 assert.equal(result.data.assign[0].completed,status==='FINISHED');
 assert.equal(workedMinutes(result.data,result.data.assign[0],at),30);
 assert.equal(result.audit.command.workStatus,status);
 assert.equal(change(result.data,manager,add,at+1).duplicate,true);
 assert.equal(change(result.data,manager,{...add,workStatus:status==='PAUSED'?'FINISHED':'PAUSED'},at).code,'time_request_reused');
 const guarded=protect(clone(missing),result.data);
 assert.equal(guarded.sessions[0].finished,status==='FINISHED');
 if(status==='FINISHED')assert.equal(guarded.assign[0].completed,true);
}
const missing=fixture();missing.sessions=[];
assert.equal(change(missing,manager,command(missing,'INVALID',{operation:'ADD_SESSION'}),at).code,'invalid_work_status');
assert.equal(change(d,manager,command(d,'FINISHED',{operation:'ADD_SESSION',start:at-7200000,end:at-3600000}),at).code,'time_later_session');
console.log('Missing Time Pause/Finish: saved status, completion, hours, audit, retries and stale-save protection passed.');

// JC 12070 regression: delivered job, Mohammed assignment left incomplete.
for(const closedFlag of ['delivered','archived']){
 const closed=fixture();closed.jobs[0]={no:'12070',status:'Delivered',[closedFlag]:true,[closedFlag+'At']:at};
 closed.assign[0].job='12070';closed.assign[0].emp='EMP005';closed.sessions[0]={id:'S',assignmentId:'A',job:'12070',emp:'EMP005',start:at-3600000,end:at,paused:true};
 const add={...command(closed,'FINISHED',{operation:'ADD_SESSION',sessionId:'',start:at-7200000,end:at-3600000}),expectedSessions:employeeTimeToken(closed,'EMP005')};
 const before=structuredClone(closed),result=change(closed,manager,add,at);
 assert.equal(result.ok,true);assert.deepEqual(closed,before,'no mutation before confirmation');
 assert.deepEqual(result.data.jobs,closed.jobs,'delivery/archive and job details unchanged');
 assert.deepEqual(result.data.sessions[0],closed.sessions[0],'later historical session is retained');
 assert.equal(result.data.sessions[1].finished,true);assert.equal(result.data.sessions[1].paused,false);
 assert.equal(result.data.assign[0].completed,true);assert.equal(result.data.assign[0].completedAt,at,'older interval must not backdate latest work completion');
 assert.equal(result.audit.type,'Add Missing Time');assert.equal(result.audit.before,null);assert.equal(result.audit.assignmentBefore.completed,false);
 assert.equal(change(result.data,manager,add,at+1).duplicate,true);
 assert.equal(change(closed,manager,{...add,workStatus:'PAUSED',end:at},at).code,'time_job_inactive');
 assert.equal(change(closed,manager,{...add,start:at,end:at+60000},at+60000).code,'time_after_job_closed');
 for(const flag of ['deleted','cancelled']){const invalid=structuredClone(closed);invalid.jobs[0][flag]=true;assert.equal(change(invalid,manager,add,at).code,'time_job_inactive');}
 for(const role of ['Supervisor','Employee','Accountant'])assert.equal(change(closed,{id:'X',role},add,at).code,'time_permission_denied');
 const overlap={...add,start:at-1800000,end:at};assert.equal(change(closed,manager,overlap,at).code,'time_session_overlap');
 const running=structuredClone(closed);delete running.sessions[0].end;assert.equal(change(running,manager,{...add,expectedSessions:employeeTimeToken(running,'EMP005')},at).code,'time_work_running');
}
console.log('Delivered/archived missing-time regression: Manager-only historical Finish, closure preserved, no overlap/running work, cutoff, audit and exact retry passed.');
