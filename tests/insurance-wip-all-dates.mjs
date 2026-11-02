import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {insuranceProjection} from '../supabase/functions/workshop-api/insurance_management_rules.js';
import {qcWork,qcStatus} from '../supabase/functions/workshop-api/qc_delivery_rules.js';

const october=Date.parse('2026-10-15T10:00:00+04:00'),november=Date.parse('2026-11-02T10:00:00+04:00');
const data={jobs:[
 {no:'JC-OCT',jobType:'Insurance',createdAt:october,insuranceCompany:'Liva Insurance'},
 {no:'JC-NOV',jobType:'Insurance',createdAt:november,insuranceCompany:'Liva Insurance'},
 {no:'JC-DONE',jobType:'Insurance',createdAt:october,delivered:true,deliveredAt:november,insuranceCompany:'Liva Insurance'},
 {no:'JC-CASH',jobType:'Cash',createdAt:october},
 ],assign:[{id:'A1',job:'JC-OCT',emp:'EMP1',completed:true,completedAt:october+600000}],sessions:[]};
const ready=data.jobs[0];ready.qcWorkflow={fingerprint:qcWork(data,ready.no).fingerprint,painting:{result:'PASS'},final:{result:'PASS'}};
assert.equal(qcStatus(data,ready).deliveryReady,true,'Fixture must represent a QC-ready undelivered vehicle');
const all=insuranceProjection(data,[],{section:'wip',month:''});
assert.equal(all.ok,true);
assert.deepEqual(all.rows.map(x=>x.job_card),['JC-NOV','JC-OCT'],'All WIP includes prior-month and QC-ready undelivered Insurance Job Cards');
assert.equal(all.summary.wip_count,2,'Summary is all active insurance JCs');
const month=insuranceProjection(data,[],{section:'wip',month:'2026-11'});
assert.deepEqual(month.rows.map(x=>x.job_card),['JC-NOV']);
const dates=insuranceProjection(data,[],{section:'wip',month:'2026-11',from:'2026-10-01',to:'2026-10-31'});
assert.deepEqual(dates.rows.map(x=>x.job_card),['JC-OCT'],'Advanced period overrides month on WIP');
const source=fs.readFileSync('app/src/main/assets/insurance_management.js','utf8');
new vm.Script(source,{filename:'insurance_management.js'});
assert.ok(source.includes("section==='pending'||section==='approval'||section==='wip'"),'Clicking WIP clears month and date range for all-dates default');
assert.ok(source.includes("if(section==='pending'||section==='approval'||section==='wip'){filters.month='';filters.from='';filters.to='';}"));
console.log('PASS: All-dates insurance WIP includes older jobs, QC-ready jobs, optional month and date-range override');
