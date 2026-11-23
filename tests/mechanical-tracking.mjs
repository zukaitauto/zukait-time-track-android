import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {trackingChange,mechanicalTrackingApi as api} from '../supabase/functions/workshop-api/extensions/mechanical_tracking.js';
const actor={id:'QA_SUP',role:'Supervisor',active:true},ops=['PRIORITY_SET','PROMISE_SET','HOLD_SET'],policy={flags:{mechanical:true},trackingEnabled:true,priorityValues:['NORMAL','URGENT'],holdMode:null,mechanicalStaff:{QA_SUP:ops}};
const c=(operation,payload)=>({operation,requestId:randomUUID(),entityId:randomUUID(),deviceId:'QA',expectedRevision:2,expectedWorkshopRevision:4,payload});
assert.equal(trackingChange({},c('PROMISE_SET',{date:'2026-02-30',reason:'QA'}),policy).code,'invalid_promise_date');
for(const date of ['2026-10-23','2024-02-29',null]){const old=date===null?{promiseDate:'2026-10-23'}:{};assert.equal(trackingChange(old,c('PROMISE_SET',{date,reason:'QA'}),policy).after.promiseDate,date)}
for(const date of ['2026-10-23T20:00:00Z','2026-1-2','2025-02-29',undefined])assert.equal(trackingChange({},c('PROMISE_SET',{date,reason:'QA'}),policy).ok,false);
assert.equal(trackingChange({},c('PRIORITY_SET',{priority:'URGENT',reason:'QA'}),policy).ok,true);assert.equal(trackingChange({},c('PRIORITY_SET',{priority:'invented',reason:'QA'}),policy).code,'tracking_priority_policy_required');
assert.equal(trackingChange({},c('HOLD_SET',{waiting:true,reason:'QA'}),policy).code,'tracking_hold_policy_required');assert.equal(trackingChange({},c('HOLD_SET',{waiting:true,reason:'QA'}),{...policy,holdMode:'STATUS_ONLY'}).after.waitingForParts,true);
assert.equal(trackingChange({waitingForParts:true},c('HOLD_SET',{waiting:false,reason:'Received'}),{...policy,holdMode:'STATUS_ONLY'}).after.waitingForParts,false);
for(const payload of [{priority:'URGENT',reason:''},{priority:'URGENT',reason:'QA',actor:'forged'}])assert.equal(trackingChange({},c('PRIORITY_SET',payload),policy).ok,false);
assert.equal(trackingChange({priority:'NORMAL'},c('PRIORITY_SET',{priority:'NORMAL',reason:'QA'}),policy).code,'tracking_no_change');
let reads=0,commits=0,receipt=null,checks=0;
const input=c('PROMISE_SET',{date:'2026-10-24',reason:'Customer appointment'}),server={enabled:true,trackingEnabled:true,actor,policy,verifySession:async()=>{checks++;return actor},readReceipt:async()=>{reads++;return receipt},readContext:async()=>{reads++;return {active:true,recordsRevision:2,workshopRevision:4,tracking:{}}},commit:async p=>{commits++;assert.deepEqual(p.p_payload,input.payload);return {ok:true,requestId:p.p_request}}};
assert.equal((await api(input,{...server,trackingEnabled:false})).status,403);assert.equal(reads,0);assert.equal((await api({...input,actorId:'fake'},server)).status,400);assert.equal((await api(input,server)).status,200);assert.equal(commits,1);
assert.equal((await api({...input,expectedRevision:1},server)).body.code,'mechanical_revision_conflict');assert.equal((await api(input,{...server,readContext:async()=>({active:false,recordsRevision:2,workshopRevision:4})})).body.code,'checklist_inactive');
checks=0;assert.equal((await api(input,{...server,verifySession:async()=>++checks===1?actor:null})).body.code,'session_changed');assert.equal(commits,1);
console.log('PASS tracking model/boundary: configured priorities, exact Oman calendar dates/explicit clears, manual hold policy gate/reasons/no-op, role/capabilities, revisions, no writes after session change.');
