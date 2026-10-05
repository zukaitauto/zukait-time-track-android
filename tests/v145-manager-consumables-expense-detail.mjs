import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const start=source.indexOf('/* V145 MANAGER WORKSHOP PERFORMANCE');
const end=source.indexOf('})();',start)+5;
assert.ok(start>=0&&end>start);
const now=Date.now(),old=Date.UTC(2020,0,1);
const state={
 jobs:[{no:'JC1',make:'Toyota',model:'Camry',year:2015},{no:'JC2',make:'Lexus',model:'LX',year:2021}],
 consumables:{
  materials:[{id:'P',name:'Primer',unit:'L',category:'Paint'},{id:'T',name:'Tape',unit:'Roll',category:'Consumable'}],
  brands:[{id:'B',name:'Brand B'}],
  actuals:[
   {jobCard:'JC1',actualAt:now,locked:true,lines:[{materialId:'P',brandId:'B',actualQuantity:2,unitPriceSnapshot:3,lineCost:6},{materialId:'T',brandId:'B',actualQuantity:1,unitPriceSnapshot:1.5,lineCost:1.5}]},
   {jobCard:'JC2',actualAt:now,locked:true,lines:[{materialId:'P',brandId:'B',actualQuantity:1,unitPriceSnapshot:2,lineCost:2}]},
   {jobCard:'VOID',actualAt:now,locked:true,voided:true,lines:[{materialId:'P',lineCost:100}]},
   {jobCard:'OLD',actualAt:old,locked:true,lines:[{materialId:'P',lineCost:100}]},
   {jobCard:'DRAFT',actualAt:now,locked:false,lines:[{materialId:'P',lineCost:100}]}
  ]
 }
};
const ctx={state,me:{role:'Manager'},console,Date,setTimeout(){},openModal(html){ctx.modal=html},closeModal(){},document:{
 querySelector(){return null},createElement(){return {}},head:{appendChild(){}}
}};
ctx.window=ctx;
ctx.ZukaitConsumables={ensureState(s){return s.consumables}};
vm.createContext(ctx);
vm.runInContext(source.slice(start,end),ctx);
ctx.v145OpenConsumablesPerformance();
assert.match(ctx.modal,/Paint Expense<\/span><b>OMR 8\.000/);
assert.match(ctx.modal,/Other Consumables<\/span><b>OMR 1\.500/);
assert.match(ctx.modal,/Total Expense<\/span><b>OMR 9\.500/);
assert.match(ctx.modal,/Job Cards<\/span><b>2/);
assert.match(ctx.modal,/JC1/);
assert.match(ctx.modal,/JC2/);
assert.doesNotMatch(ctx.modal,/VOID|OLD|DRAFT/);
ctx.v145OpenConsumablesJobCard('JC1');
assert.match(ctx.modal,/Toyota Camry 2015/);
assert.match(ctx.modal,/Primer/);
assert.match(ctx.modal,/Tape/);
assert.match(ctx.modal,/Total Consumables Expense <b>OMR 7\.500/);
assert.match(ctx.modal,/v145OpenConsumablesPerformance\(\)">Back/);
state.paintPurchasing={orders:[
 {id:'P1',jobCard:'JC1',poNumber:'PO-1',receivedAt:now,lines:[{id:'L1',paintType:'Base Coat',quantity:2,pricePerLitre:10,lineTotal:20}],returns:[{lineId:'L1',quantity:.5,value:5,returnedAt:now}]},
 {id:'P2',jobCard:'JC2',poNumber:'PO-2',receivedAt:old,lines:[{id:'L2',quantity:2,pricePerLitre:4}],returns:[{lineId:'L2',quantity:.5,returnedAt:now}]},
 {jobCard:'UNRECEIVED',lines:[{quantity:10,pricePerLitre:100}]},
 {jobCard:'VOIDPAINT',voided:true,receivedAt:now,lines:[{quantity:10,pricePerLitre:100}]}
]};
ctx.v145OpenConsumablesPerformance();assert.match(ctx.modal,/Paint Expense<\/span><b>OMR 21\.000/);assert.match(ctx.modal,/Total Expense<\/span><b>OMR 22\.500/);assert.doesNotMatch(ctx.modal,/UNRECEIVED|VOIDPAINT/);
ctx.v145OpenConsumablesJobCard('JC1');assert.match(ctx.modal,/Base Coat/);assert.match(ctx.modal,/PO-1/);assert.match(ctx.modal,/Paint Return/);assert.match(ctx.modal,/OMR -5\.000/);assert.match(ctx.modal,/Total Consumables Expense <b>OMR 22\.500/);
delete ctx.ZukaitConsumables;delete state.consumables;ctx.v145OpenConsumablesPerformance();assert.match(ctx.modal,/Total Expense<\/span><b>OMR 13\.000/,'paint must work without consumables records');
ctx.document.querySelector=()=>({});ctx.v145OpenConsumablesPerformance();assert.match(ctx.modal,/Today/);assert.match(ctx.modal,/OMR 13\.000/);
console.log('Consumables and paint: receipts, returns, periods, unreceived/void exclusion and matching job-card totals passed');
