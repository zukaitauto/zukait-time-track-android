import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {jobEditTransition,jobEditProjection,preserveJobEditAuthority,optionalJobAmount} from '../supabase/functions/workshop-api/job_edit_rules.js';
import {preserveQcAuthority,qcTransition} from '../supabase/functions/workshop-api/qc_delivery_rules.js';
const clone=structuredClone;
const initial={jobs:[{no:'JC1',make:'Toyota',model:'Camry',reg:'123',jobType:'Credit',amount:null,notes:''}],assign:[{id:'a',job:'JC1',emp:'e',completed:true}],sessions:[],consumables:{actuals:[{id:'material'}]}};
const request={jobCard:'JC1',expectedEditRevision:0,patch:{amount:'12.345',notes:'Customer estimate'},reason:'Agreed initial amount'};
for(const role of ['Manager','Supervisor','Receptionist']){
 const actor={id:'u',role},r=jobEditTransition(initial,actor,request,1);assert.equal(r.ok,true);assert.equal(r.job.amount,12.345);assert.equal(r.job.editRevision,1);assert.deepEqual(r.data.assign,initial.assign);assert.deepEqual(r.data.consumables,initial.consumables);assert.deepEqual(initial.jobs[0].amount,null);
 assert.equal(jobEditTransition(r.data,actor,request,2).code,'job_edit_conflict');
 const stale=clone(initial);preserveJobEditAuthority(stale,r.data,actor);assert.equal(stale.jobs[0].amount,12.345);
 const delivered=clone(initial);delivered.jobs[0].delivered=true;delivered.jobs[0].status='Delivered';
 const d=jobEditTransition(delivered,actor,request,2);assert.equal(d.ok,role==='Manager');if(role!=='Manager')assert.equal(d.code,'job_edit_manager_required');
 const forged=clone(delivered);forged.jobs[0].delivered=false;forged.jobs[0].model='Forged';forged.jobs[0].amount=1;
 preserveJobEditAuthority(forged,delivered,actor);if(role!=='Manager'){assert.equal(forged.jobs[0].delivered,true);assert.equal(forged.jobs[0].model,'Camry');assert.equal(forged.jobs[0].amount,null);}
 for(const amount of ['',null,0,'0','1000000','1.001'])assert.equal(jobEditTransition(initial,actor,{...request,patch:{amount}},1).ok,true);
 for(const amount of [-1,'1e3','NaN',Infinity,1000001,'0.0001',{},true])assert.equal(jobEditTransition(initial,actor,{...request,patch:{amount}},1).code,'job_edit_invalid_amount');
}
for(const role of ['Employee','Purchaser','Denter'])assert.equal(jobEditTransition(initial,{id:'u',role},request,1).code,'job_edit_forbidden');
const linked=clone(initial);linked.jobs[0].receptionNo='RC1';
assert.equal(jobEditTransition(linked,{id:'u',role:'Supervisor'},{...request,patch:{model:'Corolla'}},1).code,'job_edit_linked_identity');
assert.equal(jobEditTransition(linked,{id:'u',role:'Receptionist'},request,1).ok,true);
for(const type of ['Cash','Credit','Insurance']){
 const invoiced=clone(initial);Object.assign(invoiced.jobs[0],{jobType:type,amount:20,finalInvoiceAmount:20,invoiceDate:'2026-10-11',financialAudit:[]});
 assert.equal(jobEditTransition(invoiced,{id:'u',role:'Manager'},request,1).code,'job_edit_invoice_authoritative');
 const stale=clone(invoiced);stale.jobs[0].amount=1;preserveJobEditAuthority(stale,invoiced,{id:'u',role:'Manager'});preserveQcAuthority(stale,invoiced,{id:'u',role:'Manager'});assert.equal(stale.jobs[0].amount,20);
}
assert.equal(optionalJobAmount('1.001').value,1.001);
const dom=new JSDOM('<div id="modal"></div>',{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;
let data=clone(initial),calls=[],messages=[];w.me={id:'u',role:'Receptionist'};w.zukaitAuth={getToken:()=> 'qa'};w.openModal=h=>w.document.getElementById('modal').innerHTML=h;w.closeModal=()=>{};w.alert=m=>messages.push(m);w.zukaitReceptionDashboard={showJobs:async()=>{}};
w.fetch=async(_url,args)=>{const body=JSON.parse(args.body);calls.push(body);const r=body.operation==='GET'?{ok:true,job:jobEditProjection(data.jobs[0]),invoice_locked:data.jobs[0].finalInvoiceAmount!=null}:jobEditTransition(data,w.me,body,1);if(r.data)data=r.data;return {ok:r.ok,json:async()=>r};};
w.eval(fs.readFileSync('app/src/main/assets/job_card_edit.js','utf8'));
await w.zukaitJobEdit.open('JC1');assert.match(w.document.body.innerHTML,/Cash Amount/);w.document.getElementById('jce-amount').value='30.125';w.document.getElementById('jce-reason').value='Customer agreed';await w.zukaitJobEdit.save();assert.equal(data.jobs[0].amount,30.125);assert.equal(calls.at(-1).action,'job_card_edit');
data.jobs[0].delivered=true;await w.zukaitJobEdit.open('JC1');assert.match(messages.at(-1),/Only Manager/);
w.me.role='Manager';data.jobs[0].finalInvoiceAmount=30.125;await w.zukaitJobEdit.open('JC1');assert.equal(w.document.getElementById('jce-amount').readOnly,true);
dom.window.close();console.log('Job Card edit: server role matrix, delivered/stale/forged writes, optional amounts, linked identity, invoice locks, preserved work, and Reception UI passed.');

// The Manager page can edit linked identity, the creation date, allocated time,
// and finalized amount together while preserving actual sessions and QC results.
const fullData=clone(initial);Object.assign(fullData.jobs[0],{receptionNo:'RC-FULL',delivered:true,createdAt:1000,finalInvoiceAmount:20,amount:20,invoiceDate:'2026-10-11',qcWorkflow:{revision:3,painting:{result:'PASS'},history:[]}});fullData.assign[0].suggested=60;
const fullRequest={...request,operation:'FULL_EDIT',expectedJob:clone(fullData.jobs[0]),expectedAssignments:[{id:'a',suggested:60}],patch:{model:'Corolla',createdAt:2000,amount:30.125},allocations:[{id:'a',minutes:90}]};
const fullResult=jobEditTransition(fullData,{id:'m',role:'Manager'},fullRequest,100);
assert.equal(fullResult.ok,true);assert.equal(fullResult.job.model,'Corolla');assert.equal(fullResult.job.createdAt,2000);assert.equal(fullResult.job.amount,30.125);assert.equal(fullResult.job.finalInvoiceAmount,30.125);assert.equal(fullResult.job.invoiceAmount,30.125);assert.equal(fullResult.job.invoiceDate,'2026-10-11');assert.equal(fullResult.job.financialAudit[0].reason,fullRequest.reason);assert.deepEqual(fullResult.job.qcWorkflow.painting,fullData.jobs[0].qcWorkflow.painting);assert.equal(fullResult.data.assign[0].suggested,90);assert.deepEqual(fullResult.data.sessions,fullData.sessions);assert.equal(fullData.assign[0].suggested,60);
assert.equal(jobEditTransition(fullData,{id:'m',role:'Manager'},{...fullRequest,expectedJob:{...fullRequest.expectedJob,model:'Changed'}},100).code,'job_edit_conflict');
assert.equal(jobEditTransition(fullData,{id:'m',role:'Manager'},{...fullRequest,allocations:[{id:'other',minutes:90}]},100).code,'job_edit_invalid_fields');
assert.equal(jobEditTransition(fullData,{id:'m',role:'Manager'},{...fullRequest,expectedAssignments:[]},100).code,'job_edit_conflict');
console.log('Manager full server edit: linked identity, creation date, final-invoice synchronization, allocation audit, work/QC preservation, stale snapshot and forged allocations passed.');
