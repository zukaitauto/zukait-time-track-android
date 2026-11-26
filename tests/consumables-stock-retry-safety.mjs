import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const tick=()=>new Promise(r=>setImmediate(r));
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}};
const stock=fs.readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8');
const mechanical=fs.readFileSync('app/src/main/assets/mechanical_consumables_ui.js','utf8');
const materials={materials:[{id:'oil',name:'Oil',department:'Both',unit:'Liter'}],brands:[{id:'b',name:'Brand'}],prices:[{materialId:'oil',brandId:'b'}]};
let serial=0;
function harness(source,store,actor,role='Manager'){
 const writes=[],nodes=new Map();let html='',mode='timeout';
 const field=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,textContent:'',innerHTML:'',style:{}});return nodes.get(id)};
 const win={localStorage:store,ZUKAIT_STOCK_ISOLATED_PILOT:true,ZUKAIT_MECHANICAL_STOCK_ENABLED:true,
  openModal(s){html=s},confirm:()=>true,alert(){},ZukaitConsumables:{ensureState:s=>s.consumables},
  zukaitCloud:{async stockRequest(req){
   if(req.operation==='LIST')return {ok:true,items:[{material_id:'oil',brand_id:'b',unit:'Liter',physical:10,reserved:0,initialised:true,stock_value:20,minimum:0}]};
   if(req.operation==='BALANCE')return {ok:true,item:{physical:10,reserved:0,unit:'Liter'}};
   if(req.operation==='WRITE'){
    writes.push(structuredClone(req));
    if(mode==='timeout')throw Error('network timeout after server commit');
    if(mode==='reject')return {ok:false,code:'insufficient_stock'};
    return {ok:true,receipt:{final:true,jobCard:req.data.jobCard,lineCount:req.data.lines?.length,totalCost:2}};
   }
   throw Error('unexpected '+req.operation);
  }}};
 const context={window:win,me:{id:actor,role},state:{consumables:structuredClone(materials)},document:{getElementById:field},navigator:{onLine:true},crypto:{randomUUID:()=> 'receipt-'+(++serial)},console};
 vm.runInNewContext(source,context);
 return {win,field,writes,html:()=>html,mode:v=>{mode=v}};
}
async function openStock(f){
 await f.win.openStockManagement();
 await f.win.zukStockNav('adjust');
 f.field('zs-item').value='oil|b';f.field('zs-count').value='7';f.field('zs-reason').value='Counted on shelf';
}
const st=storage(),a=harness(stock,st,'M1');await openStock(a);
a.win.zukStockSaveAdjustment();await tick();
assert.equal(a.writes.length,1);
assert.match(a.html(),/Retry original transaction/);
a.field('zs-count').value='8';a.win.zukStockSaveAdjustment();await tick();
assert.equal(a.writes.length,1,'changed payload must never generate a new write');
const b=harness(stock,st,'M1');await openStock(b);b.mode('success');
await b.win.zukStockRetryPending();assert.deepEqual(b.writes[0],a.writes[0],'reload must retain exact original request');
const other=harness(stock,st,'M2');await openStock(other);await other.win.zukStockRetryPending();assert.equal(other.writes.length,0);
const noStore=harness(stock,{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}},'M3');await openStock(noStore);
noStore.win.zukStockSaveAdjustment();await tick();assert.equal(noStore.writes.length,0,'storage failure must block write');
const c=harness(stock,st,'M1');await openStock(c);c.mode('reject');c.win.zukStockSaveAdjustment();await tick();
c.mode('success');c.field('zs-count').value='8';c.win.zukStockSaveAdjustment();await tick();assert.equal(c.writes.length,2);assert.notEqual(c.writes[0].requestId,c.writes[1].requestId,'definite first rejection permits correction');
const ms=storage(),m=harness(mechanical,ms,'M1');await m.win.openMechanicalConsumablesSection('issued');
m.field('mcConsMaterial').value='oil';m.field('mcConsBrand').value='b';m.field('mcConsQuantity').value='1.001';m.win.mechanicalConsumablesAddLine();
assert.match(m.field('mcConsDraft').innerHTML,/1\.001/,'valid four-place decimal accepted');
m.field('mcConsJc').value='MJC123';await m.win.mechanicalConsumablesSubmitIssue();assert.equal(m.writes.length,1);
m.win.openMechanicalConsumables();assert.match(m.html(),/Retry original issue/);
const m2=harness(mechanical,ms,'M1');m2.mode('success');m2.win.openMechanicalConsumables();await m2.win.mechanicalConsumablesRetryIssue();
assert.deepEqual(m2.writes[0],m.writes[0],'Mechanical reload retry uses original payload');
const m3=harness(mechanical,ms,'M2');await m3.win.mechanicalConsumablesRetryIssue();assert.equal(m3.writes.length,0);
console.log('PASS: owner-bound retry persistence, changed payload denial, storage failure, confirmed rejection, valid decimal and Mechanical replay');
