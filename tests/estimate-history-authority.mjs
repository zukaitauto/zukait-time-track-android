import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const begin=api.indexOf('function preserveEstimateHistory('),end=api.indexOf('function preserveOperationalHistory(',begin);
const code=api.slice(begin,end).replaceAll(': any','').replaceAll(':any','');
const guard=vm.runInNewContext(code+'\npreserveEstimateHistory',{cloneValue:structuredClone});
const current={estimates:[{id:'E15',estimateNo:'Zi-Qt015',status:'Saved',revision:2,lsRows:[{amount:150}]}],estimateAudit:[{id:'A15'}]};
for(const candidate of [{estimates:[]},{},{estimates:[{id:'E15',status:'Draft',revision:3}]},{estimates:[{id:'E15',status:'Saved',revision:1}]}]){
const next=guard(candidate,structuredClone(current));assert.equal(JSON.stringify(next.estimates),JSON.stringify(current.estimates));assert.equal(JSON.stringify(next.estimateAudit),JSON.stringify(current.estimateAudit));}
const next=guard({estimates:[{id:'E15',status:'Saved',revision:3,lsRows:[{amount:200}]},{id:'E16',status:'Saved'}],estimateAudit:[{id:'A16'}]},current);
assert.equal(next.estimates.length,2);assert.equal(next.estimates[0].lsRows[0].amount,200);assert.equal(next.estimateAudit.length,2);
assert.ok(api.includes('candidate = preserveEstimateHistory(candidate, current.data);'));
console.log('PASS: stale/empty saves cannot remove saved estimates or audit, downgrade drafts or replace newer revisions');
