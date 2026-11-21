import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const stock=readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8');
const html=readFileSync('app/src/main/assets/offline_test.html','utf8');
const menu=readFileSync('app/src/main/assets/consumables_ui.js','utf8');
const mech=readFileSync('app/src/main/assets/mechanical_consumables_ui.js','utf8');
assert.ok(html.includes('<script>window.ZUKAIT_STOCK_UI_PREVIEW_ONLY=true;</script><script src="consumables_stock_ui.js'),
 'Main app must set Stock preview mode BEFORE loading Stock screen');
assert.match(menu,/openStockManagement\(\)/);
assert.match(menu,/openMechanicalConsumables\(\)/);
assert.match(mech,/window\.ZUKAIT_MECHANICAL_STOCK_ENABLED===true/);
assert.doesNotMatch(html,/window\.ZUKAIT_MECHANICAL_STOCK_ENABLED\s*=\s*true/,
 'Mechanical issuing must not be enabled by main app');

let htmlOut='',calls=[];
const fields={};
const ctx={
 me:{id:'M',role:'Manager'},
 state:{consumables:{
  materials:[
   {id:'m1',name:'2K Primer',unit:'Liter',active:true},
   {id:'m2',name:'Water Paper 800',unit:'Piece',active:true}
  ],
  brands:[{id:'b1',name:'CAPSI',active:true},{id:'b2',name:'MILACO',active:true}],
  prices:[{materialId:'m1',brandId:'b1',price:9.2},
          {materialId:'m1',brandId:'b2',price:10.8}]
 }},
 document:{getElementById:id=>fields[id]||null},
 window:{
  ZUKAIT_STOCK_UI_PREVIEW_ONLY:true,
  openModal(x){htmlOut=x;},
  zukaitCloud:{async stockRequest(x){calls.push(x);throw Error('Preview must not query stock');}},
  ZukaitConsumables:{ensureState(x){return x.consumables;}}
 },
 navigator:{onLine:true},console
};
runInNewContext(stock,ctx);

await ctx.window.openStockManagement();
assert.match(htmlOut,/Consumables Stock Management/);
for(const tab of ['Stock Balance','Add Stock','Stock History','Stock Adjustment','Stock Reports'])
 assert.ok(htmlOut.includes(tab),'Missing agreed clickable dashboard box '+tab);
assert.match(htmlOut,/zs-home-grid/);
assert.doesNotMatch(htmlOut,/2K Primer/,'Main Stock menu must not display material data');
assert.doesNotMatch(htmlOut,/Not initialized/,'Main Stock menu must not show stock metrics');
assert.doesNotMatch(htmlOut,/<table aria-label="Stock Balance preview">/);
await ctx.window.zukStockPreviewNavigate('balance');
assert.match(htmlOut,/← Stock Menu/);
assert.match(htmlOut,/2K Primer/);
assert.match(htmlOut,/CAPSI/);
assert.match(htmlOut,/MILACO/);
assert.match(htmlOut,/Water Paper 800/);
assert.match(htmlOut,/Not assigned/);
assert.match(htmlOut,/Not initialized/);
assert.match(htmlOut,/Avg. Cost \/ Unit/);
assert.match(htmlOut,/Reserved for Job Cards/);
assert.match(htmlOut,/Supervisor · Suggest Material/);
assert.match(htmlOut,/Return Unused Material/);
assert.match(htmlOut,/Apply filter/);
assert.doesNotMatch(htmlOut,/>248\.50</);
assert.doesNotMatch(htmlOut,/>212\.50</);
assert.doesNotMatch(htmlOut,/OMR 9\.2/,'Master prices are not stock valuation');
assert.equal(calls.length,0);

await ctx.window.zukStockNav('add');
assert.match(htmlOut,/Add Stock — Preview/);
assert.match(htmlOut,/Total Purchase Price/);
assert.match(htmlOut,/Price per Unit/);
assert.match(htmlOut,/No tins or drums conversion/);
assert.match(htmlOut,/Save Stock — Not Active/);
assert.match(htmlOut,/disabled/);
fields['zs-preview-qty']={value:'20'};
fields['zs-preview-price']={value:'120'};
fields['zs-preview-method']={value:'total'};
fields['zs-preview-calculated']={textContent:''};
ctx.window.zukStockPreviewPrice();
assert.match(fields['zs-preview-calculated'].textContent,/6\.000 OMR/);
assert.match(fields['zs-preview-calculated'].textContent,/120\.000 OMR/);
fields['zs-preview-method'].value='unit';
fields['zs-preview-price'].value='6';
ctx.window.zukStockPreviewPrice();
assert.match(fields['zs-preview-calculated'].textContent,/120\.000 OMR/);
ctx.window.zukStockSavePurchase();
assert.equal(calls.length,0);

await ctx.window.zukStockNav('history');
assert.match(htmlOut,/No stock ledger is active/);
await ctx.window.zukStockNav('adjust');
assert.match(htmlOut,/New physical count/);
assert.match(htmlOut,/Save Adjustment — Not Active/);
ctx.window.zukStockSaveAdjustment();
assert.equal(calls.length,0);

await ctx.window.zukStockNav('reports');
assert.match(htmlOut,/Current stock valuation/);
assert.match(htmlOut,/Not initialized/);
assert.match(htmlOut,/Print \/ PDF — Not Active/);

await ctx.window.zukStockPreviewNavigate('suggest');
assert.match(htmlOut,/Supervisor — Suggest Material/);
assert.match(htmlOut,/weighted-average unit cost will lock/);
assert.match(htmlOut,/Add Suggestion — Not Active/);
await ctx.window.zukStockPreviewNavigate('return');
assert.match(htmlOut,/Return Unused Material/);
assert.match(htmlOut,/Confirm Return — Not Active/);

ctx.me.role='Supervisor';
await ctx.window.zukStockPreviewNavigate('adjust');
assert.match(htmlOut,/Manager-only/);
assert.doesNotMatch(htmlOut,/Save Adjustment — Not Active/);

fields['zs-preview-query']={value:'paper'};
fields['zs-preview-material']={value:''};
fields['zs-preview-brand']={value:''};
await ctx.window.zukStockPreviewNavigate('balance');
ctx.window.zukStockPreviewFilter();
assert.match(htmlOut,/Water Paper 800/);
assert.doesNotMatch(htmlOut,/<td><b>2K Primer<\/b><\/td>/);

ctx.me.role='Employee';htmlOut='';
await ctx.window.openStockManagement();
assert.equal(htmlOut,'','Employee cannot open Manager/Supervisor Stock preview');
assert.equal(calls.length,0,'Every preview tab and all save attempts must be network-free');
assert.match(stock,/previewOnly\(\)\?Promise\.reject\(Error\('Stock preview: transactions not enabled'\)\)/);
console.log('MAIN-APP STOCK PILOT PASS: five color-coded Stock menu boxes opening separate detail screens, material/brand rows, quantity math, job-card workflow previews, no invented balances, zero API reads/writes');
