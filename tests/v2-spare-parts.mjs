import fs from'node:fs';import assert from'node:assert/strict';import vm from'node:vm';const code=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/workflow.js','utf8');const s={window:{},Date};vm.createContext(s);vm.runInContext(code,s);const p=s.window.zukaitV2.spareParts;
assert.equal(p.canSeePrice('Denter'),false);assert.equal(p.canSeePrice('Purchaser'),true);
assert.equal(p.canAct('Purchaser','QUOTED','ORDERED'),true);assert.equal(p.canAct('Denter','QUOTED','ORDERED'),false);
assert.equal(p.canAct('Denter','RECEIVED','DENTER_CHECKED'),true);assert.equal(p.canAct('Denter','DENTER_CHECKED','SUPERVISOR_CONFIRMED'),false);
assert.equal(p.canAct('Supervisor','DENTER_CHECKED','SUPERVISOR_CONFIRMED'),true);
const hidden=p.sanitize({id:'P1',price:10,billAmount:12,name:'Lamp'},'Denter');assert.equal(hidden.price,undefined);assert.equal(hidden.billAmount,undefined);assert.equal(hidden.name,'Lamp');
const u=p.transition({id:'P1',status:'ENQUIRY'},'UNAVAILABLE',{role:'Purchaser',actorId:'BUY1'});assert.equal(u.ok,true);assert.equal(u.item.cashSettlementRequired,true);
const flag=p.flag({id:'P1',jobCard:'JC1',status:'RECEIVED'},'DEFECT',{role:'Denter',actorId:'DEN1'});assert.equal(flag.ok,true);assert.equal(flag.notification.targetRole,'Supervisor');assert.match(flag.notification.dedupeKey,/spare:DEFECT:P1/);
console.log('V2 spare parts workflow: ok');