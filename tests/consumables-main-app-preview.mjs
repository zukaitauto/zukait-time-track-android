import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

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

const dom=new JSDOM('<!doctype html><html><body><div id="modal" class="modal-backdrop"></div></body></html>',
 {url:'https://zukaitauto.github.io/',runScripts:'outside-only'});
const win=dom.window,doc=win.document,calls=[];
let modalOpened=0,backToConsumables=0,closedModal=0;
win.me={id:'M',role:'Manager'};
win.state={consumables:{
 materials:[
  {id:'m1',name:'2K Primer',unit:'Liter',active:true},
  {id:'m2',name:'Water Paper 800',unit:'Piece',active:true}
 ],
 brands:[{id:'b1',name:'CAPSI',active:true},{id:'b2',name:'MILACO',active:true}],
 prices:[{materialId:'m1',brandId:'b1',price:9.2},
         {materialId:'m1',brandId:'b2',price:10.8}]
}};
win.ZUKAIT_STOCK_UI_PREVIEW_ONLY=true;
win.zukaitCloud={async stockRequest(cmd){calls.push(cmd);throw Error('Stock preview cannot request data')}};
win.ZukaitConsumables={ensureState(state){return state.consumables}};
win.closeModal=()=>{closedModal++;doc.getElementById('modal').className='hidden'};
win.openModal=()=>{modalOpened++;throw Error('Stock preview must not open a modal')};
win.openConsumablesModule=()=>{backToConsumables++};

const screen=()=>doc.getElementById('zs-stock-screen');
const markup=()=>screen()?.innerHTML||'';
const set=(id,value)=>{const el=doc.getElementById(id);assert.ok(el,'Missing input '+id);el.value=value;return el};

try{
 win.eval(stock);
 assert.equal(screen(),null,'Stock screen must not open itself at page load');
 win.openStockManagement();
 assert.ok(screen(),'Stock screen must create a standalone full-screen app page');
 assert.equal(screen().tagName,'MAIN');
 assert.equal(screen().dataset.view,'home');
 assert.equal(closedModal,1,'Existing Consumables menu modal must close before standalone Stock page');
 assert.equal(doc.getElementById('modal').className,'hidden');
 assert.equal(doc.body.style.overflow,'hidden');
 assert.match(markup(),/Consumables Stock Management/);
 assert.match(markup(),/zs-home-grid/);
 assert.equal(screen().querySelectorAll('.zs-home-tile').length,5,'Exactly five clickable menu cards');
 for(const page of ['Stock Balance','Add Stock','Stock History','Stock Adjustment','Stock Reports'])
  assert.match(markup(),new RegExp(page));
 assert.equal(screen().querySelectorAll('table').length,0,'Home page must never include a data table');
 assert.doesNotMatch(markup(),/2K Primer/,'Home page must not display materials');
 assert.doesNotMatch(markup(),/Not initialized/,'Home page must not display stock metrics');
 assert.equal(modalOpened,0,'Stock must never re-use popup/modal UI');

 screen().querySelector('.zs-home-tile').click();
 assert.equal(screen().dataset.view,'balance','Clicking a card opens a separate detail page');
 assert.equal(screen().querySelectorAll('.zs-home-tile').length,0,'Detail page replaces—not appends to—menu');
 assert.match(markup(),/← Stock Management/);
 assert.match(markup(),/2K Primer/);
 assert.match(markup(),/CAPSI/);
 assert.match(markup(),/MILACO/);
 assert.match(markup(),/Water Paper 800/);
 assert.match(markup(),/Not assigned/);
 assert.match(markup(),/Not initialized/);
 assert.match(markup(),/Avg. Cost \/ Unit/);
 assert.match(markup(),/Reserved for Job Cards/);
 assert.match(markup(),/Supervisor · Suggest Material/);
 assert.match(markup(),/Return Unused Material/);
 assert.match(markup(),/Apply filter/);
 assert.doesNotMatch(markup(),/>248\.50</);
 assert.doesNotMatch(markup(),/>212\.50</);
 assert.doesNotMatch(markup(),/OMR 9\.2/,'Master price is not inventory valuation');

 // Details -> Menu -> different details, no embedded table, nav-tabs or popup.
 screen().querySelector('button[onclick*="Navigate"]').click();
 assert.equal(screen().dataset.view,'home');
 assert.equal(screen().querySelectorAll('table').length,0);
 assert.equal(screen().querySelectorAll('.zs-home-tile').length,5);
 win.zukStockPreviewNavigate('add');
 assert.equal(screen().dataset.view,'add');
 assert.equal(screen().querySelectorAll('.zs-home-tile').length,0);
 assert.match(markup(),/Add Stock — Preview/);
 assert.match(markup(),/Total Purchase Price/);
 assert.match(markup(),/Price per Unit/);
 assert.match(markup(),/No tins or drums conversion/);
 assert.match(markup(),/Save Stock — Not Active/);
 assert.ok(doc.querySelector('button[disabled]'));
 set('zs-preview-qty','20');
 set('zs-preview-price','120');
 set('zs-preview-method','total');
 win.zukStockPreviewPrice();
 assert.match(doc.getElementById('zs-preview-calculated').textContent,/6\.000 OMR/);
 assert.match(doc.getElementById('zs-preview-calculated').textContent,/120\.000 OMR/);
 set('zs-preview-method','unit');
 set('zs-preview-price','6');
 win.zukStockPreviewPrice();
 assert.match(doc.getElementById('zs-preview-calculated').textContent,/120\.000 OMR/);
 win.zukStockSavePurchase();
 assert.equal(calls.length,0);

 win.zukStockPreviewNavigate('history');
 assert.equal(screen().dataset.view,'history');
 assert.match(markup(),/No stock ledger is active/);
 win.zukStockPreviewNavigate('adjust');
 assert.match(markup(),/New physical count/);
 assert.match(markup(),/Save Adjustment — Not Active/);
 win.zukStockSaveAdjustment();
 assert.equal(calls.length,0);

 win.zukStockPreviewNavigate('reports');
 assert.match(markup(),/Current stock valuation/);
 assert.match(markup(),/Not initialized/);
 assert.match(markup(),/Print \/ PDF — Not Active/);
 win.zukStockPreviewNavigate('balance');
 win.zukStockPreviewNavigate('suggest');
 assert.match(markup(),/Supervisor — Suggest Material/);
 assert.match(markup(),/weighted-average unit cost will lock/);
 assert.match(markup(),/Add Suggestion — Not Active/);
 win.zukStockPreviewNavigate('return');
 assert.match(markup(),/Return Unused Material/);
 assert.match(markup(),/Confirm Return — Not Active/);

 win.me.role='Supervisor';
 win.zukStockPreviewNavigate('adjust');
 assert.match(markup(),/Manager-only/);
 assert.doesNotMatch(markup(),/Save Adjustment — Not Active/);
 win.zukStockPreviewNavigate('balance');
 set('zs-preview-query','paper');
 set('zs-preview-material','');
 set('zs-preview-brand','');
 win.zukStockPreviewFilter();
 assert.match(markup(),/Water Paper 800/);
 assert.doesNotMatch(markup(),/<td><b>2K Primer<\/b><\/td>/);

 win.zukStockPreviewNavigate('home');
 assert.equal(screen().querySelectorAll('.zs-home-tile').length,5);
 win.zukStockPreviewExit('consumables');
 assert.equal(screen(),null,'Back to Consumables disposes the Stock page');
 assert.equal(doc.body.style.overflow,'');
 assert.equal(backToConsumables,1);

 win.openStockManagement();
 assert.equal(screen()?.dataset.view,'home');
 win.zukStockPreviewExit('dashboard');
 assert.equal(screen(),null,'Close returns to dashboard');
 win.me.role='Employee';
 win.openStockManagement();
 assert.equal(screen(),null,'Unauthorized staff cannot open Stock page');
 assert.equal(calls.length,0,'All Stock preview navigation and save attempts are network-free');
 assert.equal(modalOpened,0,'All preview pages must avoid the popup/modal');
 assert.match(stock,/previewOnly\(\)\?Promise\.reject\(Error\('Stock preview: transactions not enabled'\)\)/);
 console.log('STOCK V407 FULL-PAGE PASS: five colored boxes; separate full-screen detail pages and back; role safety; no stock API, stock writes or fabricated balances');
}finally{dom.window.close()}
