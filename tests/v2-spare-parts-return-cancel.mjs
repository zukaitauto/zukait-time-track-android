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
assert.match(main,/item\?\.preReturnSnapshot&&typeof item\.preReturnSnapshot==='object'/,'Cancel Return button is shown only when a restoration snapshot exists');
assert.match(main,/Cancel Return is unavailable for this legacy return/,'handler defensively rejects legacy returns without a snapshot');
assert.match(main,/RETURNED:r==='Manager'\?\['Re-enquire','ENQUIRY','info'\]:null/,'Manager has a safe re-enquiry path for returned parts');
assert.match(main,/CANCEL RETURN<\/button><button[^\n]*Re-enquire/,'modern returned parts offer Manager both undo and genuine replacement choices');
assert.match(main,/delete item\.preReturnSnapshot/);
assert.match(main,/preReturnSnapshot:to==='RETURNED'\?moved\.item\.preReturnSnapshot:null/,'Return event must persist the restoration snapshot to the server');
assert.match(main,/p\.preReturnSnapshot&&typeof p\.preReturnSnapshot==='object'/,'Fresh-login hydration must rebuild the return snapshot');
assert.match(main,/p\.from==='RETURNED'&&p\.to!=='RETURNED'[^}]*delete item\.preReturnSnapshot;delete item\.returnedAt;delete item\.returnedBy;delete item\.returnReason/,'Fresh-login hydration must retire return snapshot and metadata when a genuine replacement cycle begins');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(api,/eventType==="SPARE_PART_RETURN_CANCELLED"/);assert.match(api,/callerRole!=="Manager"/);assert.match(api,/String\(before\.status\|\|""\)!=="RETURNED"/);
assert.match(api,/allowedAfterKeys=new Set\(\["status","receivedQty"/,'Cancel Return API must allow only controlled restoration fields');
assert.match(api,/invalidAfterKey=Object\.keys\(after\)\.some/,'Cancel Return API rejects injected fields');
assert.match(api,/allowedRestoredStatuses=new Set/,'Cancel Return API validates restored status');
assert.match(api,/invalidNumeric=\["receivedQty","lastReceivedQty","purchaseAmount"/,'Cancel Return API validates restored numeric values');
assert.match(api,/if\(to==="RETURNED"\)\{/,'RETURNED status events receive dedicated server validation');
assert.match(api,/allowedSnapshotKeys=new Set\(\["status","receivedQty"/,'server allowlists persisted return snapshot fields');
assert.match(api,/const hasSnapshot=snapshot!=null/,'legacy RETURNED events without a snapshot remain accepted');
assert.match(api,/snapshotInvalid=hasSnapshot&&/,'server validates return snapshot whenever a modern client supplies one');
assert.match(api,/spare_return_snapshot_invalid/,'invalid return snapshots are rejected before commit');
console.log('Spare Parts cancel return: Manager-only audited restoration preserves original purchase amount/date and prevents duplicate cancellation.');

// Manager UI must reject restoring a returned line when its active replacement already exists.
const mainSource=fs.readFileSync(new URL('../app/src/main/assets/v2/features/spare-parts/main_module.js',import.meta.url),'utf8');
assert.match(mainSource,/activeDuplicate=.*status\|\|''\)!=='RETURNED'/s);
assert.match(mainSource,/Cancel Return blocked: an active replacement/);

const partial={id:'P2',name:'Lamp',qty:4,status:'RECEIVED',receivedQty:2,revision:1};
const partialReturned=wf.transition(partial,'RETURNED',{role:'Purchaser',actorId:'P1',reason:'Wrong items',serverTime:'2026-10-07T08:00:00Z'});
assert.equal(partialReturned.ok,true);assert.equal(partialReturned.item.returnedQty,2,'Only physically received quantity is returned');
const orderedOnly={id:'P3',name:'Grille',qty:4,status:'ORDERED',revision:1};
const orderedReturned=wf.transition(orderedOnly,'RETURNED',{role:'Purchaser',actorId:'P1',reason:'Order cancelled',serverTime:'2026-10-07T09:00:00Z'});
assert.equal(orderedReturned.ok,true);assert.equal(orderedReturned.item.returnedQty,0,'Cancelled unreceived order has zero physical returned quantity');
assert.match(main,/returnedQty:to==='RETURNED'/,'Return event persists physical returned quantity');
assert.match(main,/r\.returnedQty/,'Manager report uses returned quantity instead of ordered quantity');
