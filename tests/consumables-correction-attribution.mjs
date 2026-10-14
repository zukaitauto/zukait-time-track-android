import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const C=createRequire(import.meta.url)('../app/src/main/assets/consumables.js');
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const section=source.slice(source.indexOf('function consumablesRepriceEvidence('),source.indexOf('// Paint purchasing is also'));
const ctx={same:(a,b)=>JSON.stringify(a)===JSON.stringify(b)};vm.createContext(ctx);vm.runInContext(section.replace(/:\s*any\b/g,''),ctx);
const validate=ctx.validateConsumablesManagerCorrections;
const mgr={id:'MGR001',name:'Manager',role:'Manager'},sup={id:'SUP001',role:'Supervisor'};
const s={};const m=C.addMaterial(s,{name:'Paint',unit:'Liter'},mgr),b=C.addBrand(s,{name:'Brand'},mgr);
const p=C.setPrice(s,{materialId:m.id,brandId:b.id,pricePerUnit:4,effectiveFrom:1000,reason:'Initial'},mgr);
s.consumables.actuals.push({id:'actual-1',jobCard:'12003',actualAt:2000,locked:true,createdBy:sup.id,lines:[{materialId:m.id,brandId:b.id,actualQuantity:2,priceId:p.id,unitPriceSnapshot:4,lineCost:8}],totalCost:8});
const before=structuredClone(s);
C.managerCorrectPrice(s,p.id,5.5,mgr,'Incorrect price');
const row=s.consumables.actuals[0];assert.equal(row.totalCost,11);assert.equal(row.correctedBy,mgr.id);assert.equal(row.correctionReason,'Incorrect price');assert.equal(row.createdBy,sup.id);
assert.equal(validate(s,before,mgr),null);assert.equal(validate(s,before,sup),'manager_required_to_correct_final_consumables');
assert.deepEqual(s.consumables.audit.slice(0,before.consumables.audit.length),before.consumables.audit,'old audits immutable');
const legacy=structuredClone(s);const legacyRow=legacy.consumables.actuals[0];for(const k of ['correctedBy','correctedByName','correctedByRole','correctedAt','correctionReason'])delete legacyRow[k];
legacy.consumables.audit.findLast(x=>x.type==='ACTUAL_PRICE_RECALCULATED').after=structuredClone(legacyRow);
const legacyCopy=structuredClone(legacy);assert.equal(validate(legacy,before,mgr),null,'old pending price audit is sufficient authenticated evidence');assert.deepEqual(legacy,legacyCopy,'validator must not rewrite money or audit');
for(const mutate of [x=>x.consumables.actuals[0].priceRecalculatedBy='MGR999',x=>x.consumables.audit.findLast(a=>a.type==='ACTUAL_PRICE_RECALCULATED').by='MGR999',x=>x.consumables.audit.findLast(a=>a.type==='ACTUAL_PRICE_RECALCULATED').after.totalCost=99,x=>x.consumables.audit.findLast(a=>a.type==='ACTUAL_PRICE_RECALCULATED').reason='',x=>x.consumables.audit.pop()]){
 const bad=structuredClone(legacy);mutate(bad);assert.equal(validate(bad,before,mgr),'consumables_correction_actor_invalid');
}
const replayBase=structuredClone(before);replayBase.consumables.audit=structuredClone(legacy.consumables.audit);assert.equal(validate(legacy,replayBase,mgr),'consumables_correction_actor_invalid','old audit cannot authorize a different write');
const v=structuredClone(s);v.consumables.actuals[0].correctedBy='MGR999';C.managerVoid(v,'actual','actual-1',mgr,'Duplicate');assert.equal(validate(v,s,mgr),null,'void attribution must use current void author, not old correction author');
const noReason=structuredClone(s);noReason.consumables.actuals[0].correctionReason='';noReason.consumables.audit=[];assert.equal(validate(noReason,before,mgr),'consumables_correction_reason_required');
assert.throws(()=>C.managerCorrectPrice(structuredClone(before),p.id,7,sup,'Bad'),/MANAGER_ONLY/);
console.log('PASS Consumables Manager attribution, legacy queued evidence, spoof/replay denial, void attribution and immutable audit');
