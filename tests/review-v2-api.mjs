import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadApi,fixture,TEST_NOW} from './helpers/workshop-api.mjs';
const event={eventId:'event1',entityId:'a1',actorId:'E1',deviceId:'test-device',clientTime:new Date(TEST_NOW-3600000).toISOString(),serverRevision:0,type:'WORK_START',payload:{employeeId:'E1',jobCard:'JC1',suggestedMinutes:60}};
const rpc=(name,args)=>({data:[{event_id:args.p_event_id,server_time:'2026-10-08T06:00:00Z',revision:1,inserted:true}],error:null});
let api=loadApi({state:fixture(),onRpc:rpc});
let response=await api.request({action:'v2_commit_event',event});
assert.equal(response.status,200,'V2 event reaches RPC without undefined profile');assert.equal(response.body.ok,true);assert.equal(api.calls[0].name,'zukait_v2_commit_event');
api=loadApi({state:fixture(),onRpc:rpc});response=await api.request({action:'v2_commit_event',event:{...event,payload:{...event.payload,employeeId:'E2'}}});
assert.equal(response.status,403,'employee cannot record another employee work');assert.equal(api.calls.length,0);
api=loadApi({state:fixture(),onRpc:rpc});response=await api.request({action:'v2_commit_event',event:{...event,payload:{...event.payload,suggestedMinutes:500}}});
assert.equal(response.status,403,'allocated time cannot be forged');
api=loadApi({state:fixture(),onRpc:rpc});response=await api.request({action:'v2_commit_event',event:{...event,type:'PUBLIC_HOLIDAY_SET',payload:{date:'2026-10-10'}}});
assert.equal(response.status,403,'employee cannot set workshop calendar');
api=loadApi({state:fixture(),onRpc:rpc});response=await api.request({action:'v2_upsert_jobcard',jobcard:{jobCard:'UNAUTHORIZED'}});
assert.equal(response.status,403);assert.equal(api.calls.length,0);
for(const role of ['Manager','Supervisor']){
 api=loadApi({state:fixture(),role,id:'S1',onRpc:rpc});response=await api.request({action:'v2_commit_event',event:{...event,actorId:'S1',type:'JOB_ASSIGNED'}});assert.equal(response.status,200,'managerial assignment role retained');
}
api=loadApi({state:fixture(),tables:{workshop_v2_events:{actor_id:'E1'}},onRpc:rpc});response=await api.request({action:'v2_commit_event',event});assert.equal(response.status,200,'own duplicate remains replayable');
api=loadApi({state:fixture(),tables:{workshop_v2_work_sessions:{employee_id:'E2',job_card:'JC1'}},onRpc:rpc});response=await api.request({action:'v2_commit_event',event:{...event,type:'WORK_FINISH'}});assert.equal(response.status,403,'session ownership checked against storage');
for(const report of ['ID001','OVERTIME','REPEAT','JOB_COST','EFFICIENCY']){
 const row={session_id:'s1',job_card:'JC1',employee_id:'E1',sort_time:'2026-10-08T06:00:00Z'};
 api=loadApi({state:fixture(),onRpc:(name,args)=>({data:[row],error:null})});response=await api.request({action:'v2_report_page',report,limit:1});
 assert.equal(response.status,200);assert.deepEqual(response.body.next_cursor,{before:row.sort_time,before_id:'s1'},'operational full page has continuation cursor');
 assert.equal(api.calls[0].name,'zukait_v2_operational_report_page_cursor');
 response=await api.request({action:'v2_report_page',report,limit:1,before:row.sort_time,before_id:'s1'});
 assert.equal(api.calls[1].args.p_before,row.sort_time);assert.equal(api.calls[1].args.p_before_id,'s1');
}
const sql=fs.readFileSync('supabase/REVIEW_SAFE_REPORT_CURSOR.sql','utf8');
assert.doesNotMatch(sql,/\b(?:insert|update|delete|truncate|drop|alter)\s+(?:into|table|function|public)/i,'cursor fix does not rewrite tables or replace old RPC');
assert.match(sql,/sort_time timestamptz/);assert.match(sql,/labour_cost_omr,s\.updated_at/);assert.match(sql,/security invoker/);assert.match(sql,/revoke all[^;]*public,anon,authenticated/);assert.match(sql,/grant execute[^;]*service_role/);
console.log('Review V2 API: authenticated event writes, ownership, allocated minutes and operational cursor routing passed');
