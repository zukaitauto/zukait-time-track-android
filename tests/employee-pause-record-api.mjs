import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {isDeepStrictEqual} from 'node:util';
import {runInNewContext} from 'node:vm';
import {prepareEmployeePause,decideEmployeePause} from '../supabase/functions/workshop-api/extensions/employee_pause_record.js';

const source=readFileSync(new URL('../supabase/functions/workshop-api/index.ts',import.meta.url),'utf8');
const transition=source.slice(source.indexOf('function employeeTimeTransition('),source.indexOf('// ID001_ASSIGNMENT_RULE_BEGIN'));
const route=source.slice(source.indexOf('if (action === "employee_time_action")'),source.indexOf('if (action === "time_management")'));
assert.ok(transition.length>1000&&route.length>1000);
const liveStatus=source.slice(source.indexOf('function computeLiveStatus('),source.indexOf('async function loadAuthoritativeLiveStatus('));
assert.ok(liveStatus.length>1000);
const code=stripTypeScriptTypes(liveStatus+'\n'+transition+'\n(async function (){'+route+'})');
const employee={id:'E1',role:'Employee'};
const body={event_type:'PAUSE',action_id:'P1',session_id:'S1',reason:'Break'};
const initial={users:[{id:'E1',role:'Employee',name:'Technician One'},{id:'E2',role:'Employee',name:'Technician Two'}],jobs:[{no:'JC1'},{no:'JC2',note:'old'}],
 sessions:[{id:'S1',emp:'E1',job:'JC1',assignmentId:'A1',start:1,end:null},
   {id:'S2',emp:'E2',job:'JC2',assignmentId:'A2',start:2,end:null}],
 assign:[{id:'A1',emp:'E1',job:'JC1'},{id:'A2',emp:'E2',job:'JC2'}],lastActions:{},employeeTimeActionAudit:[]};

function fixture(change,enabled=true){
 let snapshot={revision:1,data:structuredClone(initial)},commits=0, published=[];
 const admin={
  from(){return {select(){return this},eq(){return this},async single(){return {data:structuredClone(snapshot)}}}},
  async rpc(_name,params){
   commits++;
   if(commits===1&&change){
    change(snapshot.data);snapshot.revision++;
    return {data:{ok:false,code:'conflict'}};
   }
   assert.equal(params.p_expected_revision,snapshot.revision);
   snapshot={revision:snapshot.revision+1,data:structuredClone(params.p_data)};
   published=structuredClone(params.p_live);
   return {data:{ok:true,revision:snapshot.revision}};
  }
 };
 const execute=runInNewContext(code,{
  Deno:{env:{get:key=>key==='ZUKAIT_PAUSE_RECORD_GUARD'&&enabled?'true':undefined}},
  action:'employee_time_action',admin,user:employee,body,
  reply:(body,status=200)=>({body,status}),prepareEmployeePause,decideEmployeePause,
  cloneValue:structuredClone,same:isDeepStrictEqual,crypto
 });
 return {execute,get snapshot(){return snapshot},get commits(){return commits},get published(){return published}};
}

const unrelated=fixture(data=>{data.jobs[1].note='Reception saved';});
const paused=await unrelated.execute();
assert.equal(paused.status,200);
assert.equal(paused.body.status,'Paused');
assert.equal(paused.body.live_row.session_id,'S1');
assert.equal(paused.body.live_row.state_revision,3);
assert.equal(unrelated.published.find(row=>row.employee_id==='E1').status,'Paused');
assert.equal(unrelated.published.find(row=>row.employee_id==='E2').status,'Working');
assert.equal(unrelated.snapshot.data.jobs[1].note,'Reception saved');
assert.equal(unrelated.snapshot.data.sessions[0].paused,true);
const replay=await unrelated.execute();
assert.equal(replay.body.duplicate,true);
assert.equal(replay.body.live_row.status,'Paused');
assert.equal(unrelated.snapshot.data.employeeTimeActionAudit.length,1);
assert.equal(unrelated.commits,2);

const pauseElsewhere=data=>{data.sessions[0].end=999;data.sessions[0].paused=true;};
const changed=fixture(pauseElsewhere);
const conflict=await changed.execute();
assert.equal(conflict.status,409);
assert.equal(conflict.body.code,'employee_time_conflict');
assert.equal(changed.snapshot.data.sessions[0].end,999);
assert.equal(changed.snapshot.data.employeeTimeActionAudit.length,0);
assert.equal(changed.commits,1);
assert.equal(changed.published.length,0);
const legacy=fixture(pauseElsewhere,false);
assert.equal((await legacy.execute()).status,200);
assert.equal(legacy.snapshot.data.employeeTimeActionAudit.length,1);
console.log('Authenticated Pause route: unrelated retry, same-session conflict, duplicate receipt and flag-off behavior passed.');
