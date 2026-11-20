import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const screen=readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8');
const menu=readFileSync('app/src/main/assets/consumables_ui.js','utf8');
const host=readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.match(menu,/deptCard\('Stock','📦',true,'openStockManagement\(\)'\)/);
assert.match(host,/consumables_stock_ui\.js\?/);
assert.doesNotMatch(screen,/cloudScheduleSave|zukait_save_workshop_state|localStorage\.setItem/);
const calls=[];
let html='';
const materials=[{id:'m',name:'2K Primer',unit:'Liter',active:true}];
const brands=[{id:'b',name:'CAPSI',active:true}];
const w={
 openModal(s){html=s},
 zukaitCloud:{async stockRequest(x){calls.push(x);
   if(x.operation==='LIST')return {ok:true,items:[{material_id:'m',brand_id:'b',unit:'Liter',
      physical:4,reserved:1,stock_value:22,minimum:5}],hasMore:false};
   if(x.operation==='HISTORY')return {ok:true,history:[{id:1,material_id:'m',brand_id:'b',action:'PURCHASE',
      physical_delta:4,reserved_delta:0,cost_delta:22,recorded_at:'2026-11-20T00:00:00Z'}],hasMore:false};
   return {ok:false,code:'stock_write_not_enabled'};
 }},
 ZukaitConsumables:{ensureState(s){return s.consumables}}
};
const ctx={window:w,me:{id:'M',role:'Manager'},state:{consumables:{materials,brands}},
 navigator:{onLine:true},console,crypto:{randomUUID:()=> 'request-id'}};
runInNewContext(screen,ctx);
await w.openStockManagement();
for(const label of ['Stock Balance','Add Stock','Stock History','Stock Adjustment','Stock Reports'])assert.ok(html.includes(label),label);
assert.ok(html.includes('2K Primer'));
assert.equal(calls.length,1);
assert.equal(calls[0].operation,'LIST');assert.equal(calls[0].page,0);
await w.zukStockNav('history');
assert.ok(html.includes('PURCHASE'));
assert.equal(calls[1].operation,'HISTORY');
await w.zukStockNav('reports');
assert.match(html,/current-balance preview/i);
await w.zukStockNav('add');
assert.match(html,/Total Purchase Price/);
assert.match(html,/Opening Stock/);
await w.zukStockNav('adjust');
assert.match(html,/Manager Stock Adjustment/);
w.zukStockDetail('m|b');
assert.match(html,/Average cost/);
assert.equal(calls.length,2,'navigation uses cached balances and bounded history, not repeated full sync');
console.log('Stock UI: all 5 menus clickable, brand details, bounded loads, no snapshot saving PASSED');
