import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const at=Date.parse('2026-10-05T08:00:00Z'),from=Date.parse('2026-09-30T20:00:00Z'),to=Date.parse('2026-10-31T20:00:00Z');
const state={jobs:[{no:'JC1'}],assign:[],sessions:[],sublets:[{id:'S1',jobCard:'JC1',date:'2026-10-05',amountMills:1005}],consumables:{materials:[{id:'M',name:'Base white',category:'Paint'}],actuals:[{id:'A1',jobCard:'JC1',locked:true,actualAt:at,totalCost:2.003,lines:[{materialId:'M',actualQuantity:1,unitPriceSnapshot:2.003,lineCost:2.003}]},{id:'void',jobCard:'JC1',locked:true,voided:true,actualAt:at,totalCost:100,lines:[{lineCost:100}]}]},paintPurchasing:{orders:[{id:'P1',jobCard:'JC1',receivedAt:at,lines:[{id:'L1',quantity:2,pricePerLitre:3.001,lineTotal:6.002}],returns:[{id:'R1',lineId:'L1',quantity:.5,value:1.501,returnedAt:at},{id:'void-return',value:100,returnedAt:at,voided:true}]},{id:'nil',jobCard:'JC1',nilPaintPurchase:true,receivedAt:at,lines:[{quantity:1,lineTotal:999}]},{id:'void-po',jobCard:'JC1',voided:true,receivedAt:at,lines:[{lineTotal:999}]},{id:'draft',jobCard:'JC1',lines:[{lineTotal:999}]}]}};
const parts=[{jobCard:'JC1',status:'FITTED',amount:4.006,listNo:'PL1',purchaseRecordedAt:'2026-10-05T08:00:00Z'}];
const ctx={state,me:{role:'Manager'},Date,Intl,console,setTimeout(){},document:{querySelector(){return null},createElement(){return{}},head:{appendChild(){}}},zukaitV2:{sparePartsMain:{reportRows:()=>parts}}};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['paint_order_rules.js','job_card_master.js','job_cost_summary_v128.js'])vm.runInContext(fs.readFileSync('app/src/main/assets/'+file,'utf8'),ctx);
const source=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8'),start=source.indexOf('/* V145 MANAGER WORKSHOP PERFORMANCE');vm.runInContext(source.slice(start,source.indexOf('})();',start)+5),ctx);
function compare(){const before=JSON.stringify(state),cost=ctx.v128JobCostData('JC1'),period=ctx.v377ConsumablesCostForPeriod(from,to);assert.equal(cost.parts,4.006);assert.equal(cost.sublet,1.005);assert.equal(cost.purchase,5.011);assert.equal(period.paint,cost.paint);assert.equal(period.other,cost.materials,'all issued materials remain Paint Materials regardless of catalogue category');assert.equal(period.total,cost.consumables);assert.equal(JSON.stringify(state),before,'report reads preserve all records');return period;}
assert.equal(compare().total,6.504);
state.paintPurchasing.orders[0].returns[0].value=1.002;assert.equal(compare().paint,5,'dated correction is reflected without duplication');
state.paintPurchasing.orders[0].returns[0].voided=true;assert.equal(compare().paint,6.002,'cancelled return restores cost');
state.paintPurchasing.orders[0].voided=true;assert.equal(compare().total,2.003,'voided PO and NIL purchase do not contribute');
state.consumables.actuals[0].voided=true;assert.equal(compare().total,0);
console.log('PASS V377 financial integration: authoritative JC/period costs, three decimals, material-source grouping, NIL, returns, corrections, voids and read-only state');
