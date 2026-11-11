import assert from 'node:assert/strict';
import {financialReport} from '../supabase/functions/workshop-api/accountant/finance_rules.js';
import {managerProfitReport} from '../supabase/functions/workshop-api/accountant/profit_performance.js';
import {accountsPerformanceReport,accountsLeaveReport} from '../supabase/functions/workshop-api/accountant/accounts_reports.js';
import {accountantApi} from '../supabase/functions/workshop-api/accountant/api.js';
import {fixture} from './accountant-finance.mjs';

const now=Date.parse('2026-11-11T08:00:00Z'),month={month:'2026-10'},c=fixture();
c.state.jobs[1].delivered=false;
c.state.jobs.push(
 {no:'J3',jobType:'CREDIT',vehicle:'Nissan',customerName:'Credit Partner',finalInvoiceAmount:80,invoiceDate:'2026-10-02'},
 {no:'J4',jobType:'CORPORATE',vehicle:'Honda',customerName:'Corporate Client',companyName:'Corporate Client',finalInvoiceAmount:90,invoiceDate:'2026-10-03'}
);
c.state.sublets=[{id:'SUB-1',jobCard:'J1',amountMills:20000,supplier:'Supplier A',description:'External repair'}];
c.state.leaves.push({id:'L2',emp:'E',date:'2026-10-02',period:'FULL',cancelled:true,by:'Manager',cancelledBy:'Manager',cancelReason:'Corrected'});
const baseline=JSON.stringify(c);
let full=financialReport(c,{},now);
const managerCash=managerProfitReport(c,full,month,now).rows.filter(r=>r.kind==='CASH');
let report=accountsPerformanceReport(c,full,month,now);
assert.deepEqual(report.rows.filter(r=>r.kind==='CASH').map(r=>r.amount_omr),managerCash.map(r=>r.amount_omr),'Cash report must match Manager source and amounts');
assert.equal(report.rows.some(r=>r.kind==='INSURANCE'),false,'an LPO alone never qualifies an undelivered Insurance vehicle');
assert.deepEqual(new Set(report.rows.map(r=>r.kind)),new Set(['CASH','CREDIT','CORPORATE']));
assert.equal(report.summary.revenue_omr,320,'Cash plus Credit plus Corporate invoiced amounts are counted once');
assert.equal(report.rows.find(r=>r.job_card==='J1').sublet_cost_omr,'20.000');
assert.equal(report.rows.find(r=>r.job_card==='J1').total_job_cost_omr,'57.500');
assert.equal(report.summary.total_cost_omr,null,'an unresolved job cost never becomes an assumed zero');
assert.equal(report.summary.profit_omr,null);
assert.equal(report.rows.find(r=>r.job_card==='J3').kind,'CREDIT');
assert.equal(accountsPerformanceReport(c,full,{...month,kind:'CREDIT',customer:'Credit Partner'},now).rows.length,1);
assert.equal(accountsPerformanceReport(c,full,{...month,kind:'CORPORATE',customer:'Corporate Client'},now).rows.length,1);
assert.equal(accountsPerformanceReport(c,full,{...month,kind:'INSURANCE'},now).rows.length,0);
assert.equal(accountsPerformanceReport(c,full,{...month,kind:'CASH'},now).rows.length,1);
assert.equal(accountsPerformanceReport(c,full,{from:'2026-10-01',to:'2026-10-01'},now).rows.length,1,'custom periods override current month');

c.state.jobs[1].delivered=true;
full=financialReport(c,{},now);
report=accountsPerformanceReport(c,full,month,now);
assert.equal(report.rows.filter(r=>r.kind==='INSURANCE').length,1,'delivered insurance with entered LPO is included');
assert.equal(report.summary.revenue_omr,420);
assert.equal(accountsPerformanceReport(c,full,{...month,kind:'INSURANCE',insurance:'Liva'},now).rows.length,1);
assert.equal(accountsPerformanceReport(c,full,{...month,kind:'INSURANCE',insurance:'Other'},now).rows.length,0);
assert.deepEqual(report.facets.insurance,['Liva']);
assert.equal(report.rows.find(r=>r.kind==='INSURANCE').insurance_company,'Liva');

const leaveActive=accountsLeaveReport(full,{status:'active'});
assert.equal(leaveActive.rows.length,1);
assert.equal(leaveActive.summary.leave_total_days,.5);
const leaveAll=accountsLeaveReport(full,{status:'all'});
assert.equal(leaveAll.rows.length,2);
assert.equal(leaveAll.rows.some(r=>r.cancelled&&r.cancel_reason==='Corrected'),true);
assert.equal(accountsLeaveReport(full,{status:'cancelled'}).rows.length,1);
assert.equal(accountsLeaveReport(full,{status:'active',employee:'OTHER'}).rows.length,0);

let readCount=0;
const admin={rpc:async(name)=>{assert.equal(name,'zukait_accountant_context');readCount++;return {data:c,error:null};}};
const accountant={id:'A',role:'Accountant'},manager={id:'M',role:'Manager'};
const request={action:'accountant_report',report:'accounts_performance',filters:month,offset:0,limit:2};
const response=await accountantApi(admin,accountant,request,'qa',now);
assert.equal(response.status,200);assert.equal(response.body.rows.length,2);
assert.equal(response.body.total_count,4);assert.equal(response.body.next_offset,2);
assert.equal(response.body.summary.revenue_omr,420,'pagination cannot change totals');
assert.equal((await accountantApi(admin,accountant,{...request,filters:{...month,kind:'INVALID'}},'qa',now)).status,400);
assert.equal((await accountantApi(admin,{id:'S',role:'Supervisor'},request,'qa',now)).status,403);
const insurance=await accountantApi(admin,accountant,{...request,filters:{...month,kind:'INSURANCE',insurance:'Liva'}},'qa',now);
assert.equal(insurance.body.rows.length,1);
const leave=await accountantApi(admin,accountant,{action:'accountant_report',report:'accounts_leave',filters:{status:'all'}},'qa',now);
assert.equal(leave.body.rows.length,2);
const details=await accountantApi(admin,manager,{action:'accountant_jc_detail',job_card:'J1'},'qa',now);
assert.equal(details.status,200);
assert.equal(details.body.detail.job_total_cost_omr,57.5);
assert.equal(details.body.breakdown.sublet[0].cost_omr,20);
assert.equal(details.body.breakdown.labour.length,1);
assert.equal((await accountantApi(admin,accountant,{action:'accountant_report',report:'manager_profit',filters:month},'qa',now)).status,403,'legacy Manager financial access remains Manager only');
assert.ok(readCount>0);
assert.equal(JSON.stringify(c),baseline.replace('"delivered":false','"delivered":true'),'the only state change is the explicit synthetic delivery flag');
console.log('Accounts five-option read-only projection: Manager cash parity, delivered insurance gate, credit/corporate, cost pending, sublet, leave history, PDF source fields, pagination and role security PASS');
