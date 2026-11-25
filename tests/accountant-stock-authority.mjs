import assert from 'node:assert/strict';
import {consumablesStockApi as api} from '../supabase/functions/workshop-api/extensions/consumables_stock_api.js';
const A={role:'Accountant',id:'accountant'},calls=[];
const opts={enabled:true,writesEnabled:true,invoiceEnabled:true,sessionHash:'synthetic'};
const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name.endsWith('_list')?[]:{id:'invoice',final:true},error:null}}};
for(const [operation,command] of [['WRITE','PURCHASE'],['WRITE','ADJUST'],['WRITE','RESERVE'],['WRITE','FINALISE'],['WRITE','MECHANICAL_ISSUE'],['WRITE','RETURN'],['WRITE','MINIMUM'],['INVOICE_CANCEL'],['MASTER_LINK'],['LEGACY_PREVIEW'],['RESERVATIONS']]){
 const n=calls.length;assert.equal((await api(db,A,{operation,...(command?{command}:{}),requestId:'test',data:{}},opts)).status,403,operation+' '+command);assert.equal(calls.length,n);
}
for(const [operation,command] of [['WRITE','OPENING'],['INVOICE_SAVE'],['INVOICE_CORRECT_HEADER'],['INVOICE_CORRECT_LINES'],['INVOICE_LIST'],['INVOICE_AUDIT']]){
 const data=operation==='INVOICE_AUDIT'?{invoiceId:'00000000-0000-4000-8000-000000000001'}:{};
 const result=await api(db,A,{operation,...(command?{command}:{}),requestId:'test',data},opts);
 assert.equal(result.status,200,operation+': '+JSON.stringify(result));
 assert.equal(calls.at(-1).args.p_session_hash,'synthetic');
}
assert.equal((await api(db,A,{operation:'WRITE',command:'OPENING',requestId:'x',data:{}},{...opts,sessionHash:''})).status,401);
for(const role of ['Employee','Purchaser','Receptionist'])assert.equal((await api(db,{role},{operation:'INVOICE_SAVE',requestId:'x',data:{}},opts)).status,403);
assert.equal((await api(db,A,{operation:'INVOICE_SAVE',requestId:'x',data:{}},{...opts,invoiceEnabled:false})).status,423);
console.log('PASS Accountant narrow entry/edit/audit authorization, session identity and disabled writes; no workshop issue or manager-only access');
