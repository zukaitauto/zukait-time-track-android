import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const calls=[];
let html='';
const fields={};
const window={
  location:{search:'?stockPilot=1'},
  ZUKAIT_STOCK_UI_PREVIEW_ONLY:true,
  ZUKAIT_STOCK_ISOLATED_PILOT:true,
  openModal(value){html=value;},
  ZukaitConsumables:{ensureState(state){return state.consumables;}},
  zukaitCloud:{async stockRequest(command){
    calls.push(command);
    if(command.operation==='LIST')return {ok:true,items:[{
      material_id:'oil',brand_id:'brand',unit:'Liter',physical:10,reserved:3,
      stock_value:25,minimum:8
    }]};
    if(command.operation==='HISTORY')return {ok:true,history:[]};
    if(command.operation==='REPORTS')return {ok:true,report:{valuation:90,items:104,low:2,out:1}};
    if(command.operation==='WRITE')return {ok:true};
    throw Error('Unexpected operation');
  }}
};
const context={
  window,URLSearchParams,navigator:{onLine:true},
  document:{getElementById:id=>fields[id]},
  me:{id:'manager',role:'Manager'},
  state:{consumables:{materials:[{id:'oil',name:'Oil'}],brands:[{id:'brand',name:'Brand'}]}}
};
runInNewContext(readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8'),context);
await window.openStockManagement();
assert.match(html,/7\.00 Liter/);
assert.match(html,/Average 2\.500 OMR/);
assert.match(html,/Low stock/);
await window.zukStockNav('history');
assert.match(html,/Stock History/);
await window.zukStockNav('reports');
assert.match(html,/90\.000 OMR/);
assert.match(html,/>104</);
await window.zukStockNav('add');
for(const [key,value] of Object.entries({material:'oil',brand:'brand',qty:'2',method:'total',price:'10',entrytype:'PURCHASE'}))fields['zs-'+key]={value};
window.zukStockSavePurchase();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(calls.find(x=>x.operation==='WRITE').command,'PURCHASE');
await window.zukStockNav('adjust');
for(const [key,value] of Object.entries({item:'oil|brand',count:'8',reason:'Counted on shelf'}))fields['zs-'+key]={value};
window.zukStockSaveAdjustment();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(calls.filter(x=>x.operation==='WRITE').at(-1).command,'ADJUST');
assert.equal(calls.filter(x=>x.operation==='WRITE').at(-1).data.countedQuantity,8);
for (const department of ['Painting','Mechanical']) {
  await window.openStockManagement(department);
  assert.equal(calls.at(-1).department,department);
  await window.zukStockNav('history');
  assert.equal(calls.at(-1).department,department);
  await window.zukStockNav('reports');
  assert.equal(calls.at(-1).department,department);
  await window.zukStockNav('add');
  assert.match(html, /<option value="oil" selected>Oil<\/option>/);
  assert.match(html, /<option value="brand">Brand<\/option>/);
}
const [paintPairs, paintRepeat]=await Promise.all([
  window.zukaitStockPickerPairs('Painting'),window.zukaitStockPickerPairs('Painting')
]);
assert.equal(paintPairs,paintRepeat);
assert.ok(paintPairs.has(JSON.stringify(['oil','brand'])));
assert.equal(calls.at(-1).department,'Painting');
await window.zukaitStockPickerPairs('Mechanical');
assert.equal(calls.at(-1).department,'Mechanical');
window.location.search='';
assert.equal(await window.zukaitStockPickerPairs('Painting'),null);
console.log('Controlled stock UI: all five screens, stock math, report totals and stock commands passed');
