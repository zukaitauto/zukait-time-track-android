import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const src=fs.readFileSync('app/src/main/assets/time_management_rules.js','utf8');
assert.equal(src,fs.readFileSync('supabase/functions/workshop-api/time_management_rules.js','utf8'));
const {timeManagementTransition:change,allocationToken,employeeTimeToken,workedMinutes}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const at=Date.parse('2026-11-05T10:00:00+04:00'),start=Date.parse('2026-11-04T15:00:00+04:00'),end=start+50*60000,manager={id:'M',role:'Manager'};
const fixture=()=>({users:[manager,{id:'E',role:'Employee'}],jobs:[{no:'12108',status:'Open'}],assign:[{id:'A',emp:'E',job:'12108',completed:false,suggested:120}],sessions:[{id:'live',assignmentId:'A',emp:'E',job:'12108',start:at-60000,end:null,paused:false,finished:false}],lastActions:{E:{text:'Started 12108',at:at-60000}}});
const command=d=>({requestId:'tm-'+randomUUID(),operation:'ADD_SESSION',assignmentId:'A',sessionId:'',start,end,workStatus:'PAUSED',reason:'Owner verified missing time on 4 November',expectedSource:allocationToken(d.assign[0]),expectedSessions:employeeTimeToken(d,'E')});
const d=fixture(),req=command(d),r=change(d,manager,req,at);
assert.equal(r.ok,true);assert.deepEqual(r.data.sessions[0],d.sessions[0]);assert.deepEqual(r.data.assign,d.assign);assert.deepEqual(r.data.jobs,d.jobs);assert.deepEqual(r.data.lastActions,d.lastActions);
assert.equal(r.data.sessions[1].paused,true);assert.equal(r.data.sessions[1].finished,false);assert.equal(workedMinutes(r.data,d.assign[0],at)-workedMinutes(d,d.assign[0],at),50);
assert.equal(r.audit.type,'Add Missing Time');assert.equal(r.audit.before,null);assert.deepEqual(r.audit.assignmentBefore,r.audit.assignmentAfter);assert.equal(r.data.corrections.length,1);
assert.equal(change(r.data,manager,req,at+1).duplicate,true);assert.equal(d.sessions.length,1);
for(const role of ['Supervisor','Employee','Accountant','Purchaser','Receptionist'])assert.equal(change(d,{id:'X',role},req,at).code,'time_permission_denied');
for(const extra of [{start:at-30000,end:at},{start,end:start},{start,end:at+1},{start:NaN,end},{start:start-8*86400000,end}])assert.equal(change(d,manager,{...req,...extra},at).ok,false);
for(const workStatus of ['FINISHED','CONTINUE'])assert.equal(change(d,manager,{...req,workStatus,...(workStatus==='CONTINUE'?{end:null}:{})},at).code,'time_work_running');
for(const operation of ['CORRECT_SESSION','CANCEL_SESSION','SET_ALLOCATION','REASSIGN','REOPEN','CANCEL_ASSIGNMENT'])assert.equal(change(d,manager,{...req,operation,sessionId:'live',workStatus:undefined},at).ok,false);
for(const other of [{id:'overlap',emp:'E',job:'OTHER',start:start+1,end:end+1},{id:'idle',emp:'E',job:'ID001',start:start-1,end:end+1}]){const f=structuredClone(d);f.sessions.push(other);assert.equal(change(f,manager,command(f),at).code,'time_session_overlap');}
const boundary=fixture();boundary.sessions[0].start=end;assert.equal(change(boundary,manager,command(boundary),at).ok,true);
const finished=fixture();finished.assign[0].completed=true;finished.assign[0].completedAt=at-1;finished.sessions[0].end=at-1;finished.sessions[0].finished=true;
const historic=change(finished,manager,command(finished),at);assert.equal(historic.ok,true);assert.deepEqual(historic.data.assign,finished.assign);assert.deepEqual(historic.data.sessions[0],finished.sessions[0]);
for(const flag of ['delivered','archived','deleted','cancelled']){const f=fixture();f.jobs[0][flag]=true;assert.equal(change(f,manager,command(f),at).ok,false);}
const stale=fixture();stale.sessions[0].start--;assert.equal(change(stale,manager,req,at).code,'time_sessions_changed');
// Execute the real server route: a concurrent overlap must prevent the CAS retry committing.
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const block=api.slice(api.indexOf('    if (action === "time_management") {'),api.indexOf('    if (action === "qc_delivery") {'));
const endpoint=new (Object.getPrototypeOf(async function(){}).constructor)('admin','timeManagementTransition','computeLiveStatus','reply','user','body','action',api.split('// FINAL_SESSION_STATUS_BEGIN')[1].split('// FINAL_SESSION_STATUS_END')[0]+block);
let remote=structuredClone(d),commits=0,saved;
const db={from(){return{select(){return this},eq(){return this},async single(){return{data:{revision:commits+1,data:structuredClone(remote)}}}}},async rpc(_name,args){commits++;saved=args;return{data:{ok:true,revision:2}}}};
let response=await endpoint(db,(c,a,q)=>change(c,a,q,at),()=>[],(body,status=200)=>({body,status}),manager,req,'time_management');assert.equal(response.body.ok,true);assert.deepEqual(saved.p_data.sessions[0],d.sessions[0]);
db.rpc=async()=>{commits++;remote.sessions.push({id:'race',emp:'E',job:'OTHER',start,end});return{data:{ok:false,code:'conflict'}}};commits=0;
response=await endpoint(db,(c,a,q)=>change(c,a,q,at),()=>[],(body,status=200)=>({body,status}),manager,req,'time_management');assert.equal(response.body.code,'time_sessions_changed');assert.equal(commits,1);
console.log('Historical missing-time: manager scope, live/later state, completed assignment, overlap/ID001, boundaries, invalid times, audit, costing, retries and concurrent save passed.');
