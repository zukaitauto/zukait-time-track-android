import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {qcWork, qcTransition} from '../supabase/functions/workshop-api/qc_delivery_rules.js';
import {receptionistDeliveryList, receptionistDeliveryTransition} from '../supabase/functions/workshop-api/receptionist_delivery_rules.js';
const user={id:'QA-RC',name:'QA Receptionist',role:'Receptionist'};
const initial={users:[{id:'QA-EMP',role:'Employee'}],jobs:[{no:'QA-JC',receptionNo:'RC-QA',reg:'QA123',vehicle:'Toyota Camry',status:'Open',jobType:'INSURANCE',amount:999}],
 assign:[{id:'QA-A',job:'QA-JC',emp:'QA-EMP',completed:true,completedAt:10}],
 sessions:[{id:'QA-S',job:'QA-JC',emp:'QA-EMP',start:1,end:10}],
 expenses:[{id:'QA-E',amount:999}],consumables:[{id:'QA-C',amount:999}],parts:[{id:'QA-P',qty:2}]};
initial.jobs[0].qcWorkflow={revision:2,fingerprint:qcWork(initial,'QA-JC').fingerprint,painting:{result:'PASS'},final:{result:'PASS'},history:[]};
const body={action:'receptionist_deliver',operation:'DELIVER',jobCard:'QA-JC',expectedQcRevision:2,request_id:randomUUID()};
const snapshot=structuredClone(initial);
const result=receptionistDeliveryTransition(initial,user,body,100);
assert.equal(result.ok,true);assert.equal(result.job.delivered,true);assert.equal(result.job.deliveredBy,user.id);
assert.deepEqual(initial,snapshot);
for(const field of ['assign','sessions','expenses','consumables','parts'])assert.deepEqual(result.data[field],initial[field]);
assert.equal(result.job.amount,999);assert.equal(result.job.receptionLocation,undefined);
assert.equal(result.job.deliveryAudit.length,1);
assert.equal(result.job.deliveryAudit[0].request_id,body.request_id);
assert.equal(result.job.qcWorkflow.history.length,1);
const duplicate=receptionistDeliveryTransition(result.data,user,JSON.parse(JSON.stringify(body)),200);
assert.equal(duplicate.ok,true);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.data,undefined);
assert.equal(duplicate.job.deliveredAt,100);
assert.equal(receptionistDeliveryTransition(result.data,{...user,id:'QA-RC2'},body,200).code,'receptionist_request_conflict');
assert.equal(receptionistDeliveryTransition(result.data,user,{...body,expectedQcRevision:3},200).code,'receptionist_request_conflict');
assert.equal(receptionistDeliveryTransition(result.data,user,{...body,jobCard:'OTHER'},200).code,'receptionist_request_conflict');
assert.equal(receptionistDeliveryTransition(result.data,user,{...body,request_id:randomUUID(),expectedQcRevision:3},200).code,'already_delivered');
for(const extra of [{amount:0},{invoiceDate:'2026-10-09'},{finalInvoiceAmount:0},{role:'Supervisor'}])assert.equal(receptionistDeliveryTransition(initial,user,{...body,...extra},100).ok,false);
for(const operation of ['PAINTING_QC','FINAL_QC','FINAL_INVOICE_ENTRY','FINAL_INVOICE_CORRECTION','DELIVERY_DATE_CORRECTION','CASH_AMOUNT_UPDATE']) {
 assert.equal(receptionistDeliveryTransition(initial,user,{...body,operation},100).ok,false);
 assert.equal(qcTransition(initial,user,{...body,operation,amount:10,result:'PASS'},100).ok,false);
}
assert.equal(receptionistDeliveryTransition(initial,{...user,role:'Manager'},body,100).ok,false);
assert.equal(receptionistDeliveryTransition(initial,user,{...body,request_id:'bad'},100).ok,false);
assert.equal(receptionistDeliveryTransition(initial,user,{...body,expectedQcRevision:1},100).code,'qc_conflict');
for(const mutate of [d=>d.assign[0].completed=false,d=>d.sessions[0].end=0,d=>delete d.jobs[0].qcWorkflow.final,
 d=>d.jobs[0].qcWorkflow.final.result='FAIL',d=>d.jobs[0].qcWorkflow.fingerprint='stale',d=>d.jobs[0].cancelled=true,
 d=>d.jobs[0].status='CANCELLED',d=>d.jobs[0].archived=true,d=>d.jobs[0].deleted=true,d=>delete d.jobs[0].receptionNo]){
 const changed=structuredClone(initial);mutate(changed);
 assert.equal(receptionistDeliveryTransition(changed,user,body,100).ok,false);
}
const rows=receptionistDeliveryList({...initial,jobs:[...initial.jobs,{no:'OTHER',amount:999},{...initial.jobs[0],no:'CANCEL',cancelled:true}]});
assert.equal(rows.length,1);assert.equal(rows[0].deliveryReady,true);assert.ok(!JSON.stringify(rows).includes('999'));
assert.equal(qcTransition(initial,{id:'SUP001',name:'QA',role:'Supervisor'},body,100).ok,true);
assert.equal(qcTransition(initial,{id:'SUP002',name:'QA',role:'Supervisor'},{...body,operation:'PAINTING_QC',result:'PASS'},100).ok,true);
console.log('Receptionist delivery: readiness/QC, cancellation, financial denial, exact replay identity, immutable preservation, response privacy and existing Supervisor permissions passed.');
