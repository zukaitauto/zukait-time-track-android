import assert from 'node:assert/strict';
import { consumablesStockApi } from '../supabase/functions/workshop-api/extensions/consumables_stock_api.js';

let requests=[];
const admin={
 from(table){
   requests.push({type:'read',table});
   const q={
     select(){return q},order(){return q},eq(){return q},lt(){return q},
     range(){return q},limit(){return q},
     then(resolve,reject){return Promise.resolve({data:table==='zukait_stock_balances'?
       Array.from({length:101},(_,i)=>({material_id:'m'+i,brand_id:'b'})):
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
console.log('Stock API: role denial, disabled-by-default flags, paginated reads and receipt write PASSED');
