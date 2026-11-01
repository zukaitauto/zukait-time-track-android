// V377 Manager Additional vs Repeat Work: isolated server rules and UI wiring.
// Pure synthetic data: no network, credentials, or production records.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8');
const serverCode=read('supabase/functions/workshop-api/qc_delivery_rules.js');
assert.equal(serverCode,read('app/src/main/assets/qc_delivery_rules.js'),'App/server QC rules must match exactly');
const {qcTransition,qcStatus}=await import('data:text/javascript;base64,'+Buffer.from(serverCode).toString('base64'));
const copy=x=>structuredClone(x),at=Date.parse('2026-11-01T09:45:00+04:00');
const manager={id:'MGR001',name:'Manager',role:'Manager'};
const supervisor={id:'SUP001',name:'Supervisor',role:'Supervisor'};
const initial={jobs:[{no:'12025',jobType:'CASH',department:'Bodyshop',status:'Delivered',delivered:true,
 deliveredAt:at-86400000,deliveredBy:'SUP001',invoiceDate:'2026-10-31',finalInvoiceAmount:250,
 qcPassed:true,insuranceLpo:{amount:250},qcWorkflow:{revision:8,fingerprint:'previous',painting:{result:'PASS'},final:{result:'PASS'},history:[]},
 deliveryAudit:[],partsInvoice:{total:30}}],
 users:[{id:'EMP001',role:'Employee',name:'Original Mechanic',active:true,department:'Denter'},
        {id:'EMP002',role:'Employee',name:'New Mechanic',active:true,department:'Denter'}],
 assign:[{id:'ASSIGN-A',job:'12025',emp:'EMP001',suggested:240,completed:true,completedAt:at-172800000,rework:false}],
 sessions:[{id:'S1',job:'12025',emp:'EMP001',assignmentId:'ASSIGN-A',start:at-180000000,end:at-179000000}],
 spareParts:{lists:[{id:'PL-A'}]},consumables:{actuals:[{id:'MAT-A'}]},reworkLogs:[],reopenLogs:[]};
const additional={operation:'REOPEN_ADDITIONAL',jobCard:'12025',requestId:'jr-11111111-1111-4111-8111-111111111111',
 employeeId:'EMP002',minutes:480,reason:'Additional work requested by customer',expectedQcRevision:8};
const repeat={operation:'REOPEN_REPEAT',jobCard:'12025',requestId:'jr-22222222-2222-4222-8222-222222222222',
 employeeId:'EMP002',mistakeEmployeeId:'EMP001',minutes:300,reason:'Poor finish requires a repeat',expectedQcRevision:8};
const run=(who,request,data=initial)=>qcTransition(data,who,request,at);
for(const req of [additional,repeat]){
 assert.equal(run(supervisor,req).code,'manager_required');
 assert.equal(run({id:'EMP001',role:'Employee'},req).code,'manager_required');
 assert.equal(run(manager,{...req,requestId:'invalid'}).code,'reopen_invalid_request');
 assert.equal(run(manager,{...req,minutes:0}).code,'reopen_minutes_required');
 assert.equal(run(manager,{...req,reason:'abc'}).code,'reopen_reason_required');
 assert.equal(run(manager,{...req,expectedQcRevision:7}).code,'qc_conflict');
}
assert.equal(run(manager,{...repeat,mistakeEmployeeId:'EMP002'}).code,'repeat_responsible_employee_required');
assert.equal(run(manager,{...additional,employeeId:'UNKNOWN'}).code,'reopen_employee_invalid');
let dirty=copy(initial);dirty.assign[0].completed=false;
assert.equal(run(manager,additional,dirty).code,'reopen_work_not_complete');
dirty=copy(initial);dirty.sessions.push({id:'RUNNING',job:'12025',emp:'EMP001',start:at-5000});
assert.equal(run(manager,repeat,dirty).code,'reopen_work_not_complete');
dirty=copy(initial);dirty.jobs[0].mechanicalDelivery={revision:1};
assert.equal(run(manager,additional,dirty).code,'mechanical_reopen_requires_separate_workflow');

const created=run(manager,additional);
assert.equal(created.ok,true);
const d=created.data,j=d.jobs[0];
assert.equal(j.no,'12025','new work stays on original Job Card');
assert.equal(j.delivered,false,'delivered JC is returned to workshop');
assert.equal(j.status,'Open');
assert.equal(j.qcPassed,false);
assert.equal(j.qcWorkflow.revision,9);
assert.equal(j.workReopenAudit.length,1);
assert.equal(j.workReopenAudit[0].operation,'REOPEN_ADDITIONAL');
assert.equal(d.assign.length,2);
const a=d.assign.at(-1);
assert.equal(a.id,additional.requestId);
assert.equal(a.emp,'EMP002');
assert.equal(a.suggested,480,'8 hours equals 480 suggested minutes');
assert.equal(a.completed,false);
assert.equal(a.rework,false,'additional work must not be categorized as repeat');
assert.equal(a.additionalWork,true);
assert.equal(d.reopenLogs.length,1);
assert.equal(d.reworkLogs.length,0,'additional work must not impose mistake/repeat penalty');
assert.equal(qcStatus(d,j).stage,'WORK_PENDING','QC is blocked until new work finishes');
for(const field of ['sessions','spareParts','consumables'])assert.deepEqual(d[field],initial[field],field+' preserved');
for(const field of ['finalInvoiceAmount','invoiceDate','insuranceLpo','partsInvoice'])assert.deepEqual(j[field],initial.jobs[0][field],field+' preserved');
const replay=run(manager,additional,d);
assert.equal(replay.ok,true);
assert.equal(replay.duplicate,true,'same request ID is idempotent');
assert.equal(replay.data.assign.length,2,'duplicate never creates another assignment');
assert.equal(replay.data.jobs[0].workReopenAudit.length,1);
assert.equal(run(manager,{...additional,minutes:600},d).code,'reopen_request_reused','mutated request ID rejected');
assert.equal(run(manager,{...additional,requestId:'jr-33333333-3333-4333-8333-333333333333',expectedQcRevision:9},d).code,'reopen_work_not_complete');

const repeated=run(manager,repeat);
assert.equal(repeated.ok,true);
const x=repeated.data.assign.at(-1);
assert.equal(x.job,'12025');
assert.equal(x.rework,true);
assert.equal(x.additionalWork,undefined);
assert.equal(x.mistakeEmp,'EMP001');
assert.equal(x.repeatSameEmployee,false);
assert.equal(x.suggested,300);
assert.equal(x.repeatCycleNo,1);
assert.equal(repeated.data.reworkLogs.length,1);
assert.equal(repeated.data.reopenLogs.length,0);
assert.equal(qcStatus(repeated.data,repeated.data.jobs[0]).stage,'WORK_PENDING');
assert.equal(run(manager,repeat,repeated.data).duplicate,true);
assert.deepEqual(initial.assign,[{id:'ASSIGN-A',job:'12025',emp:'EMP001',suggested:240,completed:true,completedAt:at-172800000,rework:false}],
 'Pure server rules must not mutate input');

const managerHtml=read('app/src/main/assets/offline_test.html'),client=read('app/src/main/assets/qc_delivery.js');
assert.match(managerHtml,/zukaitManagerOpenWorkAction/,'Manager View JC has separate actions');
assert.match(managerHtml,/REOPEN — ADDITIONAL WORK/);
assert.match(managerHtml,/REPEAT WORK — QUALITY/);
assert.match(client,/window\.zukaitManagerOpenWorkAction=function/,'Client defines Manager handler');
assert.match(client,/window\.zukaitManagerSaveWorkAction=async function/,'Client defines Manager submit');
assert.match(client,/REOPEN_ADDITIONAL/);
assert.match(client,/REOPEN_REPEAT/);
assert.match(client,/expectedQcRevision/);
console.log('PASS V377 Manager additional/repeat cycles: permissions, idempotency, 8-hour allocation, QC reset, original JC, financial/material preservation, and distinct app actions');
