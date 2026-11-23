import fs from 'node:fs';import assert from 'node:assert/strict';
const src=fs.readFileSync('supabase/functions/workshop-api/job_type_authority.js','utf8');
const {preserveJobTypeAuthority:protect}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const current={jobs:[{no:'12026',jobType:'Cash',delivered:true,deliveredAt:1791037442066,finalInvoiceAmount:200}],jobTypeAudit:[{job:'12026',to:'Cash',at:1}]};
for(const role of ['Manager','Supervisor','Purchaser','Employee']){const r=protect({jobs:[{no:'12026',delivered:true}]},current,{id:'u',role});assert.equal(r.jobs[0].jobType,'Cash');assert.deepEqual(r.jobTypeAudit,current.jobTypeAudit);}
const change={job:'12026',from:'Cash',to:'Insurance',by:'u',reason:'Correct job type',at:2};
let r=protect({jobs:[{no:'12026',jobType:'Insurance',insuranceCompany:'Insurer'}],jobTypeAudit:[change]},current,{id:'u',role:'Manager'});assert.equal(r.jobs[0].jobType,'Insurance');
r=protect({jobs:[{no:'12026',jobType:'Credit'}]},current,{id:'u',role:'Manager'});assert.equal(r.jobs[0].jobType,'Cash');
r=protect({jobs:[{no:'12026',jobType:'Insurance'}],jobTypeAudit:[change]},current,{id:'u',role:'Purchaser'});assert.equal(r.jobs[0].jobType,'Cash');
assert.equal(current.jobs[0].finalInvoiceAmount,200);console.log('Job classification survives stale saves; authorized reasoned correction remains available');
