import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {JSDOM} from 'jsdom';
const ruleSource=fs.readFileSync('app/src/main/assets/time_management_rules.js','utf8');assert.equal(ruleSource,fs.readFileSync('supabase/functions/workshop-api/time_management_rules.js','utf8'));
const rules=await import('data:text/javascript;base64,'+Buffer.from(ruleSource).toString('base64'));
const fixture=()=>({users:[{id:'E1',name:'Afsal',role:'Employee'}],jobs:[{no:'JC1',vehicle:'Toyota',reg:'4493.D',status:'Open'}],assign:[{id:'A1',emp:'E1',job:'JC1',suggested:180,assignedAt:100},{id:'A2',emp:'E2',job:'JC1',suggested:120,assignedAt:100}],sessions:[]});
const req=d=>({operation:'CANCEL_UNSTARTED',requestId:'tm-'+randomUUID(),assignmentId:'A1',reason:'Wrong allocation',expectedSource:rules.allocationToken(d.assign[0]),expectedSessions:rules.employeeTimeToken(d,'E1')});
for(const role of ['Supervisor','Manager']){let d=fixture(),q=req(d),r=rules.timeManagementTransition(d,{id:role,role},q);assert.equal(r.ok,true);assert.equal(r.data.assign[0].cancelled,true);assert.deepEqual(r.data.assign[1],d.assign[1]);assert.deepEqual(r.data.jobs,d.jobs);assert.deepEqual(r.data.sessions,d.sessions);assert.equal(r.audit.by,role);assert.equal(rules.timeManagementTransition(r.data,{id:role,role},q).duplicate,true);assert.equal(d.assign[0].cancelled,undefined);
 for(const session of [{id:'S',emp:'E1',job:'JC1',assignmentId:'A1',start:1000},{id:'S',emp:'E1',job:'JC1',assignmentId:'A1',start:1000,end:1000,paused:true},{id:'S',emp:'E1',job:'JC1',start:1000,end:2000},{id:'S',emp:'E1',job:'JC1',assignmentId:'A1',start:1000,end:1000,cancelled:true}]){d=fixture();q=req(d);d.sessions.push(session);assert.equal(rules.timeManagementTransition(d,{id:role,role},q).code,'time_work_already_started');}
 d=fixture();q=req(d);d.assign[0].suggested++;assert.equal(rules.timeManagementTransition(d,{id:role,role},q).code,'time_allocation_changed');
}
for(const role of ['Employee','Purchaser','Receptionist'])assert.equal(rules.timeManagementTransition(fixture(),{id:'X',role},req(fixture())).code,'time_permission_denied');
for(const flag of ['delivered','archived','deleted','cancelled']){const d=fixture();d.jobs[0][flag]=true;assert.equal(rules.timeManagementTransition(d,{id:'S1',role:'Supervisor'},req(d)).code,'time_job_inactive');}
for(const role of ['Supervisor','Manager']){
 const dom=new JSDOM('<div id="modal"></div>',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window;Object.assign(w,rules);w.me={id:'AUTH',role};w.state=fixture();w.users=w.state.users;w.crypto.randomUUID=randomUUID;w.alert=()=>{};
 w.openModal=html=>{w.document.getElementById('modal').innerHTML=html};w.closeModal=()=>{};
 let calls=0;w.zukaitCloud={syncHealth:{ready:true},syncNow:async()=>{},timeManagement:async request=>{calls++;const result=rules.timeManagementTransition(w.state,w.me,request);if(!result.ok)throw Object.assign(Error(result.code),{code:result.code});w.state=result.data;return result}};
 w.eval(fs.readFileSync('app/src/main/assets/time_management.js','utf8').replace(/^import[^\n]+\n/,''));
 await w.zukaitOpenTimeManagement('JC1');const get=id=>w.document.getElementById(id);assert.ok(get('tmMode').querySelector('option[value="CANCEL_UNSTARTED"]'));
 get('tmMode').value='CANCEL_UNSTARTED';w.zukaitTimeChanged();assert.equal(w.document.querySelector('.tm-duration').hidden,true);get('tmReason').value='Wrong employee';await w.zukaitTimeReview();assert.equal(calls,0);assert.match(get('tmReview').textContent,/Cancel Allotted Work/);
 // A different phone starts after review, before the confirmation reaches the server.
 w.state.sessions.push({id:'NEW',assignmentId:'A1',emp:'E1',job:'JC1',start:Date.now()});await w.zukaitTimeConfirm();assert.equal(w.state.assign[0].cancelled,undefined);assert.match(get('tmNotice').textContent,/already started/);
 w.state.sessions=[];await w.zukaitTimeReview();await w.zukaitTimeConfirm();assert.equal(w.state.assign[0].cancelled,true);assert.equal(w.state.assign[1].cancelled,undefined);assert.equal(w.state.additionalActions.length,1);
 dom.window.close();
}
console.log('Cancel unstarted allotted work: both roles, confirmation, started/paused/zero-time sessions, stale phone race, retries, audit and other-assignment preservation passed');
