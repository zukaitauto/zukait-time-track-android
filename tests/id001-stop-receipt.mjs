import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const code=source.slice(source.indexOf('function employeeTimeTransition('),source.indexOf('// ID001_ASSIGNMENT_RULE_BEGIN'));
const transition=vm.runInNewContext(stripTypeScriptTypes(code)+';employeeTimeTransition',{cloneValue:structuredClone,crypto:{randomUUID:()=> 'generated'}});
const actor={id:'EMP003',role:'Employee'},initial={jobs:[{no:'12096',status:'Open'}],assign:[{id:'idle-a',emp:'EMP003',job:'ID001',completed:false},{id:'work-a',emp:'EMP003',job:'12096',completed:false}],sessions:[{id:'idle-s',assignmentId:'idle-a',emp:'EMP003',job:'ID001',start:100,end:null,finished:false}],employeeTimeActionAudit:[]};
const stop={event_type:'STOP_ID001',action_id:'stop-1',job:'ID001',assignment_id:'idle-a',session_id:'idle-s'};
for(const employee of ['EMP003','EMP004']){const fixture=JSON.parse(JSON.stringify(initial).replaceAll('EMP003',employee)),r=transition(fixture,{...actor,id:employee},stop,200);assert.equal(r.ok,true);assert.equal(r.session.finished,true);assert.equal(r.assignment.completed,true);}
let result=transition(initial,actor,stop,200);assert.equal(result.ok,true);assert.equal(result.session.end,200);assert.equal(result.session.finished,true);assert.equal(result.assignment.completed,true);assert.equal(initial.sessions[0].end,null);
assert.equal(transition(result.data,actor,stop,300).duplicate,true);
assert.equal(transition(result.data,{...actor,id:'EMP004'},stop,300).code,'employee_time_action_id_conflict');
const guardStart=source.indexOf('function preserveClosedSessions('),guardEnd=source.indexOf('\nfunction reconcileAutoOvertime(',guardStart);
const guard=vm.runInNewContext(stripTypeScriptTypes(source.slice(guardStart,guardEnd))+';preserveClosedSessions',{});
const stale=structuredClone(initial);guard(stale,result.data);assert.equal(stale.sessions[0].finished,true);assert.equal(stale.sessions[0].end,200);assert.equal(stale.assign[0].completed,true);
const historyStart=source.indexOf('function preserveOperationalHistory('),historyEnd=source.indexOf('\nfunction ',historyStart+5);
const operational=vm.runInNewContext(stripTypeScriptTypes(source.slice(historyStart,historyEnd))+';preserveOperationalHistory',{cloneValue:structuredClone});
const oldDevice=structuredClone(initial);operational(oldDevice,result.data,actor);guard(oldDevice,result.data);assert.equal(oldDevice.sessions.length,1,'stale open copy must not erase closed ID001 history');assert.equal(oldDevice.sessions[0].finished,true);assert.equal(oldDevice.sessions[0].end,200);
assert.equal(transition(stale,actor,{event_type:'START',action_id:'restart',job:'ID001',assignment_id:'idle-a'},300).code,'employee_time_assignment_not_open');
const next=structuredClone(result.data);next.assign.push({id:'new-idle-a',emp:'EMP003',job:'ID001',completed:false});
const newIdle=transition(next,actor,{event_type:'START',action_id:'new-start',job:'ID001',assignment_id:'new-idle-a',new_session_id:'new-idle-s'},300);assert.equal(newIdle.ok,true);
const oldStop=transition(newIdle.data,actor,{...stop,action_id:'old-stop'},400);assert.equal(oldStop.data.sessions.find(s=>s.id==='new-idle-s').end,null,'old STOP cannot close a newer session');
assert.equal(transition(newIdle.data,actor,{...stop,session_id:'missing',action_id:'bad-stop'},400).code,'employee_time_no_session');
const start={event_type:'START',action_id:'start-work',job:'12096',assignment_id:'work-a',new_session_id:'work-s'};
const handoff=transition(initial,actor,start,250);assert.equal(handoff.ok,true);assert.equal(handoff.data.sessions[0].end,250);assert.equal(handoff.data.assign[0].completed,true);assert.equal(handoff.session.start,250);assert.equal(handoff.session.job,'12096');assert.equal(handoff.data.sessions.filter(s=>s.end==null).length,1);assert.equal(handoff.closedSessions[0].id,'idle-s');
const invalid=transition(initial,actor,{...start,assignment_id:'missing'},250);assert.equal(invalid.code,'employee_time_assignment_not_open');assert.equal(initial.sessions[0].end,null,'invalid target must not stop ID001');
assert.equal(transition(handoff.data,actor,{event_type:'START',action_id:'start-idle',job:'ID001',assignment_id:'idle-a'},300).ok,false,'productive work cannot be replaced by ID001');

const cloud=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8'),body=cloud.slice(cloud.indexOf('  async function employeeTimeAction('),cloud.indexOf('  async function editSublet('));
function harness({offlineRefresh=false,pending=false}={}){
 const storage=new Map([['dirty','1'],['pending','leave retained']]);
 const server=structuredClone(result.data),state=structuredClone(initial);let loads=0;
 const receipt={ok:true,server_revision:2,server_time:200,audit:result.audit,session:result.session,assignment:result.assignment,live_row:{employee_id:'EMP003',status:'Available',session_id:'',job_no:''}};
 const c={me:actor,state,cloudRevision:1,lastSyncedState:structuredClone(initial),cloudDirty:pending,dirtyGeneration:1,liveStatusRevision:1,liveStatusRows:[{employee_id:'EMP003',status:'ID001',session_id:'idle-s'}],liveStatusLastFetchedAt:1,liveStatusServerTime:1,navigator:{onLine:true},Date,clone:structuredClone,sessionToken:()=>true,localStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},REV_KEY:'revision',DIRTY_KEY:'dirty',PENDING_KEY:'pending',persistLocal(){},publishLiveStatus(){},api:async()=>receipt,pull:async()=>{loads++;assert.equal(c.lastSyncedState,null,'receipt must invalidate old full-state baseline');if(offlineRefresh)throw Error('NETWORK');if(!c.cloudDirty){c.state=structuredClone(server);c.lastSyncedState=structuredClone(server)}},pullLiveStatus:async()=>{if(offlineRefresh)throw Error('NETWORK')},setTimeout:()=>{throw Error('unexpected retry')}};
 vm.createContext(c);vm.runInContext(body,c);return {c,storage,receipt,loads:()=>loads};
}
let h=harness();await h.c.employeeTimeAction(stop);assert.equal(h.c.state.sessions[0].finished,true);assert.equal(h.c.state.assign[0].completed,true);assert.equal(h.c.liveStatusRows[0].status,'Available');assert.equal(h.loads(),1);
h=harness({offlineRefresh:true,pending:true});await h.c.employeeTimeAction(stop);assert.equal(h.c.state.sessions[0].end,200,'confirmed stop survives failed refresh');assert.equal(h.c.liveStatusRows[0].status,'Available');assert.equal(h.c.lastSyncedState,null);assert.equal(h.c.cloudDirty,true);assert.equal(h.storage.get('pending'),'leave retained');
h=harness();h.c.api=async()=>{h.c.me={id:'EMP004',role:'Employee'};return h.receipt};await assert.rejects(h.c.employeeTimeAction(stop),/ACTOR_CHANGED/);assert.equal(h.c.state.sessions[0].end,null);
console.log('PASS ID001 stop baseline invalidation, confirmed receipts with failed refresh, pending-data/account protection, strict session targeting, stale-restart prevention and atomic productive-work handoff.');
