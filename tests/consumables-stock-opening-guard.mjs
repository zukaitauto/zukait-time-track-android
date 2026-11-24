import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const screen=readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(role='Manager',linked=true){
 const calls=[],fields=new Map(),m=id=>{
  if(!fields.has(id))fields.set(id,{value:'',checked:false,textContent:'',style:{}});
  return fields.get(id);
 };
 let html='';
 const ctx={
  me:{id:'M',role},state:{consumables:{
   materials:[{id:'oil',name:'Engine Oil 5W-30',unit:'Liter',active:true}],
   brands:[{id:'b',name:'Brand A',active:true}]
  }},
  window:{
   openModal(s){html=s},
   ZukaitConsumables:{ensureState(s){return s.consumables}},
   zukaitCloud:{async stockRequest(req){
    calls.push(req);
    if(req.operation==='LIST')
     return {ok:true,items:linked?[{material_id:'oil',brand_id:'b',physical:0,reserved:0,
       unit:'Liter',stock_value:0,minimum:0}]:[],hasMore:false};
    if(req.operation==='LEGACY_PREVIEW')
     return {ok:true,preview:{readOnly:true,items:[],hasMore:false}};
    if(req.operation==='WRITE')
     return {ok:true,receipt:{final:true,requestId:req.requestId}};
    throw Error('unrecognized stock operation');
   }}
  },
  navigator:{onLine:true},
  document:{getElementById:m},
  crypto:{randomUUID:()=> 'opening-test-request-id'},
  console
 };
 runInNewContext(screen,ctx);
 return {ctx,w:ctx.window,calls,m,html:()=>html};
}
const a=fixture();
await a.w.openStockManagement();
await a.w.zukStockNav('add');
assert.match(a.html(),/Opening Stock \(one time only\)/);
assert.match(a.html(),/id="zs-opening-fields"/);
assert.doesNotMatch(a.html(),/id="zs-qty"[^>]+value="5"/,
 'No default quantity may be mistaken for physical stock count');
assert.doesNotMatch(a.html(),/id="zs-price"[^>]+value="30"/,
 'No example purchase price may be submitted by accident');
a.m('zs-material-brand-search').value='Engine Oil 5W-30 — Brand A';
a.w.zukStockResolvePair();
a.m('zs-entrytype').value='OPENING';
a.m('zs-method').value='unit';
a.m('zs-qty').value='4';
a.m('zs-price').value='5';
a.w.zukStockSetEntryType();
assert.equal(a.m('zs-opening-fields').style.display,'block');
assert.equal(a.m('zs-save-entry').textContent,'Confirm Opening Stock');
a.w.zukStockSavePurchase();await tick();
assert.equal(a.calls.filter(x=>x.operation==='WRITE').length,0,
 'No stock write when physical count checkbox is not confirmed');
a.m('zs-count-confirmed').checked=true;
a.m('zs-opening-note').value='bad';
a.w.zukStockSavePurchase();await tick();
assert.equal(a.calls.filter(x=>x.operation==='WRITE').length,0,
 'No stock write without meaningful count reference');
a.m('zs-opening-note').value='Verified count in store, 21 November';
a.w.zukStockSavePurchase();await tick();
const writes=a.calls.filter(x=>x.operation==='WRITE');
assert.equal(writes.length,1,'exactly one explicit opening write');
assert.equal(writes[0].command,'OPENING');
assert.equal(writes[0].data.materialId,'oil');
assert.equal(writes[0].data.brandId,'b');
assert.equal(writes[0].data.quantity,4);
assert.equal(writes[0].data.unitCost,5);
assert.equal(writes[0].data.countConfirmed,true);
assert.equal(writes[0].data.reason,'Verified count in store, 21 November');
const sup=fixture('Supervisor');
await sup.w.openStockManagement();
await sup.w.zukStockNav('add');
assert.doesNotMatch(sup.html(),/Opening Stock \(one time only\)/,
 'Bodyshop Supervisor has no Opening Stock button');
sup.m('zs-material-brand-search').value='Engine Oil 5W-30 — Brand A';
sup.w.zukStockResolvePair();
sup.m('zs-qty').value='4';
sup.m('zs-method').value='unit';
sup.m('zs-price').value='5';
sup.m('zs-entrytype').value='OPENING';
sup.w.zukStockSavePurchase();await tick();
assert.equal(sup.calls.filter(x=>x.command==='OPENING').length,0,
 'Supervisor cannot elevate their purchase to an opening stock request');
const empty=fixture('Manager',false);
await empty.w.openStockManagement('Painting');
await empty.w.zukStockNav('add');
assert.match(empty.html(),/No linked material and brand pairs/);
assert.match(empty.html(),/Review &amp; Link Existing Materials/,
 'Manager gets direct audited link shortcut when there is no Stock catalog');
assert.match(empty.html(),/id="zs-material-brand-search"[^>]*placeholder="Link a material \+ brand first"[^>]*disabled/,
 'Empty catalog must display a disabled material search field');
empty.m('zs-material-brand-search').value='Clear';
empty.w.zukStockSavePurchase();
await tick();
assert.equal(empty.calls.filter(x=>x.operation==='WRITE').length,0,
 'Typing a legacy material cannot create unlinked inventory');
await empty.w.zukStockLegacyReview();
assert.equal(empty.calls.at(-1).operation,'LEGACY_PREVIEW');
assert.match(empty.html(),/Return to Add Stock/);
assert.equal(empty.calls.filter(x=>x.operation==='MASTER_LINK').length,0,
 'Opening review is read-only; linking must require a separate explicit action');
const emptySupervisor=fixture('Supervisor',false);
await emptySupervisor.w.openStockManagement('Painting');
await emptySupervisor.w.zukStockNav('add');
assert.doesNotMatch(emptySupervisor.html(),/Review &amp; Link Existing Materials/,
 'Supervisor cannot see Manager-only master link action');
console.log('Opening stock UI: Manager empty-catalog review route, no fabricated links or writes, role safety, physical count guard PASS');
