import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Dependency-free full-screen in-app routing test. Standard APK CI does not
// run npm install before the smoke tests, so this must use Node built-ins.
const stock=readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8');
// Prevent global theme rules from rendering near-black text on saturated colored cards.
for(const color of ['blue','green','purple','orange','teal']){
 assert.ok(stock.includes('#zs-stock-screen .zs-preview .zs-home-tile.'+color),
  'Missing explicitly scoped contrast-safe '+color+' card palette');
}
assert.ok(stock.includes('.zs-home-info strong{color:#ffffff!important'),
 'Stock card titles must use high-contrast text');
assert.ok(stock.includes('.zs-screen-brand{color:#ffffff!important'),
 'Header brand must remain readable');
assert.ok(stock.includes('.zs-screen-brand{order:3;flex:1 0 100%'),
 'On narrow phones the stock title must move to a readable second toolbar row');
assert.ok(stock.includes('.zs-home-info small{color:#f4f7ff!important'),
 'Stock descriptions must use light text on colored cards');
assert.ok(stock.includes('@media(max-width:600px){#zs-stock-screen .zs-preview .zs-home-grid{grid-template-columns:repeat(2,minmax(0,1fr))'),
 'Phone-sized stock tiles must remain two columns, not one');
assert.ok(stock.includes('.zs-department-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'),
 'Paint and Mechanical entry options must appear side by side');

const html=readFileSync('app/src/main/assets/offline_test.html','utf8');
const menu=readFileSync('app/src/main/assets/consumables_ui.js','utf8');
const mech=readFileSync('app/src/main/assets/mechanical_consumables_ui.js','utf8');
assert.ok(html.includes('<script>window.ZUKAIT_STOCK_UI_PREVIEW_ONLY=true;</script><script src="consumables_stock_ui.js'),
 'The main app must enable Stock preview mode before loading the Stock UI');
assert.match(menu,/openStockManagement\(\)/);
assert.match(menu,/openMechanicalConsumables\(\)/);
assert.match(mech,/window\.ZUKAIT_MECHANICAL_STOCK_ENABLED===true/);
assert.doesNotMatch(html,/window\.ZUKAIT_MECHANICAL_STOCK_ENABLED\s*=\s*true/,
 'Mechanical issuing must not be enabled by main app');

let screen=null,modalOpened=0,closedModal=0,backToConsumables=0;
const fields={};
const body={
 style:{overflow:''},
 appendChild(node){assert.equal(node.tagName,'MAIN');screen=node;node.parentNode=this;}
};
const document={
 body,
 getElementById(id){return id==='zs-stock-screen'?screen:(fields[id]||null);},
 createElement(tag){
  return {
   tagName:tag.toUpperCase(),id:'',dataset:{},attributes:{},innerHTML:'',scrollTop:0,
   setAttribute(name,value){this.attributes[name]=value;},
   focus(){this.focused=true;},
   remove(){if(screen===this)screen=null}
  };
 }
};
const calls=[];
const ctx={
 me:{id:'M',role:'Manager'},
 state:{consumables:{
  materials:[{id:'m1',name:'2K Primer',unit:'Liter',active:true},
             {id:'m2',name:'Water Paper 800',unit:'Piece',active:true}],
  brands:[{id:'b1',name:'CAPSI',active:true},{id:'b2',name:'MILACO',active:true}],
  prices:[{materialId:'m1',brandId:'b1',price:9.2},
          {materialId:'m1',brandId:'b2',price:10.8}]
 }},
 document,
 window:{
  ZUKAIT_STOCK_UI_PREVIEW_ONLY:true,
  openModal(){modalOpened++;throw Error('Preview must not use a modal');},
  closeModal(){closedModal++},
  openConsumablesModule(){backToConsumables++},
  zukaitCloud:{async stockRequest(x){calls.push(x);throw Error('Preview must not call stock API')}},
  ZukaitConsumables:{ensureState(x){return x.consumables}}
 },
 navigator:{onLine:true},
 console
};
runInNewContext(stock,ctx);
const markup=()=>screen?.innerHTML||'';
const current=()=>screen?.dataset?.view;
const cards=()=>[...markup().matchAll(/class="zs-home-tile\b/g)].length;
const set=(id,value)=>{fields[id]={value};return fields[id]};

ctx.window.openStockManagement();
assert.ok(screen,'Stock preview should create an independent full-screen page');
assert.equal(screen.tagName,'MAIN');
assert.equal(screen.id,'zs-stock-screen');
assert.equal(current(),'home');
assert.equal(body.style.overflow,'hidden');
assert.equal(closedModal,1,'Previous Consumables popup must close');
assert.equal(modalOpened,0,'Stock screen must never use an openModal popup');
assert.equal(cards(),0,'First stock screen chooses a department');
assert.match(markup(),/Paint Consumables/);
assert.match(markup(),/Mechanical Consumables/);
assert.match(markup(),/zs-department-grid/);
assert.match(markup(),/Create New Item/,'Manager must be able to create materials directly from Stock menu');
ctx.window.zukStockSelectDepartment('Painting');
assert.equal(current(),'home');
assert.equal(cards(),5,'Five colored Paint Stock menu boxes');
assert.match(markup(),/Create New Item/,'Paint Stock menu must expose Create New Item');
assert.match(markup(),/Paint Consumables/);
assert.match(markup(),/zs-home-grid/);
assert.match(markup(),/Consumables Stock Management/);
for(const [key,title] of [
 ['balance','Stock Balance'],['add','Add Stock'],['history','Stock History'],
 ['adjust','Stock Adjustment'],['reports','Stock Reports']
]){
 assert.match(markup(),new RegExp('onclick="zukStockPreviewNavigate\\(\\\''+key+'\\\'\\)"'),
  'The '+title+' tile must navigate on click');
 assert.match(markup(),new RegExp(title));
}
assert.doesNotMatch(markup(),/2K Primer/,'Home must not contain material information');
assert.doesNotMatch(markup(),/Not initialized/,'Home must not show stock metrics');
assert.doesNotMatch(markup(),/<table aria-label="Stock Balance preview">/);

ctx.window.zukStockPreviewNavigate('balance');
assert.equal(current(),'balance','Opening Stock Balance must navigate to a new view');
assert.equal(cards(),0,'Detail view must replace, not append to, the home cards');
assert.match(markup(),/← Paint Consumables/);
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
assert.doesNotMatch(markup(),/OMR 9\.2/,'Master prices are not inventory valuation');

ctx.window.zukStockPreviewNavigate('home');
assert.equal(current(),'home');
assert.equal(cards(),5,'Back to Stock Management restores only menu cards');
assert.doesNotMatch(markup(),/<table aria-label="Stock Balance preview">/);

ctx.window.zukStockNav('add');
assert.equal(current(),'add');
assert.equal(cards(),0);
assert.match(markup(),/Add Stock — Preview/);
assert.match(markup(),/Total Purchase Price/);
assert.match(markup(),/Price per Unit/);
assert.match(markup(),/No tins or drums conversion/);
assert.match(markup(),/Save Stock — Not Active/);
assert.match(markup(),/<button[^>]+disabled>/);
set('zs-preview-qty','20');
set('zs-preview-price','120');
set('zs-preview-method','total');
fields['zs-preview-calculated']={textContent:''};
ctx.window.zukStockPreviewPrice();
assert.match(fields['zs-preview-calculated'].textContent,/6\.000 OMR/);
assert.match(fields['zs-preview-calculated'].textContent,/120\.000 OMR/);
set('zs-preview-method','unit');
set('zs-preview-price','6');
ctx.window.zukStockPreviewPrice();
assert.match(fields['zs-preview-calculated'].textContent,/120\.000 OMR/);
ctx.window.zukStockSavePurchase();
assert.equal(calls.length,0);

ctx.window.zukStockNav('history');
assert.equal(current(),'history');
assert.match(markup(),/No stock ledger is active/);
ctx.window.zukStockNav('adjust');
assert.equal(current(),'adjust');
assert.match(markup(),/New physical count/);
assert.match(markup(),/Save Adjustment — Not Active/);
ctx.window.zukStockSaveAdjustment();
assert.equal(calls.length,0);

ctx.window.zukStockNav('reports');
assert.equal(current(),'reports');
assert.match(markup(),/Current stock valuation/);
assert.match(markup(),/Not initialized/);
assert.match(markup(),/Print \/ PDF — Not Active/);
ctx.window.zukStockPreviewNavigate('suggest');
assert.match(markup(),/Supervisor — Suggest Material/);
assert.match(markup(),/weighted-average unit cost will lock/);
assert.match(markup(),/Add Suggestion — Not Active/);
ctx.window.zukStockPreviewNavigate('return');
assert.match(markup(),/Return Unused Material/);
assert.match(markup(),/Confirm Return — Not Active/);

ctx.me.role='Supervisor';
ctx.window.zukStockPreviewNavigate('adjust');
assert.match(markup(),/Manager-only/);
assert.doesNotMatch(markup(),/Save Adjustment — Not Active/);
ctx.window.zukStockPreviewNavigate('balance');
set('zs-preview-query','paper');
set('zs-preview-material','');
set('zs-preview-brand','');
ctx.window.zukStockPreviewFilter();
assert.match(markup(),/Water Paper 800/);
assert.doesNotMatch(markup(),/<td><b>2K Primer<\/b><\/td>/);

ctx.window.zukStockPreviewNavigate('home');
assert.equal(cards(),5);
ctx.window.zukStockResetDepartment();
assert.equal(cards(),0,'Back to departments must hide the stock action cards');
ctx.window.zukStockSelectDepartment('Mechanical');
assert.equal(cards(),5,'Mechanical gets its own five-card menu');
assert.match(markup(),/Mechanical Consumables/);
ctx.window.zukStockPreviewNavigate('balance');
assert.match(markup(),/Mechanical Consumables · Stock Balance/);
assert.match(markup(),/NOT a verified department stock list/);
ctx.window.zukStockPreviewNavigate('home');
ctx.window.zukStockPreviewExit('consumables');
assert.equal(screen,null,'Back to Consumables must dispose Stock page');
assert.equal(body.style.overflow,'');
assert.equal(backToConsumables,1);
ctx.window.openStockManagement();
assert.equal(current(),'home');
ctx.window.zukStockPreviewExit('dashboard');
assert.equal(screen,null,'Close returns to workshop');
ctx.me.role='Employee';
ctx.window.openStockManagement();
assert.equal(screen,null,'Employee cannot open Manager/Supervisor Stock page');

// Manager can test real input flows safely in this tab, with NO stock backend calls.
ctx.me.role='Manager';
ctx.window.openStockManagement();
assert.equal(cards(),0,'New Stock entry must start at the department picker');
ctx.window.zukStockSelectDepartment('Painting');
assert.match(markup(),/Start opening-stock \/ purchase test/);
ctx.window.zukStockTestStart();
assert.equal(current(),'home');
assert.match(markup(),/TEST MODE · NOT REAL STOCK/);
assert.equal(cards(),5);
ctx.window.zukStockPreviewNavigate('add');
assert.match(markup(),/Record Test Entry/);
assert.doesNotMatch(markup(),/Save Stock — Not Active/);
set('zs-trial-entry','OPENING');
set('zs-trial-material','m1');
set('zs-trial-brand','b1');
set('zs-trial-qty','20');
set('zs-trial-price','120');
set('zs-trial-method','total');
set('zs-trial-note','Count verified in QA');
fields['zs-trial-count']={checked:true};
ctx.window.zukStockTrialSave();
assert.equal(current(),'balance');
assert.match(markup(),/20\.00/);
assert.match(markup(),/120\.000/);
assert.match(markup(),/Test stock items/);
ctx.window.zukStockPreviewNavigate('add');
set('zs-trial-entry','PURCHASE');
set('zs-trial-material','m1');
set('zs-trial-brand','b1');
set('zs-trial-qty','10');
set('zs-trial-price','8');
set('zs-trial-method','unit');
set('zs-trial-note','Purchased 10 litres');
ctx.window.zukStockTrialSave();
assert.equal(current(),'balance');
assert.match(markup(),/30\.00/);
assert.match(markup(),/200\.000/);
assert.match(markup(),/6\.667/,'Weighted average must be correct');
ctx.window.zukStockPreviewNavigate('history');
assert.match(markup(),/Count verified in QA/);
assert.match(markup(),/Purchased 10 litres/);
ctx.window.zukStockPreviewNavigate('reports');
assert.match(markup(),/200\.000 OMR/);
assert.equal(calls.length,0,'Active tab test must not post to stock backend');
ctx.window.zukStockPreviewNavigate('home');
assert.equal(cards(),5);
ctx.window.zukStockTestReset();
assert.match(markup(),/Clear test entries/);

const newItemNavigation=[];
ctx.window.consOpenMaster=scope=>newItemNavigation.push(scope);
ctx.window.zukStockCreateItem();
assert.deepEqual(newItemNavigation,['Painting'],'Stock create action should open Manager Master with department selected');
assert.equal(screen,null,'Creating item must close the full-screen Stock overlay first');
assert.equal(calls.length,0,'All preview screens and disabled save operations must be network-free');
assert.equal(modalOpened,0,'No popup must open while entering any Stock detail screen');
assert.match(stock,/previewOnly\(\)\?Promise\.reject\(Error\('Stock preview: transactions not enabled'\)\)/);
console.log('STOCK two-column PASS: Paint and Mechanical routes, detail screens, locked writes, zero RPC');
