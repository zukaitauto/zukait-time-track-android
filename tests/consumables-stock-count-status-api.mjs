import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {consumablesStockApi} from '../supabase/functions/workshop-api/extensions/consumables_stock_api.js';

const reads=[];
const admin={from(table){
 assert.equal(table,'zukait_stock_balances');
 const q={
  select(columns){reads.push(columns);return q},
  order(){return q},eq(){return q},
  range(){return Promise.resolve({data:[{
   material_id:'m1',brand_id:'b1',physical:0,reserved:0,
   stock_value:0,minimum:0,unit:'Liter',initialised:false
  }],error:null})},
  maybeSingle(){return Promise.resolve({data:{
   material_id:'m1',brand_id:'b1',physical:0,reserved:0,
   stock_value:0,minimum:0,unit:'Liter',initialised:false
  },error:null})}
 };
 return q;
}};
const manager={role:'Manager',id:'qa'};
let result=await consumablesStockApi(admin,manager,{operation:'LIST',page:0},{enabled:true});
assert.equal(result.status,200);
assert.equal(reads.at(-1).includes('initialised'),false,
 'Default-off flag must not query an uninstalled database column');
result=await consumablesStockApi(admin,manager,{operation:'LIST',page:0},
 {enabled:true,countStatusEnabled:true});
assert.equal(result.status,200);
assert.ok(reads.at(-1).includes('initialised'),
 'Approved migration enables count-state selection from Stock balances');
assert.equal(result.body.items[0].initialised,false,
 'A zero placeholder remains uncounted when the database explicitly says false');
result=await consumablesStockApi(admin,manager,
 {operation:'BALANCE',materialId:'m1',brandId:'b1'},
 {enabled:true,countStatusEnabled:true});
assert.equal(result.status,200);
assert.ok(reads.at(-1).includes('initialised'));
const index=readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(index,/countStatusEnabled:Deno\.env\.get\('ZUKAIT_STOCK_COUNT_STATUS_READS_ENABLED'\)==='true'/);
const migration=readFileSync('supabase/staged/CONSUMABLES_STOCK_COUNT_STATUS_V416.sql','utf8');
assert.match(migration,/add column if not exists initialised boolean not null default false/i);
assert.match(migration,/m\.action in/);
assert.doesNotMatch(migration,/update public\.workshop_state|delete from public\.zukait_stock_movements/i);
console.log('PASS: Stock count-state reads remain off before migration; once enabled return explicit count metadata, never fabricate it from Master prices');
