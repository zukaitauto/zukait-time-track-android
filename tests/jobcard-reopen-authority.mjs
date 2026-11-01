import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=path=>fs.readFileSync(path,'utf8');
const server=read('supabase/functions/workshop-api/qc_delivery_rules.js');
assert.equal(server,read('app/src/main/assets/qc_delivery_rules.js'),'Server and Android/Web QC rules match');
const {qcTransition,qcStatus,preserveQcAuthority}=await import('data:text/javascript;base64,'+Buffer.from(server).toString('base64'));
const clone=v=>JSON.parse(JSON.stringify(v)),now=Date.parse('2026-11-01T09:00:00+04:00');
const actor={id:'MGR001',name:'Manager',role:'Manager'},supervisor={id:'SUP001',name:'Shine',role:'Supervisor'};
const job={no:'12069',jobType:'Insurance',department:'Bodyshop',status:'Delivered',delivered:true,
 deliveredAt:now-86400000,deliveredBy:'SUP001',deliveredByName:'Shine',qcPassed:true,
 finalInvoiceAmount:230,amount:230,invoiceDate:'2026-10-31',insuranceLpo:{amount:230,receivedDate:'2026-10-31'},
 qcWorkflow:{revision:8,fingerprint:'old',painting:{result:'PASS'},final:{result:'PASS'},history:[{operation:'DELIVER',by:'SUP001'}]},
 deliveryAudit:[{operation:'DELIVERY_DATE_CORRECTION',reason:'Date corrected'}]};
const baseline={jobs:[job],assign:[{id:'A1',job:'12069',emp:'EMP001',suggested:180,completed:true,completedAt:now-2*86400000}],
 sessions:[{id:'S1',assignmentId:'A1',job:'12069',emp:'EMP001',start:now-3*86400000,end:now-3*86400000+3600000}],
 consumables:{issues:[{id:'I1'}]},spareParts:{lists:[{id:'PL1'}]}};
const request=(reason='Further work requested',revision=8)=>({jobCard:'12069',operation:'REOPEN_DELIVERED',reason,expectedQcRevision:revision});
const attempt=(who,req=request(),data=baseline)=>qcTransition(data,who,req,now);
for(const role of [supervisor,{id:'EMP001',role:'Employee'},{id:'RCP001',role:'Receptionist'}])
 assert.equal(attempt(role).code,'manager_required','Delivered reopen requires authenticated Manager');
assert.equal(attempt(actor,request('')).code,'reopen_reason_required');
assert.equal(attempt(actor,request('abc')).code,'reopen_reason_required');
assert.equal(attempt(actor,request('Correct reason',7)).code,'qc_conflict');
assert.equal(attempt(actor,request('A'.repeat(2001))).code,'qc_reason_too_long');
let mechanical=clone(baseline);mechanical.jobs[0].mechanicalDelivery={revision:1};
assert.equal(attempt(actor,request(),mechanical).code,'mechanical_reopen_requires_separate_workflow');
let notDelivered=clone(baseline);notDelivered.jobs[0].delivered=false;
assert.equal(attempt(actor,request(),notDelivered).code,'delivery_required');
assert.deepEqual(baseline.jobs[0],job,'Rejected calls never mutate original snapshot');
const result=attempt(actor);
assert.equal(result.ok,true);
const after=result.data,j=after.jobs[0];
assert.equal(j.no,job.no);
assert.equal(j.delivered,false);
assert.equal(j.status,'Open');
assert.equal(j.deliveredAt,undefined);
assert.equal(j.qcPassed,false);
assert.equal(j.qcWorkflow.revision,9);
assert.equal(j.qcWorkflow.painting,undefined);
assert.equal(j.qcWorkflow.final,undefined);
assert.equal(j.qcWorkflow.fingerprint,undefined);
assert.equal(qcStatus(after,j).deliveryReady,false,'Old QC cannot authorize redelivery');
assert.equal(qcStatus(after,j).stage,'PAINTING_QC');
assert.equal(j.deliveryAudit.length,2);
const entry=j.deliveryAudit.at(-1);
assert.equal(entry.operation,'REOPEN_DELIVERED');
assert.equal(entry.by,actor.id);
assert.equal(entry.reason,'Further work requested');
assert.equal(entry.previousDelivery.at,job.deliveredAt);
assert.equal(entry.previousDelivery.by,job.deliveredBy);
assert.equal(entry.invoiceAtReopen.amount,230);
for(const key of ['finalInvoiceAmount','amount','invoiceDate','insuranceLpo'])
 assert.deepEqual(j[key],job[key],key+' retained');
for(const key of ['assign','sessions','consumables','spareParts'])
 assert.deepEqual(after[key],baseline[key],key+' remains unchanged');
assert.deepEqual(baseline.jobs[0],job,'Server transition is immutable to the caller');
assert.equal(attempt(actor,request('Attempt repeat',9),after).code,'delivery_required','Cannot reopen twice');
const stale=clone(baseline);
stale.jobs[0].delivered=true;
stale.jobs[0].status='Delivered';
stale.jobs[0].qcWorkflow={revision:1,fingerprint:'old'};
stale.jobs[0].deliveryAudit=[];
preserveQcAuthority(stale,after,supervisor);
assert.equal(stale.jobs[0].delivered,false,'Stale phone cannot restore delivered=true after the return');
assert.equal(stale.jobs[0].status,'Open');
assert.deepEqual(stale.jobs[0].deliveryAudit,j.deliveryAudit,'Return audit must survive full-state sync');
assert.deepEqual(stale.jobs[0].qcWorkflow,j.qcWorkflow,'Old QC cannot reappear');
const index=read('supabase/functions/workshop-api/index.ts');
assert.match(index,/deliveredCardIds/,'Delivered assignment modification blocked by current server truth');
assert.match(index,/!deliveredCardIds\.has\(String\(x\?\.job/,'Reopen log denied while server has delivered job');
const details=read('app/src/main/assets/v74_updates.js');
assert.match(details,/REOPEN WORK<\/button>/);
assert.match(details,/REOPEN DELIVERED JC<\/button>/);
assert.match(details,/delivered&&me\.role==='Manager'/,'Delivered reopen button is Manager-only');
assert.match(details,/if\(target\.delivered\|\|String\(target\.status/,'Old reissue button cannot bypass delivered workflow');
assert.match(details,/if\(st==='delivered'\)/,'Older delivered cards can be searched');
const client=read('app/src/main/assets/qc_delivery.js');
assert.match(client,/window\.zukaitReopenDelivered=function/);
assert.match(client,/window\.zukaitConfirmReopenDelivered=async function/);
assert.match(client,/operation:'REOPEN_DELIVERED'/);
assert.match(client,/await window\.zukaitCloud\?\.pull\?\.\(true\)/,'Server snapshot refreshed');
assert.match(client,/expectedQcRevision:Number\(j\.qcWorkflow\?\.revision\|\|0\)/);
console.log('PASS: delivered JC Manager-only return; required reason; QC reset; original invoice, sessions, materials, delivery history protected; UI and full-state guards');


// New Manager View Job Card actions: normal additional work and genuine repeat
// work must remain separate cycles, including for a delivered vehicle.
{
 const doc=clone(baseline);
 doc.users=[{id:'EMP001',name:'Pramod',role:'Employee',active:true},{id:'EMP002',name:'Akhil',role:'Employee',active:true}];
 const req={jobCard:'12069',operation:'REOPEN_ADDITIONAL',employeeId:'EMP002',minutes:480,
   reason:'Customer requested further repairs',expectedQcRevision:8,
   requestId:'jr-12345678-1234-4234-8234-123456789012'};
 const denied=qcTransition(doc,supervisor,req,now);
 assert.equal(denied.code,'manager_required');
 assert.equal(qcTransition(doc,actor,{...req,reason:'x'},now).code,'reopen_reason_required');
 assert.equal(qcTransition(doc,actor,{...req,minutes:0},now).code,'reopen_minutes_required');
 assert.equal(qcTransition(doc,actor,{...req,expectedQcRevision:7},now).code,'qc_conflict');
 const additional=qcTransition(doc,actor,req,now);
 assert.equal(additional.ok,true);
 assert.equal(additional.data.assign.length,2,'new assignment is separate from old work');
 const assignment=additional.data.assign.at(-1);
 assert.equal(assignment.emp,'EMP002');
 assert.equal(assignment.suggested,480);
 assert.equal(assignment.rework,false);
 assert.equal(assignment.additionalWork,true);
 assert.equal(additional.data.jobs[0].status,'Open');
 assert.equal(additional.data.jobs[0].delivered,false);
 assert.equal(additional.data.jobs[0].qcPassed,false);
 assert.equal(additional.data.jobs[0].finalInvoiceAmount,230);
 assert.deepEqual(additional.data.sessions,doc.sessions,'worked sessions preserved');
 assert.deepEqual(additional.data.consumables,doc.consumables,'consumables preserved');
 assert.equal(additional.data.jobs[0].workReopenAudit.length,1);
 assert.equal(additional.data.jobs[0].workReopenAudit[0].operation,'REOPEN_ADDITIONAL');
 assert.equal(qcStatus(additional.data,additional.data.jobs[0]).stage,'WORK_PENDING');
 assert.equal(qcTransition(additional.data,actor,{...req,expectedQcRevision:9},now).duplicate,true,
  'retry with the same request ID is idempotent');
 const oldPhone=clone(doc);oldPhone.jobs[0].workReopenAudit=[];
 preserveQcAuthority(oldPhone,additional.data,supervisor);
 assert.deepEqual(oldPhone.jobs[0].workReopenAudit,additional.data.jobs[0].workReopenAudit,
  'legacy saves cannot remove Manager reopening audit');
 const repeatReq={...req,operation:'REOPEN_REPEAT',employeeId:'EMP002',mistakeEmployeeId:'EMP001'};
 const repeated=qcTransition(doc,actor,repeatReq,now);
 assert.equal(repeated.ok,true);
 assert.equal(repeated.data.assign.at(-1).rework,true);
 assert.equal(repeated.data.assign.at(-1).mistakeEmp,'EMP001');
 assert.equal(repeated.data.assign.at(-1).suggested,480);
 assert.equal(repeated.data.jobs[0].workReopenAudit.at(-1).operation,'REOPEN_REPEAT');
 assert.equal(qcTransition(doc,actor,{...repeatReq,mistakeEmployeeId:'EMP002'},now).code,
  'repeat_responsible_employee_required');
 const active=clone(doc);active.assign[0].completed=false;
 assert.equal(qcTransition(active,actor,req,now).code,'reopen_work_not_complete');
 const managerView=read('app/src/main/assets/offline_test.html');
 assert.match(managerView,/REOPEN — ADDITIONAL WORK/);
 assert.match(managerView,/REOPEN FINISHED WORK/,'Manager Job Card Details exposes eligible finished assignment reopen');
 assert.match(managerView,/REOPEN DELIVERED JC/,'Manager Job Card Details exposes delivered return');
 assert.match(managerView,/v132ReissueJob\(this\.dataset\.jc\)/,'Finished assignment uses existing safe reopen selector');
 assert.match(managerView,/zukaitReopenDelivered\(this\.dataset\.jc\)/,'Delivered return uses Manager-only server-confirmed workflow');
 assert.match(managerView,/REPEAT WORK — QUALITY \/ MISTAKE/);

 assert.match(managerView,/No completed technician assignment is available to reopen/,'Ineligible unfinished JC clearly explains why REOPEN FINISHED WORK is hidden');
 assert.match(managerView,/v68_updates\.js\?v=380-reopen-1/,'Updated Manager search script bypasses stale web/Android cache');
 const searchView=read('app/src/main/assets/v68_updates.js');
 assert.match(searchView,/v68ManagerSearch=function/);
 assert.match(searchView,/onclick=\"window\.zukaitOpenJob360\(/,'Manager JC search selects canonical full detail screen with reopen options');
 assert.match(searchView,/VIEW FULL JC \/ REOPEN OPTIONS/,'Legacy Manager review offers a clear route to reopen actions');
 assert.match(searchView,/window\.zukaitOpenJob360\(this\.dataset\.jc\)/,'Legacy review button targets canonical role-safe JC details');
 assert.doesNotMatch(searchView,/onclick=\"window\.zukaitOpenWorkDetails\(/,'Manager search does not open an alternate detail screen without reopen controls');

 const client=read('app/src/main/assets/qc_delivery.js');
 assert.match(client,/window\.zukaitManagerOpenWorkAction=function/);
 assert.match(client,/window\.zukaitManagerSaveWorkAction=async function/);
 assert.match(client,/REOPEN_ADDITIONAL/);
 assert.match(client,/REOPEN_REPEAT/);
 assert.match(details,/const latestExtra=extra\[extra\.length-1\]/,
   'latest additional work must override older completed repeat cycle');
 const correctionSql=read('scripts/manual_corrections/2026-11-01-JC12025-Soman.sql');
 assert.match(correctionSql,/08:15/);
 assert.match(correctionSql,/OWNER_CONFIRMED_MISTAKEN_WORK/);
 console.log('PASS: Manager additional-vs-repeat work, idempotent server command, QC reset, audit, JC12025 correction script, and View Job Card action wiring');
}
