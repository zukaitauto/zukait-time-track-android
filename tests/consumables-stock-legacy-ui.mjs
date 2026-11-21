import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8');
function fixture(role='Manager'){
 const calls=[],selects=new Map();
 let html='';
 const stock={
  async stockRequest(body){
   calls.push({...body});
   if(body.operation==='LIST')return {ok:true,items:[],hasMore:false};
   if(body.operation==='LEGACY_PREVIEW'){
     const rows=body.page===0?[
       {materialId:'oil5w30',name:'Engine Oil 5W-30',brandId:'a',
        brand:'Brand A',unit:'Liter',category:'Consumable',department:'Unassigned',linked:false},
       {materialId:'primer',name:'Primer',brandId:'b',
        brand:'Brand B',unit:'Liter',category:'Paint',department:'Unassigned',linked:false}
     ]:[{materialId:'oil5w40',name:'Engine Oil 5W-40',brandId:'a',
        brand:'Brand A',unit:'Liter',category:'Consumable',department:'Unassigned',linked:false}];
     return {ok:true,preview:{readOnly:true,items:rows,page:body.page,hasMore:body.page===0}};
   }
   if(body.operation==='MASTER_LINK')
     return {ok:true,linked:{linked:true,materialId:body.materialId,brandId:body.brandId}};
   throw Error('Unexpected request '+body.operation);
  }
 };
 const ctx={
  me:{id:'Manager01',role},
  state:{consumables:{materials:[],brands:[]}},
  navigator:{onLine:true},
  window:{openModal:markup=>{html=markup},zukaitCloud:stock,
    ZukaitConsumables:{ensureState:s=>s.consumables}},
  document:{getElementById:id=>({value:selects.get(id)||''})},
  console
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,w:ctx.window,calls,selects,html:()=>html};
}
const a=fixture();
await a.w.openStockManagement();
assert.match(a.html(),/Review Older Materials/);
assert.equal(a.calls.length,1);
await a.w.zukStockLegacyReview();
assert.match(a.html(),/Engine Oil 5W-30/);
assert.match(a.html(),/Primer/);
assert.match(a.html(),/Choose department/);
assert.match(a.html(),/Next 20/);
assert.equal(a.calls[1].operation,'LEGACY_PREVIEW');
assert.equal(a.calls[1].page,0);
await a.w.zukStockLegacyLink(0);
assert.match(a.html(),/Choose Mechanical, Painting or Both/);
assert.equal(a.calls.length,2,'no implicit department assignment');
a.selects.set('zs-legacy-origin-0','Mechanical');
await a.w.zukStockLegacyLink(0);
assert.equal(a.calls[2].operation,'MASTER_LINK');
assert.deepEqual(a.calls[2],{
 operation:'MASTER_LINK',materialId:'oil5w30',brandId:'a',origin:'Mechanical'
});
assert.equal(a.calls[3].operation,'LEGACY_PREVIEW','only current page reread after mapping');
a.selects.set('zs-legacy-origin-1','Both');
await a.w.zukStockLegacyLink(1);
assert.equal(a.calls.length,4,'Paint-category materials are never linked as Both');
assert.match(a.html(),/Paint category is Painting only/);
a.selects.set('zs-legacy-origin-1','Painting');
await a.w.zukStockLegacyLink(1);
assert.equal(a.calls[4].origin,'Painting');
await a.w.zukStockLegacyPage(1);
assert.match(a.html(),/Engine Oil 5W-40/);
assert.doesNotMatch(a.html(),/Primer/);
assert.match(a.html(),/Previous/);
assert.equal(a.calls.at(-1).page,1);
assert.equal(a.calls.filter(x=>x.operation==='WRITE').length,0,'baseline mapping makes no issue or purchase');
const other=fixture('Supervisor');
await other.w.openStockManagement();
assert.doesNotMatch(other.html(),/Review Older Materials/);
await other.w.zukStockLegacyReview();
assert.equal(other.calls.filter(x=>x.operation==='LEGACY_PREVIEW').length,0);
console.log('Stock legacy UI: Manager-only review, explicit one-by-one mapping, Paint protection, pagination and no stock writes PASS');
