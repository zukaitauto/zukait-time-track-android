import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
let userRole='Manager';
const ctx={role:()=>userRole,spareBtn:x=>x,esc:x=>String(x),pendingTransition:x=>!!x.pendingSync};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function returnActionButton'),source.indexOf('async function returnPart')),ctx);
for(const status of ['ORDERED','RECEIVED','SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED']){
 assert.match(ctx.returnActionButton('PL1',{id:'P1',status}),/returnPart/);
}
assert.equal(ctx.returnActionButton('PL1',{status:'RETURNED'}),'');
assert.equal(ctx.returnActionButton('PL1',{status:'LISTED'}),'');
assert.match(ctx.returnActionButton('PL1',{status:'RECEIVED',pendingSync:true}),/disabled/);
assert.match(ctx.returnActionButton('PL1',{status:'RECEIVED',syncConflict:true}),/disabled/);
userRole='Supervisor';
assert.match(ctx.returnActionButton('PL1',{status:'FITTED'}),/returnPart/);
userRole='Employee';assert.equal(ctx.returnActionButton('PL1',{status:'FITTED'}),'');
assert.match(source.slice(source.indexOf('async function openList')),/returnActionButton\(r.listNo,x\)/,'Live shared list renders return action');
console.log('Return button: Manager/Supervisor eligible statuses, sync guards and live list integration passed');
const workflowCtx={window:{},Date};vm.createContext(workflowCtx);
vm.runInContext(fs.readFileSync('app/src/main/assets/v2/features/spare-parts/workflow.js','utf8'),workflowCtx);
const wf=workflowCtx.window.zukaitV2.spareParts;
for(const status of ['ORDERED','RECEIVED','SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED']){
 assert.equal(wf.canAct('Supervisor',status,'RETURNED'),true);
 const returned=wf.transition({id:'P1',status,qty:2,receivedQty:2,purchaseAmount:12},'RETURNED',{role:'Supervisor',actorId:'S1',reason:'Wrong part'});
 assert.equal(returned.ok,true);assert.equal(returned.item.returnedBy,'S1');assert.equal(returned.item.returnReason,'Wrong part');
 assert.equal(returned.item.purchaseAmount,undefined);assert.equal(returned.item.preReturnSnapshot.purchaseAmount,12);
 assert.equal(wf.cancelReturn(returned.item,{role:'Supervisor',reason:'Undo'}).ok,false);
}
assert.equal(wf.canAct('Purchaser','FITTED','RETURNED'),false);
assert.equal(wf.canAct('Employee','RECEIVED','RETURNED'),false);
const listCtx={read:()=>[],Date};vm.createContext(listCtx);
vm.runInContext(source.slice(source.indexOf('function returnedPartRows'),source.indexOf('async function openReturnedParts')),listCtx);
const lists=[{listNo:'PL1',items:[{id:'old',status:'RETURNED',returnedAt:'2026-10-01'},{id:'wait',status:'UNAVAILABLE'},{id:'new',status:'RETURNED',returnedAt:'2026-10-17'},{id:'fit',status:'FITTED'}]}];
assert.equal(JSON.stringify(listCtx.returnedPartRows(lists).map(x=>x.item.id)),JSON.stringify(['new','old']));
assert.equal(listCtx.returnedPartRows([]).length,0);
assert.equal((source.match(/\['↩','Returned Parts'/g)||[]).length,2);
assert.match(source,/openReturnedParts,openReturnedPartsList,returnedPartRows/);
const apiSource=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(apiSource,/includes\(from\)&&!\["Manager","Supervisor"\]\.includes\(callerRole\)/);
console.log('Supervisor return authorization, preserved financial snapshot, Manager-only cancellation and returned-only list passed');
