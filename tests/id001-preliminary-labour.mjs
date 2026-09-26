import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../app/src/main/assets/job_cost_summary_v128.js',import.meta.url),'utf8');
const state={labourRate:2.5,jobs:[{no:'JC100'}],assign:[{id:'A1',job:'JC100',emp:'E1',suggested:120}],sessions:[
 {id:'N1',assignmentId:'A1',job:'JC100',emp:'E1',start:0,end:3600000},
 {id:'P1',assignmentId:'I1',job:'JC100',emp:'E1',start:0,end:1800000,preliminarySourceJob:'ID001',preliminaryLinkedJob:'JC100'}
],consumables:{actuals:[],issues:[]},paintPurchasing:{orders:[]}};
const ctx={window:{},state,Date,console,setTimeout(){},document:{querySelector(){return null},getElementById(){return null},createElement(){return {style:{},appendChild(){},setAttribute(){}}},head:{appendChild(){}}},MutationObserver:class{observe(){}}};
vm.createContext(ctx);vm.runInContext(src,ctx);
let d=ctx.window.v128JobCostData('JC100');
assert.equal(d.labourHours,1.5,'normal 1h + preliminary 0.5h must count once');
assert.equal(d.labour,3.75,'1.5h x OMR 2.500');
delete state.sessions[1].preliminaryLinkedJob;state.sessions[1].job='ID001';
d=ctx.window.v128JobCostData('JC100');
assert.equal(d.labourHours,1,'reversal must remove preliminary time from JC labour');
assert.equal(d.labour,2.5);
console.log('ID001 preliminary labour tests passed');
