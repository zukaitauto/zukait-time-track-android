import assert from "node:assert/strict";
import {qcWork} from "../supabase/functions/workshop-api/qc_delivery_rules.js";
import {receptionDashboardProjection,receptionPromiseTransition,preserveReceptionPromiseAuthority,validPromiseDate} from "../supabase/functions/workshop-api/reception_dashboard_rules.js";
const rec=(n,seq,status,location,job="",type="INSURANCE",date="2026-10-10T09:00:00+04:00")=>({
 rc_no:n,sequence_no:seq,details:{make:"Toyota",model:"Camry",registration:"QA-"+seq,customer:"QA-only"},
 job_card:job,job_type:type,received_at:date,location,approval_status:status,insurance_company:"QA Insurance"});
const cases=[
 rec("RC0002",2,"WAITING","VIW"),
 rec("RC0010",10,"APPROVED","VIW"),
 rec("RC0009",9,"APPROVED","VWC","JC120"),
 rec("RC0012",12,"WAITING","VWC"),
 rec("RC0011",11,"APPROVED","VWC","JC125"),
 rec("RC0013",13,"WAITING","VIW","JC199","CASH")
];
const jobs=[
 {no:"JC125",receptionNo:"RC0011",jobType:"INSURANCE",reg:"QA-11",make:"Toyota",model:"Camry",status:"Open",promiseDate:"2026-10-15",createdAt:Date.parse("2026-10-10T10:00:00+04:00")},
 {no:"JC120",receptionNo:"RC0009",jobType:"INSURANCE",reg:"QA-9",make:"Toyota",model:"Camry",status:"Open",promiseDate:""},
 {no:"JC199",receptionNo:"RC0013",jobType:"CASH",reg:"QA-13",status:"Delivered",delivered:true,deliveredAt:Date.parse("2026-10-11T11:25:00+04:00")},
 {no:"JC100",jobType:"CREDIT",reg:"QA-100",status:"Open",promiseDate:""},
 {no:"ID001",status:"Open"}
];
const data={jobs,assign:[{id:"QC-ASSIGN",emp:"QA-EMP",job:"JC125",completed:true,completedAt:15}],
 sessions:[{id:"QC-SESSION",emp:"QA-EMP",job:"JC125",start:10,end:14}],
 expenses:[{amount:199.5}],password:"NOPE"};
jobs[0].qcWorkflow={revision:1,fingerprint:qcWork(data,"JC125").fingerprint,painting:{result:"PASS"},final:{result:"PASS"}};
const projection=opts=>receptionDashboardProjection(data,cases,{section:"checklists",...opts});
const start=projection({});
assert.equal(start.ok,true);assert.equal(start.counts.checklists,6);
assert.equal(start.rows[0].rc_no,"RC0013","Numeric reception sorting must be newest first");
assert.equal(start.counts.waiting,2,"Waiting insurance only, not direct cash or linked jobs");
assert.equal(start.counts.approved,1,"Approved checklist disappears after JC creation");
assert.equal(start.counts["vwc-checklists"],1);
assert.equal(start.counts["vwc-jobs"],2);
assert.equal(start.counts.vwc,3);
assert.equal(start.counts.ready,1,"Ready uses existing final QC fingerprint, not status alone");
assert.equal(start.counts.delivered,1);
assert.equal(start.counts.no_promise_date,2);
assert.deepEqual(projection({section:"ready"}).rows.map(r=>r.job_card),["JC125"]);
assert.equal(projection({section:"delivered"}).rows[0].job_card,"JC199");
assert.equal(projection({section:"approved"}).rows[0].rc_no,"RC0010");
assert.deepEqual(projection({section:"jobs"}).rows.map(r=>r.job_card),["JC199","JC125","JC120","JC100"]);
assert.equal(projection({section:"checklists",search:"JC125"}).rows[0].rc_no,"RC0011");
assert.equal(projection({section:"checklists",search:"qa-12"}).rows[0].rc_no,"RC0012");
assert.equal(projection({section:"checklists",search:"rc0010"}).rows[0].rc_no,"RC0010");
assert.equal(projection({section:"checklists",month:"2026-10"}).total,6);
assert.equal(projection({section:"checklists",month:"2026-09"}).total,0);
assert.equal(projection({section:"followup",missing_only:true}).total,2);
assert.deepEqual(projection({section:"followup",from:"2026-10-10",to:"2026-10-16"}).rows.map(x=>x.job_card),["JC125"]);
assert.equal(projection({section:"followup",from:"2026-10-16",to:"2026-10-20"}).total,0);
assert.equal(projection({section:"followup",dated_only:true}).total,1);
assert.equal(projection({section:"invalid"}).code,"reception_invalid_section");
assert.equal(validPromiseDate("2026-02-30"),false);
assert.equal(validPromiseDate("2026-10-15"),true);
const user={id:"SUP-QA",role:"Supervisor"},id="f474101c-73a4-4c0b-930d-5aa5cd6feb64";
const body={action:"reception_promise_date",job_card:"JC100",promise_date:"2026-10-14",expected_promise_date:"",request_id:id};
const first=receptionPromiseTransition(data,user,body,42);
assert.equal(first.ok,true);
assert.equal(first.data.jobs.find(j=>j.no==="JC100").promiseDate,"2026-10-14");
assert.equal(data.jobs.find(j=>j.no==="JC100").promiseDate,"");
assert.deepEqual(first.data.expenses,data.expenses);
assert.equal(first.data.assign.length,data.assign.length);
assert.equal(receptionPromiseTransition(first.data,user,body,43).duplicate,true);
const deliveredAfterPromise=structuredClone(first.data);
const deliveredJob=deliveredAfterPromise.jobs.find(j=>j.no==="JC100");
deliveredJob.delivered=true;deliveredJob.status="Delivered";deliveredJob.deliveredAt=123;
const beforeDeliveredReplay=structuredClone(deliveredAfterPromise);
const deliveredReplay=receptionPromiseTransition(deliveredAfterPromise,user,body,234);
assert.equal(deliveredReplay.ok,true,"Lost promise response must remain confirmable after delivery");
assert.equal(deliveredReplay.duplicate,true,"Saved UUID must deduplicate after delivery");
assert.equal(deliveredReplay.data,undefined,"Promise retry must not commit another state revision");
assert.deepEqual(deliveredAfterPromise,beforeDeliveredReplay,"Promise retry must not alter delivery");
assert.equal(receptionPromiseTransition(deliveredAfterPromise,user,
 {...body,request_id:"a474101c-73a4-4c0b-930d-5aa5cd6feb64"},235).code,"reception_job_not_open");
assert.equal(receptionPromiseTransition(deliveredAfterPromise,user,
 {...body,promise_date:"2026-10-16"},235).code,"reception_request_conflict");
assert.equal(receptionPromiseTransition(deliveredAfterPromise,{...user,id:"DIFFERENT"},body,235).code,"reception_request_conflict");
const cancelledAfterPromise=structuredClone(first.data);
cancelledAfterPromise.jobs.find(j=>j.no==="JC100").cancelled=true;
cancelledAfterPromise.jobs.find(j=>j.no==="JC100").status="CANCELLED";
assert.equal(receptionPromiseTransition(cancelledAfterPromise,user,body,235).duplicate,true,
 "Retry confirmation must survive cancellation after a completed promise write");
const archivedAfterPromise=structuredClone(first.data);
archivedAfterPromise.jobs.find(j=>j.no==="JC100").archived=true;
assert.equal(receptionPromiseTransition(archivedAfterPromise,user,body,235).duplicate,true,
 "Retry confirmation must survive archiving after a completed promise write");
assert.equal(receptionPromiseTransition(first.data,user,{...body,job_card:"JC120"},235).code,
 "reception_request_conflict","A request UUID must not be reused for a different Job Card");
const upperUuid={...body,request_id:body.request_id.toUpperCase()};
assert.equal(receptionPromiseTransition(first.data,user,upperUuid,235).duplicate,true,
 "Promise receipt UUID comparison must be case-insensitive");

assert.equal(receptionPromiseTransition(first.data,{...user,id:"DIFFERENT"},body,43).code,"reception_request_conflict");
assert.equal(receptionPromiseTransition(first.data,user,{...body,request_id:"a474101c-73a4-4c0b-930d-5aa5cd6feb64"},43).code,"reception_promise_conflict");
assert.equal(receptionPromiseTransition(data,{id:"QA-RC",role:"Receptionist"},body,42).code,"reception_promise_forbidden");
assert.equal(receptionPromiseTransition(data,user,{...body,promise_date:"2026-02-30"},42).code,"reception_promise_invalid_date");
assert.equal(receptionPromiseTransition(data,user,{...body,job_card:"JC199"},42).code,"reception_job_not_open");
const preserved=preserveReceptionPromiseAuthority({jobs:first.data.jobs.map(j=>({...j,promiseDate:"TAMPERED",promiseAudit:[]}))},first.data);
assert.equal(preserved.jobs.find(j=>j.no==="JC100").promiseDate,"2026-10-14");
assert.equal(preserved.jobs.find(j=>j.no==="JC100").promiseAudit.length,1);
assert.equal(JSON.stringify(start).includes("199.5"),false,"No expense data exposed to Reception");
console.log("Reception dashboard: all ten categories, numeric sorting, month/date ranges, RC/JC/registration search, shared QC/delivery authority, no-date follow-up, audited promise date and old-client preservation passed.");
