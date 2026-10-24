import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const prefix=source.slice(source.indexOf('  const API_URL'),source.indexOf('  let cloudRevision='));
const merge=source.slice(source.indexOf('  function same('),source.indexOf('  function reconcileConsumablesDuplicates('));
const recovery=source.slice(source.indexOf('  function mechanicalConflictRebase('),source.indexOf('  async function syncNow('));
const push=source.slice(source.indexOf('  async function push(retry=0)'),source.indexOf('  window.cloudScheduleSave='));
const sync=source.slice(source.indexOf('  async function syncNow('),source.indexOf('  async function backupNow('));
const base={assign:[{id:'SOURCE',emp:'QA_A',job:'QA_JC',suggested:60,completed:false,assignedAt:1,assignedBy:'QA_SUP',mechanicalTaskId:'TASK',mechanicalChecklistId:'MC'}],sessions:[{id:'PERIOD',assignmentId:'SOURCE',emp:'QA_A',job:'QA_JC',start:1,end:3600001}],jobs:[{no:'QA_JC',status:'Open'}],expenses:[{id:'EXISTING',amount:1.234}],leaves:[]};
const remote=structuredClone(base);Object.assign(remote.assign[0],{completed:true,completedAt:4000000,handedOverToAssignmentId:'SUCCESSOR'});remote.assign.push({id:'SUCCESSOR',emp:'QA_B',job:'QA_JC',suggested:30,completed:false,mechanicalTaskId:'TASK',mechanicalChecklistId:'MC',handoverFromAssignmentId:'SOURCE'});
function context(initial=base){
 const storage=new Map(),events=[],timers=[];
 storage.set('zukait_cloud_denied_snapshot_v42',JSON.stringify({user:'QA_SUP',data:initial,error:'mechanical_authority_conflict'}));
 storage.set('zukait_cloud_pending_conflict_v42',JSON.stringify({user:'QA_SUP',revision:1,data:initial}));
 const c={state:structuredClone(initial),me:{id:'QA_SUP',role:'Manager'},token:'QA_SYNTHETIC',navigator:{onLine:true},cloudPushing:false,cloudDirty:true,cloudApplying:false,cloudRevision:1,dirtyGeneration:1,lastSyncedState:structuredClone(base),lastSyncError:'',consecutiveSyncErrors:0,pushTimer:null,
 localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 status:(...x)=>events.push(x),setServerConnection:(...x)=>events.push(x),sessionToken:()=>c.token,payloadState:()=>structuredClone(c.state),persistLocal(){},ensureShape(){},scheduleDashboardRender(){},setTimeout:fn=>timers.push(fn),clearTimeout(){},console:{error(){},warn(){}},liveRole:()=>false,alert(){},confirm:()=>{throw Error('Mechanical recovery cannot use generic retry confirmation')},pull:async()=>{},api:async()=>({ok:true,revision:2,data:structuredClone(remote)})};
 vm.createContext(c);vm.runInContext(prefix+merge+recovery,c);c.getDenied=()=>vm.runInContext('deniedSnapshot',c);
 return {c,storage,events,timers};
}
let {c}=context();assert.equal(c.isMechanicalConflict('mechanical_delivery_authority_conflict'),true);let pending=structuredClone(base);pending.expenses.push({id:'LOCAL',amount:2.345});
const before=JSON.stringify({base,remote,pending}),result=c.mechanicalConflictRebase(base,remote,pending);
assert.equal(result.ok,true);assert.equal(result.data.assign[0].completed,true);assert.equal(result.data.assign[0].handedOverToAssignmentId,'SUCCESSOR');assert.equal(result.data.assign.length,2);assert.equal(result.data.expenses.at(-1).amount,2.345);assert.equal(JSON.stringify({base,remote,pending}),before,'Pure recovery cannot mutate its inputs');
for(const mutate of [d=>{d.assign=[]},d=>{d.assign[0].emp='QA_OTHER'},d=>{d.assign[0].suggested=0},d=>{d.sessions.push({id:'LOCAL_START',assignmentId:'SOURCE',emp:'QA_A',job:'QA_JC',start:5000000})},d=>{d.sessions=[]},d=>{d.sessions[0].end+=60000},d=>{d.jobs[0].status='Completed'}]){
 pending=structuredClone(base);mutate(pending);assert.equal(c.mechanicalConflictRebase(base,remote,pending).ok,false,'Intentional changes need review');
}
pending=structuredClone(remote);pending.assign[0].completed=false;assert.equal(c.mechanicalConflictRebase(remote,remote,pending).ok,false,'Explicit reopen cannot be silently discarded');
assert.equal(c.mechanicalConflictRebase(null,remote,base).reason,'baseline_unavailable');
// Refresh includes clicks made while the load is in flight, then removes only
// the stale authority discrepancy. It never posts a full-state save itself.
let x=context();c=x.c;let resolve,reads=0;c.api=async body=>{reads++;assert.equal(body.action,'load');return new Promise(r=>resolve=r)};
const refresh=c.recoverMechanicalQueue();c.state.expenses.push({id:'DURING_LOAD',amount:3.456});resolve({ok:true,revision:2,data:structuredClone(remote)});assert.equal(await refresh,true);assert.equal(reads,1);assert.equal(c.state.expenses.at(-1).amount,3.456);assert.equal(c.cloudDirty,true);assert.equal(c.cloudRevision,2);assert.equal(c.getDenied(),null);assert.equal(JSON.parse(x.storage.get('zukait_cloud_pending_conflict_v42')).data.expenses.at(-1).id,'DURING_LOAD');
// A restart without its exact merge baseline stays blocked with the full queue.
x=context();c=x.c;c.lastSyncedState=null;c.api=()=>{throw Error('No baseline means no speculative refresh')};assert.equal(await c.recoverMechanicalQueue(),false);assert.ok(c.getDenied());
// Account switch / token rotation during a load cannot adopt another queue.
for(const change of [c=>{c.me={id:'OTHER',role:'Manager'}},c=>{c.token='CHANGED'}]){
 x=context();c=x.c;let done;c.api=()=>new Promise(r=>done=r);const oldQueue=x.storage.get('zukait_cloud_pending_conflict_v42'),p=c.recoverMechanicalQueue();change(c);done({ok:true,revision:2,data:remote});assert.equal(await p,false);assert.equal(x.storage.get('zukait_cloud_pending_conflict_v42'),oldQueue);assert.ok(c.getDenied());
}
// Unsafe source work, offline mode and failed local persistence keep originals.
for(const setup of [c=>{c.state.sessions.push({id:'BAD',assignmentId:'SOURCE',emp:'QA_A',job:'QA_JC',start:5000000})},c=>{c.navigator.onLine=false},c=>{c.persistLocal=()=>{throw Error('QA disk full')}}]){
 x=context();c=x.c;setup(c);const original=JSON.stringify(c.state),oldQueue=x.storage.get('zukait_cloud_pending_conflict_v42');assert.equal(await c.recoverMechanicalQueue(),false);assert.equal(JSON.stringify(c.state),original);assert.equal(x.storage.get('zukait_cloud_pending_conflict_v42'),oldQueue);assert.ok(c.getDenied());
}
// The real push catch persists the specific conflict and blocks all automatic
// retries, even after another local click, across restarts and accounts.
x=context();c=x.c;vm.runInContext('deniedSnapshot=null;',c);let saves=0;c.api=async()=>{saves++;return {_status:403,code:'mechanical_authority_conflict'}};vm.runInContext(push,c);await c.push();assert.equal(saves,1);assert.equal(x.timers.length,0);c.state.expenses.push({id:'AFTER_CONFLICT',amount:4.567});await c.push();assert.equal(saves,1);assert.equal(c.permissionBlocked(c.state),true);assert.equal(c.cloudDirty,true);assert.equal(JSON.parse(x.storage.get('zukait_cloud_pending_conflict_v42')).data.expenses.at(-1).id,'AFTER_CONFLICT','Later clicks stay durable without resending');assert.ok(x.events.some(e=>String(e[0]).includes('WORK CHANGED')));
// Explicit Sync performs one refresh and one save only after safe reconciliation.
x=context();c=x.c;let posted=0;c.push=async()=>{posted++;assert.equal(c.state.assign[0].completed,true);assert.equal(c.cloudRevision,2)};vm.runInContext(sync,c);await c.syncNow();assert.equal(posted,1);assert.equal(c.getDenied(),null);
console.log('PASS Mechanical recovery: no retry loop, persistent conflict barrier, safe stale rebase, full pending money/history retained, in-flight clicks, explicit Sync, intentional-edit review, missing-baseline/offline/storage/account guards.');
