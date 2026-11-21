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
let htmlOut='';
let calls=[];
const ctx={
  me:{id:'M',role:'Manager'},
  state:{consumables:{
    materials:[{id:'m1',name:'Engine Oil 5W-30',unit:'Liter',active:true}],
    brands:[{id:'b1',name:'Brand A',active:true}],
    prices:[{materialId:'m1',brandId:'b1',price:9.2}]
  }},
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
assert.match(htmlOut,/Stock Management — Preview Only/);
assert.match(htmlOut,/Engine Oil 5W-30/);
assert.match(htmlOut,/Material Master reference only/);
assert.match(htmlOut,/NOT ACTIVE/);
assert.doesNotMatch(htmlOut,/Available Stock|OMR 9\.2|Opening Stock \(one time only\)/);
assert.equal(calls.length,0);
await ctx.window.zukStockNav('add');
await ctx.window.zukStockNav('history');
assert.equal(calls.length,0,'UI navigation must not send stock reads');
ctx.window.zukStockSavePurchase?.();
await Promise.resolve(); await Promise.resolve();
assert.equal(calls.length,0,'old save handlers may not write Stock');
ctx.me.role='Employee';
htmlOut='';
await ctx.window.openStockManagement();
assert.equal(htmlOut,'','Employee cannot open Manager/Supervisor Stock preview');
console.log('MAIN-APP STOCK PILOT PASS: existing-login Master preview, no stock totals, zero read/write, no Mechanical activation');
