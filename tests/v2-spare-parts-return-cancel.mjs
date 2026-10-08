import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';

const workflow=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/workflow.js','utf8');
const ctx={window:{zukaitV2:{}},Date};vm.createContext(ctx);vm.runInContext(workflow,ctx);
const wf=ctx.window.zukaitV2.spareParts;

const original={id:'P1',name:'Bumper',qty:2,status:'FITTED',revision:7,receivedQty:2,receivedAt:'2026-09-29T08:00:00Z',supervisorVerifiedAt:'2026-09-29T09:00:00Z',confirmedAt:'2026-09-29T09:30:00Z',fittedAt:'2026-09-30T10:00:00Z',purchaseAmount:12.5,purchaseRecordedAt:'2026-09-30T20:00:00.000Z',supplier:'Vendor A',billAmount:12.5,quoteAmount:15};
const returned=wf.transition(original,'RETURNED',{role:'Manager',actorId:'M1',reason:'Wrong part',serverTime:'2026-10-05T08:00:00Z'});
assert.equal(returned.ok,true);assert.equal(returned.item.status,'RETURNED');assert.equal(returned.item.purchaseAmount,undefined);assert.equal(returned.item.purchaseRecordedAt,undefined);assert.equal(returned.item.preReturnSnapshot.purchaseAmount,12.5);assert.equal(returned.item.preReturnSnapshot.purchaseRecordedAt,'2026-09-30T20:00:00.000Z');
assert.equal(wf.cancelReturn(returned.item,{role:'Supervisor',reason:'Mistake'}).reason,'MANAGER_REQUIRED');
assert.equal(wf.cancelReturn(returned.item,{role:'Purchaser',reason:'Mistake'}).reason,'MANAGER_REQUIRED');
assert.equal(wf.cancelReturn(returned.item,{role:'Manager'}).reason,'CANCEL_RETURN_REASON_REQUIRED');
const restored=wf.cancelReturn(returned.item,{role:'Manager',actorId:'M1',reason:'Return marked by mistake',serverTime:'2026-10-05T09:00:00Z'});
assert.equal(restored.ok,true);assert.equal(restored.item.status,'FITTED');assert.equal(restored.item.purchaseAmount,12.5);assert.equal(restored.item.purchaseRecordedAt,'2026-09-30T20:00:00.000Z');assert.equal(restored.item.receivedQty,2);assert.equal(restored.item.fittedAt,'2026-09-30T10:00:00Z');assert.equal(restored.item.preReturnSnapshot,undefined);assert.equal(restored.audit.type,'SPARE_PART_RETURN_CANCELLED');
assert.equal(wf.cancelReturn(restored.item,{role:'Manager',reason:'Again'}).reason,'PART_NOT_RETURNED');
const genuineReturn=wf.transition(original,'RETURNED',{role:'Manager',actorId:'M1',reason:'Wrong supplied part',serverTime:'2026-10-06T08:00:00Z'});
const reenquired=wf.transition(genuineReturn.item,'ENQUIRY',{role:'Purchaser',actorId:'P1',serverTime:'2026-10-06T09:00:00Z'});
assert.equal(reenquired.ok,true);assert.equal(reenquired.item.status,'ENQUIRY');assert.equal(reenquired.item.preReturnSnapshot,undefined,'Replacement cycle must retire old return snapshot');assert.equal(reenquired.item.purchaseAmount,undefined,'Returned purchase must remain zero expense during replacement cycle');assert.equal(reenquired.item.purchaseRecordedAt,undefined);
const quoted=wf.transition(reenquired.item,'QUOTED',{role:'Purchaser',actorId:'P1',serverTime:'2026-10-06T10:00:00Z'});const ordered=wf.transition(quoted.item,'ORDERED',{role:'Purchaser',actorId:'P1',serverTime:'2026-10-06T11:00:00Z'});assert.equal(ordered.ok,true);assert.equal(ordered.item.purchaseAmount,undefined);assert.equal(ordered.item.preReturnSnapshot,undefined);


const main=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
assert.match(main,/SPARE_PART_RETURN_CANCELLED/);assert.match(main,/↶ CANCEL RETURN/);assert.match(main,/type:'SPARE_PART_RETURN_CANCELLED'/);
assert.match(main,/delete item\.preReturnSnapshot/);
assert.match(main,/preReturnSnapshot:to==='RETURNED'\?moved\.item\.preReturnSnapshot:null/,'Return event must persist the restoration snapshot to the server');
assert.match(main,/p\.preReturnSnapshot&&typeof p\.preReturnSnapshot==='object'/,'Fresh-login hydration must rebuild the return snapshot');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(api,/eventType==="SPARE_PART_RETURN_CANCELLED"/);assert.match(api,/callerRole!=="Manager"/);assert.match(api,/String\(before\.status\|\|""\)!=="RETURNED"/);
console.log('Spare Parts cancel return: Manager-only audited restoration preserves original purchase amount/date and prevents duplicate cancellation.');
