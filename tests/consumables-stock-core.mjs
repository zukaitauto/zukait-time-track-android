import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Stock = require('../app/src/main/assets/consumables_stock_core.js');
const manager = {id:'MGR',role:'Manager'}, supervisor = {id:'SUP',role:'Supervisor'};
const employee = {id:'EMP',role:'Employee'};
let s = Stock.empty(); let seq = 0;
function run(action, data, actor=manager) {
  const receipt = Stock.transaction(s,action,{requestId:'t'+(++seq),...data},actor);
  s = receipt.state; return receipt.result;
}
const approx = (a,b) => assert.ok(Math.abs(a-b)<1e-8, a+' != '+b);
const capsi = {materialId:'primer',brandId:'capsi'};
const milaco = {materialId:'primer',brandId:'milaco'};
run('OPENING',{...capsi,unit:'Liter',quantity:4,unitCost:5.5});
run('OPENING',{...milaco,unit:'Liter',quantity:6,unitCost:6});
run('PURCHASE',{...capsi,quantity:5,priceMethod:'total',price:30},supervisor);
approx(Stock.avgCost(s.items[0]),52/9);
approx(Stock.avgCost(s.items[1]),6); // each brand has its own cost
let capsiRes=run('RESERVE',{...capsi,jobCard:'JC12000',quantity:2},supervisor);
const locked=52/9;
run('PURCHASE',{...capsi,quantity:5,priceMethod:'unit',price:8},manager);
run('CHANGE',{reservationId:capsiRes.id,quantity:3},supervisor);
const edited=s.reservations.find(x=>x.id===capsiRes.id);
approx(edited.lots[0].unitCost,locked);
approx(edited.lots[1].unitCost,(52+40)/14);
run('CHANGE',{reservationId:capsiRes.id,quantity:2},supervisor);
assert.equal(s.reservations.find(x=>x.id===capsiRes.id).lots.length,1); // decrease removes latest cost first
const afterFinal=run('FINALISE',{reservationId:capsiRes.id,actualQuantity:1.5},supervisor);
approx(afterFinal.finalCost,1.5*locked);
approx(s.items[0].reserved,0);
approx(s.items[0].physical,12.5);
const countBefore=s.movements.length;
const receipt=Stock.transaction(s,'FINALISE',{requestId:'t'+seq,reservationId:capsiRes.id,actualQuantity:1.5},supervisor);
assert.equal(receipt.replay,true);
assert.equal(receipt.state.movements.length,countBefore); // retries cannot duplicate
assert.throws(()=>Stock.transaction(s,'FINALISE',{requestId:'t'+seq,reservationId:capsiRes.id,actualQuantity:2},supervisor),/REQUEST_ID_CONFLICT/);
run('RETURN',{reservationId:capsiRes.id,quantity:.5},supervisor);
approx(s.items[0].physical,13);
approx(s.reservations.find(x=>x.id===capsiRes.id).returnedLots[0].quantity,.5);
assert.throws(()=>run('RETURN',{reservationId:capsiRes.id,quantity:2},supervisor),/RETURN_EXCEEDS_ACTUAL/);
const milacoRes=run('RESERVE',{...milaco,jobCard:'JC12001',quantity:2},supervisor);
assert.throws(()=>run('RESERVE',{...milaco,jobCard:'JC12002',quantity:5},supervisor),/INSUFFICIENT_STOCK/);
run('CANCEL',{reservationId:milacoRes.id},supervisor);
approx(s.items[1].reserved,0);
approx(Stock.available(s.items[1]),6);
assert.throws(()=>run('OPENING',{...capsi,unit:'Liter',quantity:5,unitCost:6}),/OPENING_ALREADY_RECORDED/);

const pending=run('RESERVE',{...capsi,jobCard:'JC12003',quantity:2},supervisor);
assert.throws(()=>run('ADJUST',{...capsi,countedQuantity:1,reason:'Physical count'},manager),/COUNT_BELOW_RESERVED/);
assert.throws(()=>run('ADJUST',{...capsi,countedQuantity:12,reason:''},manager),/REASON_REQUIRED/);
assert.throws(()=>run('ADJUST',{...capsi,countedQuantity:12,reason:'Count'},supervisor),/MANAGER_ONLY/);
run('CANCEL',{reservationId:pending.id},supervisor);
const old=structuredClone(s);
assert.throws(()=>run('PURCHASE',{...capsi,quantity:1,priceMethod:'unit',price:5},employee),/STOCK_FORBIDDEN/);
assert.deepEqual(s,old,'invalid actions never mutate previous state');
const finalCap=run('ADJUST',{...capsi,countedQuantity:12,reason:'Verified physical count'},manager);
approx(finalCap.physical,12);
const exhaust={materialId:'thinner',brandId:'c'};
run('OPENING',{...exhaust,unit:'Liter',quantity:2,unitCost:5});
const exhaustRes=run('RESERVE',{...exhaust,jobCard:'JC12009',quantity:2},supervisor);
run('FINALISE',{reservationId:exhaustRes.id,actualQuantity:2},supervisor);
approx(s.items.find(x=>x.brandId==='c').physical,0);
run('PURCHASE',{...exhaust,quantity:5,priceMethod:'unit',price:6},supervisor);
approx(Stock.avgCost(s.items.find(x=>x.brandId==='c')),6);
assert.ok(s.movements.length>=15);
console.log('Consumables stock core: brand separation, opening, weighted average, cost locking, edits, return, finalise, idempotency, audit and role guards PASSED');
