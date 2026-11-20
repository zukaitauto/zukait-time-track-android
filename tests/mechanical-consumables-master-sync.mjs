import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const cloud=readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const master=readFileSync('app/src/main/assets/consumables_ui.js','utf8');
const start=cloud.indexOf('// One tiny Material+Brand ID after a CONFIRMED');
const end=cloud.indexOf('window.cloudScheduleSave=function()',start);
assert.ok(start>0&&end>start,'Stock master queue must exist inside the established cloud sync workflow');
assert.match(cloud,/status\('SYNCED','ok'\);[\s\S]{0,200}setTimeout\(flushStockMasterLinks,0\)/,
 'Only acknowledged main workshop saves can trigger catalog syncing');
assert.match(cloud,/async function flushStockMasterLinks\(/);
assert.match(master,/cloudQueueStockMasterLink\(\{materialId:m.id,brandId:b.id,origin:/);
const db=new Map();
const storage={
 getItem:key=>db.get(key)||null,
 setItem:(key,val)=>{db.set(key,val)},
 removeItem:key=>{db.delete(key)}
};
const calls=[],tasks=[];
let response={ok:true,linked:{linked:true}};
const ctx={
 console,
 me:{id:'MGR1',role:'Manager'},
 navigator:{onLine:true},
 localStorage:storage,
 window:{ZUKAIT_STOCK_MASTER_LINK_ENABLED:true},
 initialDone:false,cloudDirty:true,cloudPushing:true,
 sessionEpoch:1,sessionToken:()=> 'valid-session',
 stale:epoch=>epoch!==ctx.sessionEpoch,
 api:async body=>{calls.push(body);return response},
 setTimeout:fn=>{tasks.push(fn)},
};
ctx.window.window=ctx.window;
vm.createContext(ctx);
vm.runInContext(cloud.slice(start,end),ctx);
assert.equal(ctx.window.cloudQueueStockMasterLink({
 materialId:'oil5w30',brandId:'brand1',origin:'Mechanical'}),true);
assert.equal(ctx.window.cloudQueueStockMasterLink({
 materialId:'oil5w30',brandId:'brand1',origin:'Mechanical'}),true);
let queue=JSON.parse(storage.getItem('zukait_stock_master_link_queue_v1:MGR1'));
assert.equal(queue.length,1,'same pair and origin must be queued only once');
await ctx.flushStockMasterLinks();
assert.equal(calls.length,0,'link prohibited before workshop save acknowledgement');
ctx.cloudPushing=false;ctx.cloudDirty=false;ctx.initialDone=true;
response={ok:false,code:'master_not_saved'};
await ctx.flushStockMasterLinks();
assert.equal(calls.length,1);
assert.equal(JSON.parse(storage.getItem('zukait_stock_master_link_queue_v1:MGR1')).length,1,
 'unconfirmed master link must remain pending');
response={ok:true,linked:{linked:true}};
await ctx.flushStockMasterLinks();
assert.equal(calls.length,2);
assert.equal(JSON.parse(storage.getItem('zukait_stock_master_link_queue_v1:MGR1')).length,0,
 'confirmed link removed from retry queue');
assert.deepEqual(calls[1],{
 action:'consumables_stock',operation:'MASTER_LINK',
 materialId:'oil5w30',brandId:'brand1',origin:'Mechanical'
});
ctx.window.cloudQueueStockMasterLink({
 materialId:'oil5w30',brandId:'brand2',origin:'Mechanical'});
ctx.window.ZUKAIT_STOCK_MASTER_LINK_ENABLED=false;
await ctx.flushStockMasterLinks();
assert.equal(calls.length,2,'disabled-by-default stock link cannot make network calls');
ctx.window.ZUKAIT_STOCK_MASTER_LINK_ENABLED=true;
ctx.me={id:'S1',role:'Supervisor'};
assert.equal(ctx.window.cloudQueueStockMasterLink({
 materialId:'oil5w30',brandId:'brand3',origin:'Mechanical'}),false);
await ctx.flushStockMasterLinks();
assert.equal(calls.length,2,'Supervisor cannot link another Manager’s material queue');
ctx.me={id:'MGR1',role:'Manager'};
await ctx.flushStockMasterLinks();
assert.equal(calls.length,3,'Manager can resume the own small queue after reconnect');
assert.equal(calls[2].brandId,'brand2');
console.log('Master-to-Stock queue: saved-state barrier, tiny ID payloads, pending retries, actor isolation, default-off feature flags PASSED');
