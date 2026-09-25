import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const C=require('../app/src/main/assets/consumables.js');
const manager={id:'MGR001',role:'Manager'},supervisor={id:'SUP001',role:'Supervisor'},employee={id:'EMP001',role:'Employee'};
const state={jobs:[{no:'JC1'}],assign:[{id:'a1',job:'JC1',emp:'EMP1',suggested:60}],sessions:[{id:'s1',job:'JC1',emp:'EMP1',start:100,end:200}],overtimeNotices:{EMP1:{x:1}},leaves:[]};
const before=C.timeControlFingerprint(state);
const mat=C.addMaterial(state,{name:'2K Primer',unit:'Liter'},manager);
const brand=C.addBrand(state,{name:'Duxone'},manager);
assert.throws(()=>C.addMaterial(state,{name:'2K Primer',unit:'Liter'},manager),/MATERIAL_DUPLICATE/);
assert.throws(()=>C.addBrand(state,{name:'Duxone'},manager),/BRAND_DUPLICATE/);
assert.throws(()=>C.addMaterial(state,{name:'Bad',unit:'box'},manager),/INVALID_UNIT/);
assert.throws(()=>C.addMaterial(state,{name:'Employee Edit',unit:'Liter'},employee),/MANAGER_ONLY/);
const oct1=new Date(2026,9,1).getTime(),nov1=new Date(2026,10,1).getTime();
const p1=C.setPrice(state,{materialId:mat.id,brandId:brand.id,pricePerUnit:3.5,effectiveFrom:oct1,reason:'Initial/configured price'},manager);
const p2=C.setPrice(state,{materialId:mat.id,brandId:brand.id,pricePerUnit:3.75,effectiveFrom:nov1,reason:'Initial/configured price'},manager);
assert.equal(C.priceAt(state,mat.id,brand.id,new Date(2026,9,15).getTime()).id,p1.id);
assert.equal(C.priceAt(state,mat.id,brand.id,new Date(2026,10,15).getTime()).id,p2.id);
assert.throws(()=>C.setPrice(state,{materialId:mat.id,brandId:brand.id,pricePerUnit:9,effectiveFrom:nov1,reason:'Initial/configured price'},manager),/PRICE_DATE_DUPLICATE/);
C.issue(state,{jobCard:'jc1',vehicle:'Toyota',colourCode:'040',mainPainterId:'EMP006',allottedSupervisorId:'SUP001',lines:[{materialId:mat.id,brandId:brand.id,quantity:2}]},supervisor,C.TYPES.ISSUED);
assert.throws(()=>C.issue(state,{jobCard:'JC1',lines:[{materialId:mat.id,brandId:brand.id,quantity:1}]},supervisor,C.TYPES.ISSUED),/ISSUED_ALREADY_FINISHED/);
C.issue(state,{jobCard:'JC1',lines:[{materialId:mat.id,brandId:brand.id,quantity:.5}]},supervisor,C.TYPES.ADDITIONAL);
assert.equal(C.allowance(state,'JC1')[0].quantity,2.5);
assert.throws(()=>C.finishActual(state,{jobCard:'JC1',actualAt:new Date(2026,9,15).getTime(),lines:[{materialId:mat.id,brandId:brand.id,quantity:2.6}]},supervisor),/ACTUAL_EXCEEDS_ISSUED/);
const actual=C.finishActual(state,{jobCard:'JC1',actualAt:new Date(2026,9,15).getTime(),lines:[{materialId:mat.id,brandId:brand.id,quantity:2.25}]},supervisor);
assert.equal(actual.lines[0].unitPriceSnapshot,3.5);
assert.equal(actual.totalCost,7.875);
assert.throws(()=>C.finishActual(state,{jobCard:'JC1'},supervisor),/ACTUAL_RECORD_EXISTS/);
assert.throws(()=>C.issue(state,{jobCard:'JC1',lines:[{materialId:mat.id,brandId:brand.id,quantity:1}]},supervisor,C.TYPES.ADDITIONAL),/ACTUAL_ALREADY_FINISHED/);
C.setPrice(state,{materialId:mat.id,brandId:brand.id,pricePerUnit:4,effectiveFrom:new Date(2026,11,1).getTime(),reason:'Initial/configured price'},manager);
assert.equal(state.consumables.actuals[0].totalCost,7.875,'historical actual must retain price snapshot');
const month=C.monthlyExpense(state,2026,9);
assert.equal(month.jobCards,1); assert.equal(month.totalExpense,7.875);

// Manager correction/audit safety
assert.throws(()=>C.managerCorrectActual(state,actual.id,[{materialId:mat.id,brandId:brand.id,quantity:2}],supervisor,'x'),/MANAGER_ONLY/);
assert.throws(()=>C.managerCorrectActual(state,actual.id,[{materialId:mat.id,brandId:brand.id,quantity:2}],manager,''),/REASON_REQUIRED/);
const corrected=C.managerCorrectActual(state,actual.id,[{materialId:mat.id,brandId:brand.id,quantity:2}],manager,'Verified actual usage');
assert.equal(corrected.totalCost,7,'correction must recalculate using historical 3.500 snapshot');
assert.equal(corrected.lines[0].unitPriceSnapshot,3.5,'correction must preserve historical price snapshot');
assert.equal(state.consumables.audit.at(-1).type,'ACTUAL_CORRECTED');
assert.equal(state.consumables.audit.at(-1).reason,'Verified actual usage');
assert.throws(()=>C.managerCorrectActual(state,actual.id,[{materialId:mat.id,brandId:brand.id,quantity:3}],manager,'too high'),/ACTUAL_EXCEEDS_ISSUED/);
assert.throws(()=>C.managerReopenActual(state,actual.id,supervisor,'x'),/MANAGER_ONLY/);
assert.throws(()=>C.managerReopenActual(state,actual.id,manager,''),/REASON_REQUIRED/);
const reopened=C.managerReopenActual(state,actual.id,manager,'Supervisor needs controlled correction');
assert.equal(reopened.locked,false); assert.equal(reopened.managerReopen,true); assert.equal(state.consumables.audit.at(-1).type,'ACTUAL_REOPENED');
assert.throws(()=>C.managerVoid(state,'actual',actual.id,manager,''),/REASON_REQUIRED/);
const voided=C.managerVoid(state,'actual',actual.id,manager,'Duplicate/invalid record test');
assert.equal(voided.voided,true); assert.equal(state.consumables.audit.at(-1).type,'ACTUAL_VOIDED');
assert.equal(C.monthlyExpense(state,2026,9).totalExpense,0,'voided actual must leave financial reports');
// Reopen must never create a second Actual or double-count financials.
const reopenState={};
const om=C.addMaterial(reopenState,{name:'Reopen Primer',unit:'Liter'},manager),ob=C.addBrand(reopenState,{name:'ReopenBrand'},manager);
C.setPrice(reopenState,{materialId:om.id,brandId:ob.id,pricePerUnit:4,effectiveFrom:new Date(2026,0,1).getTime(),reason:'Reopen lifecycle test price'},manager);
C.issue(reopenState,{clientRequestId:'reopen-issued',jobCard:'JC-REOPEN',lines:[{materialId:om.id,brandId:ob.id,quantity:3}]},supervisor,C.TYPES.ISSUED);
const oa=C.finishActual(reopenState,{clientRequestId:'reopen-actual',jobCard:'JC-REOPEN',actualAt:new Date(2026,8,24).getTime(),lines:[{materialId:om.id,brandId:ob.id,quantity:2}]},supervisor);
C.managerReopenActual(reopenState,oa.id,manager,'Correct finalized quantity');
assert.equal(reopenState.consumables.actuals.length,1,'reopen must retain one authoritative Actual');
assert.equal(reopenState.consumables.actuals[0].locked,false,'reopen must temporarily remove the record from finalized financials');
assert.equal(C.monthlyExpense(reopenState,2026,8).totalExpense,0,'reopened Actual must stay out of finalized financials');
const refinal=C.finishActual(reopenState,{clientRequestId:'reopen-second',jobCard:'JC-REOPEN',actualAt:new Date(2026,8,24).getTime(),lines:[{materialId:om.id,brandId:ob.id,quantity:1.5}]},supervisor);
assert.equal(reopenState.consumables.actuals.length,1,'re-finalize must update the authoritative Actual without duplication');
assert.equal(refinal.locked,true); assert.equal(refinal.managerReopen,false); assert.equal(state.consumables.audit.at(-1)?.type==='ACTUAL_REFINALIZED'||reopenState.consumables.audit.at(-1).type,'ACTUAL_REFINALIZED');
assert.equal(C.monthlyExpense(reopenState,2026,8).totalExpense,6,'re-finalized Actual must be counted exactly once');


// Backdated price recalculation: only affected finalized Actuals change, with full audit and snapshot update.
const priceState={};
const pm=C.addMaterial(priceState,{name:'Price Primer',unit:'Liter'},manager),pb=C.addBrand(priceState,{name:'PriceBrand'},manager);
C.setPrice(priceState,{materialId:pm.id,brandId:pb.id,pricePerUnit:5,effectiveFrom:new Date(2026,0,1).getTime(),reason:'Base price'},manager);
C.issue(priceState,{clientRequestId:'price-issued',jobCard:'JC-PRICE',lines:[{materialId:pm.id,brandId:pb.id,quantity:3}]},supervisor,C.TYPES.ISSUED);
const pa=C.finishActual(priceState,{clientRequestId:'price-actual',jobCard:'JC-PRICE',actualAt:new Date(2026,8,24).getTime(),lines:[{materialId:pm.id,brandId:pb.id,quantity:2}]},supervisor);
assert.equal(pa.totalCost,10);
const back=C.setPrice(priceState,{materialId:pm.id,brandId:pb.id,pricePerUnit:4.25,effectiveFrom:new Date(2026,8,1).getTime(),reason:'Backdated supplier invoice'},manager);
// Make this backdated row the applicable price for the Actual date before testing recalculation.
const basePrice=priceState.consumables.prices.find(p=>p.materialId===pm.id&&p.brandId===pb.id&&p.id!==back.id);
basePrice.voided=true;
assert.equal(C.priceAt(priceState,pm.id,pb.id,new Date(2026,8,24).getTime()).id,back.id,'backdated row must be applicable before recalculation');
assert.equal(pa.totalCost,10,'backdated price must not silently change finalized Actual');
assert.throws(()=>C.managerRecalculateActualPrices(priceState,back.id,supervisor,'x'),/MANAGER_ONLY/);
assert.throws(()=>C.managerRecalculateActualPrices(priceState,back.id,manager,''),/REASON_REQUIRED/);
const changed=C.managerRecalculateActualPrices(priceState,back.id,manager,'Approved historical recalculation');
assert.equal(changed.length,1);
const paAfterBack=priceState.consumables.actuals.find(x=>x.id===pa.id);
assert.equal(paAfterBack.lines[0].priceId,back.id); assert.equal(paAfterBack.lines[0].unitPriceSnapshot,4.25); assert.equal(paAfterBack.totalCost,8.5);
assert.equal(priceState.consumables.audit.at(-1).type,'ACTUAL_PRICE_RECALCULATED');
assert.equal(priceState.consumables.audit.at(-1).reason,'Approved historical recalculation');
assert.equal(C.monthlyExpense(priceState,2026,8).totalExpense,8.5);
assert.equal(priceState.consumables.audit.at(-1).before.totalCost,10,'recalculation audit must preserve original total');
assert.equal(priceState.consumables.audit.at(-1).after.totalCost,8.5,'recalculation audit must preserve recalculated total');
// A selected backdated price must not override a newer price that was actually applicable on the Actual date.
const newer=C.setPrice(priceState,{materialId:pm.id,brandId:pb.id,pricePerUnit:6,effectiveFrom:new Date(2026,8,15).getTime(),reason:'Newer applicable price'},manager);
const unchanged=C.managerRecalculateActualPrices(priceState,back.id,manager,'Retry older price recalculation');
assert.equal(unchanged.length,0,'older backdated price must not override newer applicable price');
assert.equal(priceState.consumables.actuals.find(x=>x.id===pa.id).totalCost,8.5,'non-applicable recalculation must leave stored snapshot unchanged');
const changedNewer=C.managerRecalculateActualPrices(priceState,newer.id,manager,'Apply newer effective price');
assert.equal(changedNewer.length,1); assert.equal(priceState.consumables.actuals.find(x=>x.id===pa.id).totalCost,12,'applicable newer price must recalculate finalized Actual');
assert.equal(C.monthlyExpense(priceState,2026,8).totalExpense,12);

assert.equal(C.timeControlFingerprint(state),before,'consumables operations must not mutate time-control state');

// Idempotency: retries/double taps with the same clientRequestId must create exactly one record.
const retryState={};
const rm=C.addMaterial(retryState,{name:'Clear Coat',unit:'Liter'},manager),rb=C.addBrand(retryState,{name:'RetryBrand'},manager);
C.setPrice(retryState,{materialId:rm.id,brandId:rb.id,pricePerUnit:2,effectiveFrom:new Date(2026,0,1).getTime(),reason:'Retry test price'},manager);
const issuedInput={clientRequestId:'req-issued-001',jobCard:'JC-RETRY',vehicle:'Test',mainPainterId:'EMP006',allottedSupervisorId:'SUP001',lines:[{materialId:rm.id,brandId:rb.id,quantity:2}]};
const ri1=C.issue(retryState,issuedInput,supervisor,C.TYPES.ISSUED),ri2=C.issue(retryState,issuedInput,supervisor,C.TYPES.ISSUED);
assert.equal(ri1.id,ri2.id); assert.equal(retryState.consumables.issues.length,1,'issued retry must not duplicate');
const addInput={clientRequestId:'req-add-001',jobCard:'JC-RETRY',lines:[{materialId:rm.id,brandId:rb.id,quantity:1}]};
const ra1=C.issue(retryState,addInput,supervisor,C.TYPES.ADDITIONAL),ra2=C.issue(retryState,addInput,supervisor,C.TYPES.ADDITIONAL);
assert.equal(ra1.id,ra2.id); assert.equal(retryState.consumables.issues.length,2,'additional retry must not duplicate');
const actualInput={clientRequestId:'req-actual-001',jobCard:'JC-RETRY',actualAt:new Date(2026,8,24).getTime(),lines:[{materialId:rm.id,brandId:rb.id,quantity:2.5}]};
const rx1=C.finishActual(retryState,actualInput,supervisor),rx2=C.finishActual(retryState,actualInput,supervisor);
assert.equal(rx1.id,rx2.id); assert.equal(retryState.consumables.actuals.length,1,'actual retry must not duplicate');
assert.throws(()=>C.issue(state,{jobCard:'JC2',lines:[{materialId:mat.id,brandId:brand.id,quantity:1}]},employee,C.TYPES.ISSUED),/CONSUMABLES_FORBIDDEN/);
console.log('Consumables isolation tests passed');

{
 const s={};const mgr={id:'MGR1',name:'Manager',role:'Manager'};
 const mat=C.addMaterial(s,{name:'Correction Test Paint',unit:'Liter',category:'Paint'},mgr);
 const brand=C.addBrand(s,{name:'Correction Test Brand'},mgr);
 const p=C.setPrice(s,{materialId:mat.id,brandId:brand.id,pricePerUnit:4.125,effectiveFrom:1000,reason:'Initial'},mgr);
 const beforeActual={id:'actual-price-snapshot',department:'Painting',jobCard:'JC-SNAPSHOT',actualAt:2000,locked:true,voided:false,lines:[{materialId:mat.id,brandId:brand.id,actualQuantity:2,priceId:p.id,unitPriceSnapshot:4.125,lineCost:8.25}],totalCost:8.25};
 s.consumables.actuals.push(beforeActual);
 const corrected=C.managerCorrectPrice(s,p.id,5.500,mgr,'Wrong price entered');
 assert.equal(corrected.pricePerUnit,5.5);
 assert.equal(s.consumables.actuals[0].lines[0].unitPriceSnapshot,4.125,'master correction must not rewrite historical JC price snapshot');
 assert.equal(s.consumables.actuals[0].totalCost,8.25,'master correction must not rewrite historical JC total');
 const audit=s.consumables.audit.at(-1);assert.equal(audit.type,'PRICE_CORRECTED');assert.equal(audit.before.pricePerUnit,4.125);assert.equal(audit.after.pricePerUnit,5.5);
 assert.throws(()=>C.managerCorrectPrice(s,p.id,6,{id:'SUP1',role:'Supervisor'},'wrong'),/MANAGER_ONLY/);
}
