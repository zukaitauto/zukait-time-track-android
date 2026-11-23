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

const ts=api.slice(api.indexOf('function estimateDraftDeleteTransition('),api.indexOf('function preserveEstimateHistory(')).replace(/:\s*(any|boolean|number)/g,'');
const remove=vm.runInNewContext(ts+'\nestimateDraftDeleteTransition',{cloneValue:structuredClone});
const request={estimate_id:'D1',request_id:'10000000-0000-4000-8000-000000000001'};
const allocation={created_by:'R1',estimate_no:'Zi-Qt099'};
const initial={estimates:[{id:'D1',status:'Draft',createdBy:'R1',revision:0}],estimateAudit:[]};
for(const role of ['Manager','Supervisor','Receptionist']){
 const deleted=remove(initial,allocation,false,{id:'R1',role},request,1000);
 assert.equal(deleted.ok,true);assert.equal(deleted.data.estimates.length,0);assert.equal(deleted.data.estimateDraftDeletes.length,1);
 assert.equal(remove(deleted.data,allocation,false,{id:'R1',role},request,2000).duplicate,true);
 const replay=guard({estimates:structuredClone(initial.estimates),estimateDraftDeletes:[]},deleted.data);
 assert.equal(replay.estimates.length,0,'Stale device must not revive a deleted draft');
}
assert.equal(remove(initial,allocation,false,{id:'OTHER',role:'Receptionist'},request,1000).ok,false);
assert.equal(remove(initial,allocation,false,{id:'E',role:'Employee'},request,1000).ok,false);
assert.equal(remove({...initial,estimates:[{id:'D1',status:'Saved',createdBy:'R1'}]},allocation,false,{id:'M',role:'Manager'},request,1000).ok,false);
assert.equal(remove(initial,allocation,true,{id:'M',role:'Manager'},request,1000).ok,false);
const forged=guard({estimates:[],estimateDraftDeletes:[{estimateId:'E15'}]},current);assert.equal(forged.estimates.length,1,'Client cannot forge server tombstones');
console.log('PASS: draft deletion role ownership, idempotency, saved/linked protection and stale-device tombstones');
