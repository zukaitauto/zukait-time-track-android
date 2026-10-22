import fs from 'node:fs';import assert from 'node:assert/strict';
import {mechanicalTransition as transition} from '../supabase/functions/workshop-api/extensions/mechanical_rules.js';
import {allocationToken,employeeTimeToken,workedMinutes,managerTimeTransition} from '../supabase/functions/workshop-api/time_management_rules.js';
const id=n=>'72000000-0000-4000-8000-'+String(n).padStart(12,'0');
const start=Date.parse('2026-10-19T04:00:00Z'),at=start+7200000;
let records={revision:0,checklists:[],tasks:[],links:[],receipts:[],audit:[]};
let snapshot={revision:7,data:{users:[{id:'QA_A',role:'Employee',department:'QA_MECHANICAL'},{id:'QA_B',role:'Employee',department:'QA_MECHANICAL'},{id:'QA_D',role:'Employee',department:'QA_MECHANICAL'},{id:'QA_C',role:'Employee',department:'OTHER'},{id:'QA_DISABLED',role:'Employee',department:'QA_MECHANICAL',active:false}],jobs:[{no:'QA_JC',status:'Open'}],assign:[],sessions:[],expenses:[{id:'do-not-touch',amount:12.345}],leaves:[{emp:'OTHER'}]}};
const policy={flags:{mechanical:true},mechanicalDepartment:'QA_MECHANICAL',manualJcDuplicateMode:'deny',mechanicalStaff:{QA_SUP:['MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER']}};
let context={actor:{id:'QA_SUP',role:'Supervisor',active:true},sessionCurrent:true,online:true,timeSnapshotConfirmed:true};
let sequence=100;
const command=(operation,entityId,payload)=>({operation,entityId,payload,actorId:context.actor.id,requestId:id(sequence++),deviceId:'QA_DEVICE',expectedRevision:records.revision,expectedWorkshopRevision:snapshot.revision});
function run(c,r=records,s=snapshot,ctx=context,p=policy){return transition(r,s,c,ctx,p,at);}
function apply(result){assert.equal(result.ok,true,JSON.stringify(result));records=result.records;snapshot={revision:snapshot.revision+1,data:result.workshopData};}
const mc=command('MC_CREATE',id(1),{manualJobCard:{number:'QA_JC',date:'2026-10-19'}});
context={...context,allocationVerified:true,allocatedChecklist:{requestId:mc.requestId,id:mc.entityId,sequence:1,number:'MC001'}};
assert.equal(run(mc,records,snapshot,{...context,allocationVerified:false}).code,'verified_mc_allocation_required');
assert.equal(run(mc,records,snapshot,context,{...policy,manualJcDuplicateMode:undefined}).code,'manual_jc_policy_required');
assert.equal(run({...mc,payload:{manualJobCard:{number:'QA_JC',date:'2026-02-30'}}}).code,'invalid_manual_jc');
const same=JSON.stringify({records,snapshot});const first=run(mc);assert.equal(JSON.stringify({records,snapshot}),same,'pure planning must preserve source snapshots');apply(first);
assert.equal(records.checklists[0].number,'MC001');assert.equal(records.checklists[0].id,id(1));assert.equal(records.checklists[0].manualJobCard.number,'QA_JC');
const retry=run(mc);assert.equal(retry.duplicate,true);assert.equal(retry.records,undefined,'retry must not create another posting plan');
assert.equal(run({...mc,payload:{manualJobCard:{number:'OTHER',date:'2026-10-19'}}}).code,'request_reused');
const duplicate=command('MC_CREATE',id(2),{manualJobCard:{number:'QA_JC',date:'2026-10-19'}});assert.equal(run(duplicate).code,'manual_jc_duplicate');
const task1=command('TASK_CREATE',id(10),{checklistId:id(1),title:'Brake inspection'});apply(run(task1));
const task2=command('TASK_CREATE',id(11),{checklistId:id(1),title:'Engine inspection'});apply(run(task2));
const allocate=(task,emp,assignment)=>command('TASK_ASSIGN',task,{employeeId:emp,assignmentId:assignment,suggestedMinutes:60});
assert.equal(run(allocate(id(10),'QA_C',id(20))).code,'invalid_assignment');assert.equal(run(allocate(id(10),'QA_DISABLED',id(20))).code,'invalid_assignment');
apply(run(allocate(id(10),'QA_A',id(20))));apply(run(allocate(id(10),'QA_B',id(21))));
assert.equal(run(allocate(id(10),'QA_A',id(22))).code,'duplicate_task_employee');
assert.equal(snapshot.data.sessions.length,0,'assignment cannot start any timer');
// Independent task IDs retain separate allocation links for the same employee.
apply(run(allocate(id(11),'QA_A',id(22))));
assert.equal(records.links.filter(l=>l.taskId===id(10)).length,2);assert.equal(records.links.filter(l=>l.taskId===id(11)).length,1);
// Seed server-confirmed periods; this module does not implement Start/Pause/Stop.
snapshot.data.sessions=[{id:'QA_S_A',emp:'QA_A',job:'QA_JC',assignmentId:id(20),start,end:start+3600000,paused:true},{id:'QA_S_B',emp:'QA_B',job:'QA_JC',assignmentId:id(21),start,end:start+3600000,paused:true}];
const a=snapshot.data.assign.find(a=>a.id===id(20)),b=snapshot.data.assign.find(a=>a.id===id(21));
assert.equal(workedMinutes(snapshot.data,a,at),60);assert.equal(workedMinutes(snapshot.data,b,at),60);assert.equal(workedMinutes(snapshot.data,a,at)+workedMinutes(snapshot.data,b,at),120);
assert.equal(Math.max(...snapshot.data.sessions.map(s=>s.end))-Math.min(...snapshot.data.sessions.map(s=>s.start)),3600000,'120 labour minutes occur in 60 elapsed minutes');
// Ordinary reassignment protection remains installed; it rejects logged hours.
const oldReassign=managerTimeTransition(snapshot.data,{id:'QA_MANAGER',role:'Manager'},{operation:'REASSIGN',requestId:'tm-synthetic-reassign-0001',assignmentId:a.id,targetEmployeeId:'QA_B',reason:'Synthetic',expectedSource:allocationToken(a),expectedSessions:employeeTimeToken(snapshot.data,a.emp)},at);
assert.equal(oldReassign.code,'time_reassign_work_logged');
const handover=()=>command('TASK_HANDOVER',id(10),{sourceAssignmentId:id(20),targetEmployeeId:'QA_D',successorAssignmentId:id(23),suggestedMinutes:30,reason:'Audited shift handover',expectedSource:allocationToken(snapshot.data.assign.find(a=>a.id===id(20))),expectedEmployeeSessions:employeeTimeToken(snapshot.data,'QA_A')});
const h=handover();assert.equal(run(h,records,snapshot,{...context,timeSnapshotConfirmed:false}).code,'confirmed_time_snapshot_required');
const running=structuredClone(snapshot);running.data.sessions.push({id:'QA_OTHER_RUNNING',emp:'QA_A',job:'ID001',start});
const hr={...h,payload:{...h.payload,expectedEmployeeSessions:employeeTimeToken(running.data,'QA_A')}};assert.equal(run(hr,records,running).code,'stop_outgoing_work_first');
const targetRunning=structuredClone(snapshot);targetRunning.data.sessions.push({id:'QA_TARGET_RUNNING',emp:'QA_D',job:'ID001',start});assert.equal(run(h,records,targetRunning).code,'target_employee_working');
const beforeSessions=JSON.stringify(snapshot.data.sessions),beforeData=JSON.stringify(snapshot.data);
const stale={...h,payload:{...h.payload,expectedSource:'stale'}};assert.equal(run(stale).code,'handover_source_changed');
apply(run(h));assert.equal(JSON.stringify(snapshot.data.sessions),beforeSessions);assert.equal(records.audit.at(-1).before.emp,'QA_A');assert.equal(records.audit.at(-1).reason,'Audited shift handover');
const old=snapshot.data.assign.find(a=>a.id===id(20)),successor=snapshot.data.assign.find(a=>a.id===id(23));assert.equal(old.emp,'QA_A');assert.equal(old.completed,true);assert.equal(old.handedOverToAssignmentId,successor.id);assert.equal(successor.handoverFromAssignmentId,old.id);assert.equal(successor.emp,'QA_D');
assert.equal(workedMinutes(snapshot.data,old,at),60,'handed-over source retains its original 60 minutes');assert.deepEqual(snapshot.data.expenses,[{id:'do-not-touch',amount:12.345}]);assert.deepEqual(snapshot.data.leaves,[{emp:'OTHER'}]);assert.equal(snapshot.data.sessions.some(s=>s.assignmentId===successor.id),false);
assert.equal(run(h).duplicate,true,'lost-ack handover cannot duplicate successor');
// Reject simultaneous stale metadata plans rather than silently overwriting.
const c1=command('TASK_CREATE',id(30),{checklistId:id(1),title:'First'}),c2=command('TASK_CREATE',id(31),{checklistId:id(1),title:'Second'});const r1=run(c1);apply(r1);assert.equal(run(c2).code,'mechanical_revision_conflict');
const last=command('TASK_CREATE',id(32),{checklistId:id(1),title:'Third'});assert.equal(run({...last,expectedWorkshopRevision:snapshot.revision-1}).code,'workshop_revision_conflict');
assert.equal(run(last,records,snapshot,context,{...policy,flags:{mechanical:false}}).code,'extension_disabled');
assert.equal(run({...last,actorId:'SOMEONE_ELSE'}).code,'actor_mismatch');
console.log('PASS inactive Mechanical checklist/task transitions, explicit allocation dependency, retry identity, separate MC/manual JC, parallel mechanics, immutable hours, confirmed-pause handover, active-work denial, successor retry and two-revision conflict guards. Synthetic only; no allocator/transaction/UI rollout.');
