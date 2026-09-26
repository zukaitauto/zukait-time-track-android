import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const cloud=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');

assert.ok(cloud.includes('state.estimates=state.estimates||[];'),'Cloud shape must include estimates');
assert.ok(cloud.includes('state.estimateAudit=state.estimateAudit||[];'),'Cloud shape must include estimate audit');
assert.ok(cloud.includes('function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}'),'Client conflict merge needs a local equality helper');
assert.ok(api.includes('function threeWayMerge(base: any, remote: any, local: any): any'),'Server must retain three-way merge');

const allowed=api.match(/const allowed = new Set\(\[(.*?)\]\);/s);
assert.ok(allowed,'Employee change allowlist not found');
assert.equal(allowed[1].includes('"estimates"'),false,'Employees must not be able to mutate estimates');
assert.equal(allowed[1].includes('"estimateAudit"'),false,'Employees must not be able to mutate estimate audit');

const start=cloud.indexOf('function same(a,b)');
const end=cloud.indexOf('function reconcileConsumablesDuplicates',start);
assert.ok(start>=0&&end>start,'Unable to isolate production merge functions');
const mergeCode=cloud.slice(start,end)+'\nthis.mergeForTest=threeWayMerge;';
const sandbox={JSON,Map,Set};
vm.createContext(sandbox);
vm.runInContext(mergeCode,sandbox);
const merge=sandbox.mergeForTest;
assert.equal(typeof merge,'function');

const base={
  estimates:[{
    id:'E1',estimateNo:'Zi-Qt001',customerName:'Original',notes:'',
    labourRows:[{id:'L0',description:'Original labour',amount:10}],
    revision:1
  }],
  estimateAudit:[]
};
const manager=JSON.parse(JSON.stringify(base));
manager.estimates[0].customerName='Manager Customer';
manager.estimates[0].labourRows.push({id:'LM',description:'Manager labour',amount:20});
manager.estimates[0].revision=2;
manager.estimateAudit.push({id:'AM',estimateId:'E1',by:'MANAGER',action:'EDIT'});

const supervisor=JSON.parse(JSON.stringify(base));
supervisor.estimates[0].notes='Supervisor note';
supervisor.estimates[0].labourRows.push({id:'LS',description:'Supervisor labour',amount:30});
supervisor.estimates[0].revision=2;
supervisor.estimateAudit.push({id:'AS',estimateId:'E1',by:'SUPERVISOR',action:'EDIT'});

const merged=merge(base,manager,supervisor);
assert.equal(merged.estimates.length,1);
assert.equal(merged.estimates[0].customerName,'Manager Customer','Manager field change must survive Supervisor sync');
assert.equal(merged.estimates[0].notes,'Supervisor note','Supervisor field change must survive Manager sync');
assert.deepEqual(
  [...merged.estimates[0].labourRows].map(x=>x.id).sort(),
  ['L0','LM','LS'],
  'Independent Manager/Supervisor estimate rows must merge without loss'
);
assert.deepEqual(
  [...merged.estimateAudit].map(x=>x.id).sort(),
  ['AM','AS'],
  'Estimate audit entries from both devices must merge'
);

const managerNew={estimates:[{id:'E2',estimateNo:'Zi-Qt002',customerName:'M'}],estimateAudit:[]};
const supervisorNew={estimates:[{id:'E3',estimateNo:'Zi-Qt003',customerName:'S'}],estimateAudit:[]};
const additions=merge({estimates:[],estimateAudit:[]},managerNew,supervisorNew);
assert.deepEqual([...additions.estimates].map(x=>x.id).sort(),['E2','E3'],'Concurrent new estimates must both survive');

console.log('V2 Estimate shared Manager/Supervisor sync: ok');
