import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8');
const master={materials:[
 {id:'p1',name:'Clear',unit:'Liter',department:'Painting',active:true},
 {id:'p2',name:'Thinner',unit:'Liter',active:true}, // historic unassigned => Paint
 {id:'p3',name:'Unpriced Primer',unit:'Liter',department:'Painting',active:true},
 {id:'both',name:'Shared Cleaner',unit:'Liter',department:'Both',active:true},
 {id:'mech',name:'Brake Fluid',unit:'Liter',department:'Mechanical',active:true}
],brands:[{id:'a',name:'Alpha',active:true},{id:'b',name:'Bravo',active:true}],
prices:[
 {materialId:'p1',brandId:'a',pricePerUnit:2,voided:false},
 {materialId:'p2',brandId:'b',pricePerUnit:3,voided:false},
 {materialId:'p2',brandId:'b',pricePerUnit:4,voided:false}, // one pair, multiple periods
 {materialId:'both',brandId:'a',pricePerUnit:5,voided:false},
 {materialId:'mech',brandId:'a',pricePerUnit:7,voided:false}
]};
function fixture(role='Manager',paged=false){
 const requests=[];let html='';const win={
  openModal(markup){html=markup},
  ZukaitConsumables:{ensureState(state){return state.consumables}},
  zukaitCloud:{async stockRequest(request){
   requests.push(request);
   if(request.operation!=='LIST')throw Error('Unexpected Stock operation '+request.operation);
   if(request.department==='Mechanical')return {ok:true,hasMore:false,items:[]};
   if(paged&&request.page===1)return {ok:true,hasMore:false,items:[{
    material_id:'p2',brand_id:'b',unit:'Liter',physical:0,reserved:0,stock_value:0,minimum:0}]};
   return {ok:true,hasMore:paged,items:[{
    material_id:'p1',brand_id:'a',unit:'Liter',physical:7,reserved:2,stock_value:14,minimum:1}]};
  }}
 };
 const ctx={window:win,me:{id:role,role},state:{consumables:structuredClone(master)},
   navigator:{onLine:true},document:{getElementById:()=>null},console};
 runInNewContext(source,ctx);
 return {win,requests,html:()=>html};
}
const manager=fixture();
await manager.win.openStockManagement('Painting');
const shown=manager.html();
assert.match(shown,/Stock Balance &amp; Material Master/);
assert.match(shown,/Clear — Alpha/);
assert.match(shown,/7.00 Liter/);
assert.match(shown,/5.00 Liter/,'Physical minus reserved from stock ledger only');
assert.match(shown,/Thinner — Bravo/);
assert.match(shown,/Shared Cleaner — Alpha/,'Shared Master item visible in Paint');
assert.match(shown,/Not linked/);
assert.match(shown,/Stock quantity not recorded/,'Unlinked quantity must not be fabricated as zero');
assert.match(shown,/Brand &amp; Price needed/,'Unpriced material has separate status');
assert.match(shown,/Unpriced Primer/);
assert.doesNotMatch(shown,/Brake Fluid/,'Mechanical-only item must not leak into Painting');
assert.equal((shown.match(/data-balance-kind="unlinked"/g)||[]).length,2);
assert.equal((shown.match(/data-balance-kind="linked"/g)||[]).length,1);
assert.equal((shown.match(/data-balance-kind="unpriced"/g)||[]).length,1);
assert.match(shown,/Needs linking<\/div><b>2<\/b>/);
assert.match(shown,/Review &amp; Link/);
assert.deepEqual(requestsToStrings(manager.requests),['LIST:Painting:0']);
const supervisor=fixture('Supervisor');
await supervisor.win.openStockManagement('Painting');
assert.match(supervisor.html(),/Thinner — Bravo/);
assert.doesNotMatch(supervisor.html(),/zs-link-action|zs-master-price-action/,
 'Supervisor sees unlinked Master names but no Manager linking actions');
const mechanical=fixture();
await mechanical.win.openStockManagement('Mechanical');
assert.match(mechanical.html(),/Brake Fluid — Alpha/);
assert.match(mechanical.html(),/Shared Cleaner — Alpha/);
assert.doesNotMatch(mechanical.html(),/Clear — Alpha|Thinner — Bravo/);
const paged=fixture('Manager',true);
await paged.win.openStockManagement('Painting');
assert.match(paged.html(),/Link status not checked/);
assert.doesNotMatch(paged.html(),/class="zs-btn secondary zs-link-action"/,
 'Incomplete ledger pages must not assert a Master pair is unlinked');
await paged.win.zukStockMore();
assert.match(paged.html(),/Thinner — Bravo/);
assert.equal((paged.html().match(/data-balance-kind="linked"/g)||[]).length,2,
 'Pair present on later Stock page must deduplicate Master overlay');
assert.equal((paged.html().match(/data-balance-kind="unlinked"/g)||[]).length,1,
 'Only truly unlinked pair remains after loading all pages');
for(const fx of [manager,supervisor,mechanical,paged])
 assert.equal(fx.requests.some(x=>x.operation==='WRITE'||x.operation==='MASTER_LINK'),false,
  'Displaying Master list never writes stock or automatically links materials');
function requestsToStrings(calls){return calls.map(x=>x.operation+':'+x.department+':'+x.page)}
console.log('PASS Stock Balance Master overlay: linked and unlinked pairs, unpriced materials, scopes, pagination, Manager-only actions, no invented quantities or writes');
