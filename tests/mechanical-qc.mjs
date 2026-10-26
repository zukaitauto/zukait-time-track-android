import assert from 'node:assert/strict';
import {mechanicalQcEvaluation as evaluate,mechanicalQcProposal as propose,MECHANICAL_QC_OWNER_DECISIONS as qc} from '../supabase/functions/workshop-api/extensions/mechanical_qc_rules.js';
import {qcTransition} from '../supabase/functions/workshop-api/qc_delivery_rules.js';
import {mechanicalCommandApi} from '../supabase/functions/workshop-api/extensions/mechanical_api.js';
const id=n=>'77000000-0000-4000-8000-'+String(n).padStart(12,'0'),at=Date.parse('2026-10-23T08:00:00Z');
const policy={flags:{mechanical:true},mechanicalDepartment:'Mechanic',qc,mechanicalStaff:{SUP003:['MECHANICAL_QC'],SUP001:['MECHANICAL_QC'],SUP002:['MECHANICAL_QC'],MGR001:['MECHANICAL_QC']}};
const context={actor:{id:'SUP003',role:'Supervisor',active:true},sessionCurrent:true};
const data={users:[{id:'MECH',department:'Mechanic'},{id:'PAINT',department:'Painter'}],jobs:[{no:'QA_JC',status:'Completed'}],assign:[{id:id(3),job:'QA_JC',emp:'MECH',completed:true,completedAt:at,mechanicalTaskId:id(2),mechanicalChecklistId:id(1)}],sessions:[{id:id(4),assignmentId:id(3),job:'QA_JC',emp:'MECH',start:at-3600000,end:at}]};
const records={revision:3,checklists:[{id:id(1),manualJobCard:{number:'QA_JC',date:'2026-10-22'}}],tasks:[{id:id(2),checklistId:id(1),title:'Inspect brakes'}],links:[{taskId:id(2),assignmentId:id(3),employeeId:'MECH'}],receipts:[],audit:[]};
const snapshot={revision:10,data};let serial=100;
function command(r=records,s=snapshot){return {operation:'MECHANICAL_QC',requestId:id(serial++),entityId:id(1),actorId:'SUP003',deviceId:'QA_DEVICE',expectedRevision:r.revision,expectedWorkshopRevision:s.revision,payload:{result:'PASS',reason:'Checked',expectedFingerprint:evaluate(s.data,r,'QA_JC',policy).fingerprint}}}
const ready=evaluate(data,records,'QA_JC',policy);assert.equal(ready.route,'MECHANICAL_ONLY');assert.equal(ready.workComplete,true);assert.equal(ready.deliveryReady,false);
const c=command(),before=JSON.stringify({records,snapshot});const passed=await propose(records,snapshot,c,context,policy,at);assert.equal(passed.ok,true);assert.equal(passed.status.deliveryReady,true,'SUP003 alone satisfies Mechanical-only QC');assert.equal(JSON.stringify({records,snapshot}),before);assert.equal(passed.event.by,'SUP003');
const envelope=structuredClone(c);delete envelope.actorId;let routedCalls=0;assert.equal((await mechanicalCommandApi(envelope,{enabled:true,policy,actor:context.actor,verifySession:async()=>context.actor,readReceipt:async()=>{routedCalls++},readContext:async()=>{routedCalls++},commit:async()=>{routedCalls++}})).body.code,'mechanical_operation_not_implemented');assert.equal(routedCalls,0,'The four-operation adapter must leave QC to its separately gated boundary');
const retry=await propose(passed.records,snapshot,c,context,policy,at+1000);assert.equal(retry.duplicate,true);assert.equal(retry.requiresReadinessRefresh,true);assert.equal(retry.status,undefined,'Historical receipt cannot claim current delivery readiness');
assert.equal((await propose(passed.records,snapshot,{...c,payload:{...c.payload,reason:'Changed'}},context,policy,at)).code,'mechanical_request_reused');
for(const [id,role] of [['SUP001','Supervisor'],['SUP002','Supervisor'],['MGR001','Manager']])assert.equal((await propose(records,snapshot,{...command(),actorId:id},{...context,actor:{id,role,active:true}},policy,at)).code,'mechanical_qc_approver_required');
assert.equal((await propose(records,snapshot,command(),context,{...policy,flags:{mechanical:false}},at)).code,'extension_disabled');
assert.equal((await propose(records,snapshot,command(),{...context,sessionCurrent:false},policy,at)).code,'session_changed');
assert.equal((await propose(records,snapshot,{...command(),expectedWorkshopRevision:9},context,policy,at)).code,'workshop_revision_conflict');
assert.equal((await propose(records,snapshot,{...command(),expectedRevision:2},context,policy,at)).code,'mechanical_revision_conflict');
const malformed=command();delete malformed.expectedWorkshopRevision;assert.equal((await propose(records,{...snapshot,revision:undefined},malformed,context,policy,at)).code,'invalid_revision');
assert.equal((await propose(records,snapshot,{...command(),policy:{enabled:true}},context,policy,at)).code,'invalid_command');
let changed=structuredClone(snapshot);changed.data.assign[0].completed=false;assert.equal(evaluate(changed.data,records,'QA_JC',policy,passed.event).deliveryReady,false);
changed=structuredClone(snapshot);changed.data.sessions.push({id:'QA_RUNNING',emp:'MECH',job:'QA_JC',assignmentId:id(3),start:at});assert.equal(evaluate(changed.data,records,'QA_JC',policy,passed.event).workComplete,false);
const renamed=structuredClone(records);renamed.tasks[0].title='Changed inspection';assert.equal(evaluate(data,renamed,'QA_JC',policy,passed.event).mechanicalPassed,false);
const missingTask=structuredClone(records);missingTask.tasks.push({id:id(8),checklistId:id(1),title:'Not assigned'});assert.equal(evaluate(data,missingTask,'QA_JC',policy).workComplete,false);
const cancelled=structuredClone(snapshot);cancelled.data.assign[0].cancelled=true;assert.equal(evaluate(cancelled.data,records,'QA_JC',policy).workComplete,false);
const delivered=structuredClone(snapshot);delivered.data.jobs[0].delivered=true;assert.equal((await propose(records,delivered,command(records,delivered),context,policy,at)).code,'already_delivered');assert.equal(evaluate(delivered.data,records,'QA_JC',policy,passed.event).deliveryReady,false);
const unknown=structuredClone(snapshot);unknown.data.users=[];assert.equal(evaluate(unknown.data,records,'QA_JC',policy).code,'mechanical_qc_department_review');
const failure=command();failure.payload.result='FAIL';failure.payload.reason='';assert.equal((await propose(records,snapshot,failure,context,policy,at)).code,'invalid_mechanical_qc');failure.payload.reason='Brake noise';const failed=await propose(records,snapshot,failure,context,policy,at);assert.equal(failed.ok,true);assert.equal(failed.status.deliveryReady,false);
const mixed=structuredClone(snapshot);mixed.data.assign.push({id:id(5),job:'QA_JC',emp:'PAINT',completed:true,completedAt:at});mixed.data.sessions.push({id:id(6),assignmentId:id(5),job:'QA_JC',emp:'PAINT',start:at-1800000,end:at});
for(const required of [null,true,false]){
 const mixedPolicy={...policy,qc:{...qc,mixedMechanicalRequired:required}};
 assert.equal(evaluate(mixed.data,records,'QA_JC',mixedPolicy).code,'mechanical_mixed_job_not_allowed');
 assert.equal((await propose(records,mixed,command(records,mixed),context,mixedPolicy,at)).code,'mechanical_mixed_job_not_allowed');
}
assert.equal(qcTransition(data,{id:'SUP003',role:'Supervisor'},{operation:'PAINTING_QC',jobCard:'QA_JC',expectedQcRevision:0,result:'PASS'},at).code,'qc_permission_denied','Existing painting rights are never globally widened');
console.log('PASS inactive QC proposal: confirmed SUP003 sole Mechanical-only approver, explicit/unset mixed-policy gates, candidate approval modes, work/task/department/revision guards, invalidation, reason/audit, safe retry and unchanged legacy permissions. No persistence or API activation.');
