import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const state={
 labourRate:2.5,
 jobs:[{no:'JC1',vehicle:'Toyota Camry',reg:'REG1'}],
 assign:[{id:'A1',job:'JC1',emp:'P1',suggested:120,completed:true}],
 sessions:[],
 consumables:{
  issues:[{id:'I1',type:'issued',jobCard:'JC1',locked:true,createdAt:Date.now()}],
  actuals:[{id:'AC1',jobCard:'JC1',locked:true,totalCost:7.875}]
 },
 paintPurchasing:{orders:[{id:'PO1',jobCard:'JC1',createdAt:Date.now(),receivedAt:Date.now(),returns:[],status:'Received / Costed'}]},
 paintCosting:{JC1:{netPaintCost:3.25}}
};
const ctx={
 state,console,
 totalForAssignment:()=>60,
 labourCost:()=>2.5,
 setTimeout:fn=>fn(),
 document:{
  head:{appendChild(){}},
  createElement(){return {innerHTML:'',firstElementChild:null}},
  querySelector(){return null},
  getElementById(){return null}
 },
 openManagerJobDetails(){},
 openSupervisorJob(){},
 zukaitV2:{sparePartsMain:{reportRows:()=>[{jobCard:'JC1',amount:12.5,status:'FITTED'},{jobCard:'JC1',amount:7,status:'RETURNED'},{jobCard:'JC1',amount:8,status:'UNAVAILABLE'},{jobCard:'JC1',amount:9,status:'CANCELLED'},{jobCard:'OTHER',amount:99,status:'FITTED'}]}}
};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('app/src/main/assets/job_cost_summary_v128.js','utf8'),ctx);
const d=ctx.v128JobCostData('JC1');
assert.equal(d.labour,2.5);
assert.equal(d.materials,7.875);
assert.equal(d.paint,3.25);
assert.equal(d.consumables,11.125);
assert.equal(d.parts,12.5,'returned, unavailable and cancelled parts must not be charged to the Job Card');
assert.equal(d.total,26.125);
assert.equal(d.labourHours,1);
assert.equal(d.consumablesStatus,'Completed');
assert.equal(d.paintStatus,'Received / Costed');

state.paintPurchasing.orders[0].returns=[{quantity:0.1}];
assert.equal(ctx.v128JobCostData('JC1').paintStatus,'Returned / Adjusted');
state.consumables.actuals=[];
assert.equal(ctx.v128JobCostData('JC1').consumablesStatus,'Actual Pending');
state.consumables.issues=[];
assert.equal(ctx.v128JobCostData('JC1').consumablesStatus,'Not Started');

const src=fs.readFileSync('app/src/main/assets/job_cost_summary_v128.js','utf8');
assert.match(src,/TOTAL JOB COST/);
assert.match(src,/CONSUMABLES COST/);
assert.match(src,/PARTS COST/);
assert.match(src,/Parts \+ Consumables \+ Labour/);
assert.match(src,/Cost source check/);
assert.match(src,/Paint net after returns/);
assert.match(src,/chargeable recorded commercial amount/);
assert.match(src,/openManagerJobDetails/);
assert.match(src,/openSupervisorJob/);
console.log('V128 combined Job Cost and consumables/paint status tests passed');
