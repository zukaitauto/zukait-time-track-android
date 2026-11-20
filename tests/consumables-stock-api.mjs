import assert from 'node:assert/strict';
import { consumablesStockApi } from '../supabase/functions/workshop-api/extensions/consumables_stock_api.js';

let requests=[];
const admin={
 from(table){
   requests.push({type:'read',table});
   const q={
     select(cols){q.columns=cols;return q},order(){return q},eq(){return q},lt(){return q},
     range(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:{material_id:'oil5w30',brand_id:'brandA',unit:'Liter',physical:10,reserved:2},error:null})},
     then(resolve,reject){return Promise.resolve({data:table==='zukait_stock_balances'?
       (q.columns?.includes('material:zukait_stock_material_keys')?[
         {material_id:'oil',brand_id:'a',unit:'Liter',physical:20,reserved:1,
           material:{display_name:'Engine Oil 5W-30',department:'Mechanical',active:true},
           brand:{display_name:'Brand A',active:true}},
         {material_id:'primer',brand_id:'b',unit:'Liter',physical:3,reserved:0,
           material:{display_name:'Primer',department:'Painting',active:true},
           brand:{display_name:'Brand B',active:true}},
         {material_id:'inactive',brand_id:'c',unit:'Piece',physical:3,reserved:0,
           material:{display_name:'WD-40',department:'Mechanical',active:false},
           brand:{display_name:'Brand C',active:true}}
       ]:Array.from({length:101},(_,i)=>({material_id:'m'+i,brand_id:'b'}))):
       table==='zukait_stock_movements'?Array.from({length:51},(_,i)=>({id:300-i})):
       [],error:null}).then(resolve,reject)}
   };return q;
 },
 async rpc(fn,args){requests.push({type:'write',fn,args});return {data:{ok:true},error:null}}
};
const M={role:'Manager',id:'m'},S={role:'Supervisor',id:'s'},E={role:'Employee',id:'e'};
let r=await consumablesStockApi(admin,E,{operation:'LIST'},{enabled:true});
assert.equal(r.status,403);assert.equal(requests.length,0);
r=await consumablesStockApi(admin,M,{operation:'LIST'},{enabled:false});
assert.equal(r.status,503);assert.equal(requests.length,0);
r=await consumablesStockApi(admin,S,{operation:'LIST'},{enabled:true});
assert.equal(r.body.items.length,100);assert.equal(r.body.hasMore,true);
r=await consumablesStockApi(admin,S,{operation:'HISTORY'},{enabled:true});
assert.equal(r.body.history.length,50);assert.equal(r.body.hasMore,true);
r=await consumablesStockApi(admin,S,{operation:'WRITE',command:'PURCHASE',
 requestId:'one',data:{materialId:'m',brandId:'b',quantity:1,price:2,priceMethod:'unit'}},{enabled:true});
assert.equal(r.status,423);
r=await consumablesStockApi(admin,S,{operation:'WRITE',command:'ADJUST',requestId:'two',data:{}},
 {enabled:true,writesEnabled:true,sessionHash:'hash'});
assert.equal(r.status,403);
r=await consumablesStockApi(admin,M,{operation:'WRITE',command:'PURCHASE',
 requestId:'idem-1',data:{materialId:'m',brandId:'b',quantity:1,price:2,priceMethod:'total'}},
 {enabled:true,writesEnabled:true,sessionHash:'test-session-hash'});
assert.equal(r.status,200);
const write=requests.filter(x=>x.type==='write').at(-1);
assert.equal(write.fn,'zukait_stock_command');
assert.equal(write.args.p_session_hash,'test-session-hash');
assert.equal(write.args.p_request_id,'idem-1');
r=await consumablesStockApi(admin,M,{operation:'LIST',actorRole:'Manager'},{enabled:true});
assert.equal(r.status,400,'client cannot provide arbitrary actor role');
r=await consumablesStockApi(admin,M,{operation:'HISTORY',cursor:'not-valid'},{enabled:true});
assert.equal(r.status,400);
const MS={role:'Mechanical Supervisor',id:'ms'};
r=await consumablesStockApi(admin,MS,{operation:'CATALOG',page:0},{enabled:true});
assert.equal(r.status,200);
assert.equal(r.body.items.length,1,'Mechanical catalog excludes Painting and inactive materials');
assert.equal(r.body.items[0].name,'Engine Oil 5W-30');
assert.equal(r.body.items[0].brand,'Brand A');
assert.equal(r.body.items[0].physical-r.body.items[0].reserved,19);
assert.equal(requests.filter(x=>x.type==='read'&&x.table==='workshop_state').length,0,
 'Mechanical catalog must not fetch workshop-state snapshots');

const mechanical={operation:'WRITE',command:'MECHANICAL_ISSUE',requestId:'issue-1',
 data:{jobCard:'JC12500',lines:[{materialId:'oil5w30',brandId:'brandA',quantity:4.5}]}};
r=await consumablesStockApi(admin,MS,{operation:'BALANCE',materialId:'oil5w30',brandId:'brandA'},{enabled:true});
assert.equal(r.status,200);
assert.equal(r.body.item.material_id,'oil5w30');
assert.equal(r.body.item.physical-r.body.item.reserved,8);
r=await consumablesStockApi(admin,MS,{operation:'BALANCE',materialId:'not valid',brandId:'brandA'},{enabled:true});
assert.equal(r.status,400);
const countWrites=()=>requests.filter(x=>x.type==='write').length;
const earlier=countWrites();
r=await consumablesStockApi(admin,MS,mechanical,
 {enabled:true,writesEnabled:true,sessionHash:'mechanical-session'});
assert.equal(r.status,423,'Mechanical issue has an independent default-off flag');
assert.equal(countWrites(),earlier);
r=await consumablesStockApi(admin,S,mechanical,
 {enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'bodyshop-session'});
assert.equal(r.status,403,'Bodyshop Supervisor cannot issue Mechanical materials');
assert.equal(countWrites(),earlier);
r=await consumablesStockApi(admin,MS,{...mechanical,command:'PURCHASE'},
 {enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'mechanical-session'});
assert.equal(r.status,403,'Mechanical Supervisor cannot change general stock purchases');
r=await consumablesStockApi(admin,MS,mechanical,
 {enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'mechanical-session'});
assert.equal(r.status,200);
const finalWrite=requests.filter(x=>x.type==='write').at(-1);
assert.equal(finalWrite.fn,'zukait_stock_mechanical_issue');
assert.equal(finalWrite.args.p_session_hash,'mechanical-session');
assert.deepEqual(finalWrite.args.p_data,mechanical.data);
assert.equal(Object.hasOwn(finalWrite.args,'p_action'),false);
r=await consumablesStockApi(admin,M,mechanical,
 {enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'manager-session'});
assert.equal(r.status,200);

console.log('Stock API: role denial, disabled-by-default flags, paginated reads and receipt write and Mechanical issue guards PASSED');
