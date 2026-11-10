import assert from 'node:assert/strict';
import test from 'node:test';
import {accountantApi} from '../supabase/functions/workshop-api/accountant/api.js';

const now=Date.parse('2026-11-10T09:00:00Z');
const job=(no,jobType,invoiceDate,amount,reg)=>({
 no,jobType,invoiceDate,finalInvoiceAmount:amount,reg,
 vehicle:'Toyota Land Cruiser',customerName:'Customer '+no
});
const ctx={revision:7,finance_revision:2,state:{
 jobs:[
  job('C100','CASH','2026-11-05',100,'44211 W'),
  job('C200','CASH','2026-11-06',60,'22951-W'),
  job('C300','CASH','2026-10-08',40,'11886-W'),
  job('I400','INSURANCE','2026-11-05',500,'22111-W'),
  {no:'C500',jobType:'CASH',finalInvoiceAmount:200,reg:'55999 W'},
 ],users:[],sessions:[],consumables:{},paintPurchasing:{}
 },events:[],entries:[
  {id:'receipt-1',kind:'CASH_IN',job_card:'C200',amount:60,transaction_date:'2026-11-01',payee:'Deposit'}
 ]};
const admin={rpc:async(name)=>{assert.equal(name,'zukait_accountant_context');return {data:ctx,error:null}}};
async function fetchReport(report,filters={},offset=0,limit=25,context=ctx){
 const backend={rpc:async()=>({data:context,error:null})};
 const r=await accountantApi(backend,{id:'MGR001',role:'Manager'},
  {action:'accountant_report',report,filters,offset,limit},'test-key-not-live',now);
 assert.equal(r.status,200,JSON.stringify(r.body));
 return r.body;
}

test('Cash Invoices default to Oman current month, exclude Credit/Insurance/no final invoice',async()=>{
 const r=await fetchReport('cash_invoices');
 assert.equal(r.period_month,'2026-11');
 assert.deepEqual(r.rows.map(x=>x.job_card),['C200','C100']);
 assert.equal(r.total_count,2);
 assert.equal(r.invoice_count,2);
 assert.equal(r.invoice_total_omr,160);
 assert.equal(r.rows[0].registration,'22951-W');
 assert.equal(r.rows[0].invoice_amount_omr,60);
 assert.ok(r.rows.every(x=>!('payment_method' in x)),'invoice cannot invent a payment method');
 assert.equal(r.rows[0].customer,'Customer C200');
});
test('Invoice fully covered by a deposit remains in invoice register; legacy ledger is separate',async()=>{
 const invoices=await fetchReport('cash_invoices',{month:'2026-11'});
 assert.ok(invoices.rows.some(x=>x.job_card==='C200'));
 const ledger=await fetchReport('cash',{month:'2026-11'});
 assert.ok(ledger.rows.some(x=>x.id==='receipt-1'),'the receipt ledger retains real payment entries');
 assert.ok(invoices.rows.every(x=>!('kind' in x)),'invoice register does not mix manual cash entries');
});
test('Date filters and registration search work independently of the default month',async()=>{
 const october=await fetchReport('cash_invoices',{from:'2026-10-01',to:'2026-10-31'});
 assert.equal(october.period_month,'');
 assert.deepEqual(october.rows.map(x=>x.job_card),['C300']);
 assert.equal(october.invoice_total_omr,40);
 const selected=await fetchReport('cash_invoices',{month:'2026-11',query:'22951 W'});
 assert.deepEqual(selected.rows.map(x=>x.job_card),['C200']);
 assert.equal(selected.invoice_total_omr,60);
});
test('Invoice total includes all matching rows, even when server sends one page',async()=>{
 const context=structuredClone(ctx);
 for(let i=0;i<25;i++)context.state.jobs.push(job('EX'+i,'CASH','2026-11-07',1,'XY'+i));
 const first=await fetchReport('cash_invoices',{month:'2026-11'},0,25,context);
 const second=await fetchReport('cash_invoices',{month:'2026-11'},25,25,context);
 assert.equal(first.total_count,27);assert.equal(first.rows.length,25);assert.equal(second.rows.length,2);
 assert.equal(first.invoice_total_omr,185);assert.equal(second.invoice_total_omr,185);
 assert.equal(first.next_offset,25);assert.equal(second.next_offset,null);
});

test('Accounts KPI uses this month CASH invoice amount rather than all-time receipt amount',async()=>{
 const r=await fetchReport('cash_invoices');
 assert.equal(r.summary.cash_invoice_current_month.amount_omr,160);
 assert.equal(r.summary.cash_invoice_current_month.records,2);
 assert.equal(r.summary.cash_invoice_current_month.month,'2026-11');
 const adminStub={rpc:async()=>({data:ctx,error:null})};
 const home=await accountantApi(adminStub,{id:'MGR001',role:'Manager'},
  {action:'accountant_dashboard',report:'jobs',limit:1},'test-key-not-live',now);
 assert.equal(home.status,200);
 assert.equal(home.body.summary.cash_invoice_current_month.amount_omr,160);
 assert.equal(home.body.summary.cash_in.amount_omr,200,'all-time receipt summary deliberately differs from current-month invoice KPI');
});

test('Manual Cash Out entries never appear in the invoice register',async()=>{
 const modified=structuredClone(ctx);
 modified.entries.push({id:'cash-out-1',kind:'CASH_OUT',job_card:'C100',amount:25,transaction_date:'2026-11-04',payee:'Supplier',payment_method:'BANK'});
 const invoices=await fetchReport('cash_invoices',{month:'2026-11'},0,25,modified);
 const ledger=await fetchReport('cash',{month:'2026-11'},0,25,modified);
 assert.equal(invoices.invoice_total_omr,160);
 assert.equal(invoices.rows.length,2);
 assert.ok(ledger.rows.some(row=>row.kind==='CASH_OUT'&&row.id==='cash-out-1'));
 assert.equal(invoices.rows.some(row=>row.id==='cash-out-1'),false);
});
