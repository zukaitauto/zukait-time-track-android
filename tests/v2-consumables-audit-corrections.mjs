import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const C=require('../app/src/main/assets/consumables.js');
const manager={id:'M1',role:'Manager'};
const supervisor={id:'S1',role:'Supervisor'};
function seed(){
 const state={};
 const material=C.addMaterial(state,{name:'Clear',unit:'Liter',category:'Paint'},manager);
 const brand=C.addBrand(state,{name:'AUTO PAINT'},manager);
 C.setPrice(state,{materialId:material.id,brandId:brand.id,pricePerUnit:2,effectiveFrom:Date.UTC(2026,9,1),reason:'Initial price'},manager);
 C.issue(state,{jobCard:'JC-1',mainPainterId:'P1',allottedSupervisorId:'S1',lines:[{materialId:material.id,brandId:brand.id,quantity:1}]},supervisor);
 return {state,material,brand};
}
test('manager can correct a finalized quantity above issued without losing over-issued attribution',()=>{
 const {state,material,brand}=seed();
 const timestamp=Date.UTC(2026,10,5,12);
 const result=C.finishActual(state,{jobCard:'JC-1',actualAt:timestamp,lines:[{materialId:material.id,brandId:brand.id,quantity:2}]},supervisor);
 assert.equal(result.lines[0].overIssued,true);
 const fixed=C.managerCorrectActual(state,result.id,[{materialId:material.id,brandId:brand.id,quantity:3}],manager,'Verified usage');
 assert.equal(fixed.totalCost,6);
 assert.equal(fixed.lines[0].overIssued,true);
 assert.equal(fixed.lines[0].issuedQuantity,1);
 assert.ok(state.consumables.audit.some(x=>x.type==='ACTUAL_CORRECTED'&&x.before.totalCost===4&&x.after.totalCost===6));
});
test('manager can preserve actual-only item on a corrected finalized record',()=>{
 const {state,material,brand}=seed();
 const other=C.addMaterial(state,{name:'Thinner',unit:'Liter'},manager);
 C.setPrice(state,{materialId:other.id,brandId:brand.id,pricePerUnit:3,effectiveFrom:Date.UTC(2026,9,1),reason:'Initial'},manager);
 const result=C.finishActual(state,{jobCard:'JC-1',actualAt:Date.UTC(2026,10,5,12),lines:[{materialId:material.id,brandId:brand.id,quantity:1},{materialId:other.id,brandId:brand.id,quantity:2}]},supervisor);
 assert.equal(result.lines[1].actualOnly,true);
 const fixed=C.managerCorrectActual(state,result.id,[{materialId:material.id,brandId:brand.id,quantity:1},{materialId:other.id,brandId:brand.id,quantity:3}],manager,'Actual-only item verified');
 assert.equal(fixed.lines[1].actualOnly,true);
 assert.equal(fixed.lines[1].issuedQuantity,0);
 assert.equal(fixed.totalCost,11);
});
test('monthly expense splits at midnight in Oman',()=>{
 const {state,material,brand}=seed();
 const line={materialId:material.id,brandId:brand.id,actualQuantity:1,lineCost:2};
 state.consumables.actuals.push(
  {jobCard:'OLD',locked:true,actualAt:Date.UTC(2026,9,31,19,59),totalCost:2,lines:[line]},
  {jobCard:'NOV',locked:true,actualAt:Date.UTC(2026,9,31,20,0),totalCost:2,lines:[line]}
 );
 assert.equal(C.monthlyExpense(state,2026,10).totalExpense,2);
 assert.equal(C.monthlyExpense(state,2026,10).jobCards,1);
 assert.equal(C.monthlyExpense(state,2026,9).totalExpense,2);
});
