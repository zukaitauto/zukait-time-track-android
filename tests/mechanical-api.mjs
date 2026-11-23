import assert from 'node:assert/strict';
import {mechanicalCommandApi as api} from '../supabase/functions/workshop-api/extensions/mechanical_api.js';
import {workedMinutes} from '../supabase/functions/workshop-api/time_management_rules.js';
const id=n=>'74000000-0000-4000-8000-'+String(n).padStart(12,'0');
const at=Date.parse('2026-10-22T08:00:00Z');
const actor={id:'QA_SUP',role:'Supervisor',active:true};
const policy={flags:{mechanical:true},mechanicalDepartment:'QA_MECH',mechanicalStaff:{QA_SUP:['MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER']},manualJcDuplicateMode:'deny',mcNumbering:{minimumDigits:3}};
let r={revision:0,checklists:[],tasks:[],links:[],receipts:[],audit:[]};
let s={revision:12,data:{jobs:[{no:'QA_JC'}],users:['QA_A','QA_B'].map(id=>({id,role:'Employee',department:'QA_MECH'})),assign:[],sessions:[],expenses:[{id:'preserve',amount:1.234}]}};
let nextSequence=1,serial=100,reads=0,contexts=0,commits=0,verifies=0,loseAck=false,lastPlan;
const receipts=new Map();
const server={enabled:true,actor,policy,now:()=>at,verifySession:async()=>{verifies++;return actor},
 readReceipt:async key=>{reads++;return receipts.get(key)},
 readContext:async()=>{contexts++;return structuredClone({records:r,snapshot:s,nextSequence})},
 commit:async p=>{
  commits++;lastPlan=structuredClone(p);
  assert.equal(p.p_expected_records,r.revision);assert.equal(p.p_expected_workshop,s.revision);
  assert.ok(!JSON.stringify(p).includes('expectedEmployeeSessions'),'Server time tokens stay outside RPC payload');
  if(p.p_operation==='MC_CREATE'){r.checklists.push(p.p_plan.record);nextSequence++;}
  if(p.p_operation==='TASK_CREATE')r.tasks.push(p.p_plan.record);
  if(p.p_plan.assignment){
   const a=p.p_plan.assignment;
   if(p.p_plan.sourceAfter){const index=s.data.assign.findIndex(a=>a.id===p.p_plan.sourceAfter.id);s.data.assign[index]=p.p_plan.sourceAfter;r.links.find(l=>l.assignmentId===p.p_plan.sourceAfter.id).handedOverTo=a.id;}
   s.data.assign.push(a);r.links.push({taskId:p.p_entity,assignmentId:a.id,employeeId:a.emp});s.revision++;
  }
  r.revision++;
  const result={operation:p.p_operation,entityId:p.p_entity,assignmentId:p.p_plan.assignment?.id??null,recordsRevision:r.revision,workshopRevision:s.revision};
  receipts.set(p.p_request,{actorId:p.p_actor,fingerprint:p.p_fingerprint,result});
  if(loseAck){loseAck=false;throw new Error('QA_LOST_ACK')}
  return result;
 }};
const command=(operation,entityId,payload)=>({operation,entityId,payload,requestId:id(serial++),deviceId:'QA_DEVICE',expectedRevision:r.revision,expectedWorkshopRevision:s.revision});
const mc=command('MC_CREATE',id(1),{manualJobCard:{number:'QA_JC',date:'2026-10-22'}});
assert.equal((await api(mc)).body.code,'extension_disabled');
assert.equal((await api(mc,{...server,enabled:false})).body.code,'extension_disabled');assert.equal(verifies,0);
for(const extra of [{actorId:'QA_OTHER'},{policy},{context:{sessionCurrent:true}},{p_plan:{}},{allocatedChecklist:{sequence:999}}])assert.equal((await api({...mc,...extra},server)).body.code,'invalid_command');
assert.equal((await api(mc,{...server,verifySession:async()=>({...actor,id:'QA_OTHER'})})).body.code,'session_changed');
assert.equal((await api(mc,{...server,verifySession:async()=>({...actor,active:false})})).body.code,'session_changed');
for(const role of ['Employee','Receptionist','Accountant'])assert.equal((await api(mc,{...server,verifySession:async()=>({...actor,role})})).body.code,'mechanical_forbidden');
assert.equal((await api(mc,{...server,policy:{...policy,mechanicalStaff:{}}})).body.code,'mechanical_capability_required');
assert.equal(reads,0,'Denied actors cannot perform receipt/context reads');
assert.equal((await api({...mc,payload:{...mc.payload,expectedEmployeeSessions:'spoof'}},server)).body.code,'invalid_command');
assert.equal((await api({...mc,expectedWorkshopRevision:NaN},server)).body.code,'invalid_revision');
assert.equal((await api(mc,server)).status,200);assert.equal(r.checklists[0].number,'MC001');assert.equal(s.revision,12,'Metadata cannot advance the shared state revision');
const commitCount=commits,contextCount=contexts;
assert.equal((await api(mc,server)).body.duplicate,true);assert.equal(commits,commitCount);assert.equal(contexts,contextCount,'Retry receipt resolves before new snapshot/history reads');
assert.equal((await api({...mc,deviceId:'OTHER_DEVICE'},server)).body.code,'request_reused');
const task=command('TASK_CREATE',id(2),{checklistId:id(1),title:'QA brakes'});assert.equal((await api(task,server)).status,200);
const assignment=command('TASK_ASSIGN',id(2),{employeeId:'QA_A',assignmentId:id(3),suggestedMinutes:60});assert.equal((await api(assignment,server)).status,200);
s.data.sessions=[{id:'QA_PERIOD',emp:'QA_A',job:'QA_JC',assignmentId:id(3),start:at-3600000,end:at,paused:true}];s.revision++;
const handover=command('TASK_HANDOVER',id(2),{sourceAssignmentId:id(3),targetEmployeeId:'QA_B',successorAssignmentId:id(4),suggestedMinutes:30,reason:'QA handover'});
assert.equal((await api({...handover,payload:{...handover.payload,expectedSource:'spoof'}},server)).body.code,'invalid_command');
const pre=structuredClone(s.data.sessions);loseAck=true;
await assert.rejects(api(handover,server),/QA_LOST_ACK/);
assert.equal(r.links.length,2);assert.equal(s.data.assign[0].completed,true);assert.deepEqual(s.data.sessions,pre);assert.equal(workedMinutes(s.data,s.data.assign[0],at),60);
const handoverCommits=commits,handoverContexts=contexts;
// Current data/time no longer reproduces the original internal tokens. Retry
// still resolves from the original stable client command without reading it.
s.data.sessions.push({id:'QA_LATER',emp:'QA_B',job:'QA_JC',assignmentId:id(4),start:at+60000});s.revision++;
const retry=await api(handover,{...server,readContext:async()=>{throw new Error('Retry must not read changed history')}});
assert.equal(retry.body.duplicate,true);assert.equal(commits,handoverCommits);assert.equal(contexts,handoverContexts);
assert.match(lastPlan.p_fingerprint,/^[0-9a-f]{64}$/);assert.ok(Buffer.byteLength(JSON.stringify(lastPlan))<5000);
const changed=structuredClone(handover);changed.payload.reason='Changed reuse';assert.equal((await api(changed,server)).body.code,'request_reused');
// Recheck account and role after planning, before invoking any persistence.
for(const replacement of [null,{...actor,id:'QA_OTHER'},{...actor,role:'Employee'},{...actor,active:false}]){
 let checks=0;const before=commits;
 const next=command('TASK_CREATE',id(serial++),{checklistId:id(1),title:'Should not write'});
 assert.equal((await api(next,{...server,verifySession:async()=>++checks===1?actor:replacement})).body.code,'session_changed');assert.equal(commits,before);
}
const stale=command('TASK_CREATE',id(9),{checklistId:id(1),title:'Stale'});stale.expectedWorkshopRevision--;
assert.equal((await api(stale,server)).body.code,'workshop_revision_conflict');
console.log('PASS inactive Mechanical API boundary: default-off, trusted actor/capability, spoofed envelope/token rejection, server-derived time checks, stable lost-ack fingerprint, no retry history read, original hours, revision/account-switch protection. No deployed route.');
