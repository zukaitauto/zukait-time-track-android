import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const source=fs.readFileSync('app/src/main/assets/consumables_ui.js','utf8');
let css='';const out={innerHTML:''},draftOut={innerHTML:''};
const names=['Water Paper 800','BASE WHITE','Masking Tape','2K Slow Thinner','Long material name that must remain completely readable'];
const materials=names.map((name,i)=>({id:'M'+i,name,unit:i===0?'Piece':'Liter'}));
const brands=['CARSHINE','BASE WHITE','MASKING TAPE','SAYARA','Long brand name without truncation'].map((name,i)=>({id:'B'+i,name}));
const lines=materials.map((m,i)=>({materialId:m.id,brandId:brands[i].id,quantity:i===1?0.4:1}));
const ctx={window:{},state:{},draft:{jc:{job:{no:'TEST'}},lines},consRefreshIssueFinishState(){},C:()=>({ensureState:()=>({materials,brands}),allowance:()=>lines,priceAt:()=>({pricePerUnit:1})}),esc:x=>String(x),document:{getElementById:id=>id==='consActualRows'?out:id==='consDraftRows'?draftOut:null,createElement:()=>({textContent:''}),head:{appendChild:s=>{css+=s.textContent}}}};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function consCompactEntryStyle(){'),source.indexOf('window.openConsumablesAdditional='))+'\nconsCompactEntryStyle();',ctx);
vm.runInContext(source.slice(source.indexOf('window.consRenderActualRows=function(){'),source.indexOf('window.consAddActualMaterial=')),ctx);
ctx.window.consRenderActualRows();assert.doesNotMatch(out.innerHTML,/>MATERIAL</);
vm.runInContext(source.slice(source.indexOf('window.consRenderRows=function(){'),source.indexOf('window.consFinishIssue=function(){')),ctx);
ctx.window.consRenderRows();
assert.match(css,/\.cons-actual-assignment-grid/,'approved two-column details styling must be present');
assert.match(css,/\.cons-actual-review-card/,'confirmation rows must have dedicated responsive styling');
assert.match(source,/cons-confirm-redesign/,'confirmation screen must use the new layout');
assert.match(source,/consActualVehicle\" readonly/,'vehicle detail remains read-only');
assert.match(source,/consActualPainter\" readonly/,'painter remains read-only');
// Render the real approved menu and pending-list functions, without network or writes.
const menuStart=source.indexOf('const consDepartmentMenuStyle='),menuEnd=source.indexOf('function consFinalMaterialPendingRows()',menuStart),paintStart=source.indexOf('window.openPaintingConsumables=function()'),paintEnd=source.indexOf('window.openTotalConsumables=function()',paintStart),pendingStart=source.indexOf('window.openFinalMaterialPending=function()'),pendingEnd=paintStart;
const pendingRows=[{jobCard:'12188',status:'missing'},{jobCard:'12189',status:'reopened'},{jobCard:'12190',status:'review'}];let menuHtml='',pendingHtml='';
const popupContext={window:{},role:()=> 'Manager',consFinalMaterialPendingRows:()=>pendingRows,jcData:()=>({vehicle:'TOYOTA LAND CRUISER',job:{reg:'236-YY'}}),esc:x=>String(x),modal:(title,body)=>{if(title.includes('Final Material Pending'))pendingHtml=body;else menuHtml=body;}};
vm.runInNewContext(source.slice(menuStart,menuEnd)+source.slice(pendingStart,pendingEnd)+source.slice(paintStart,paintEnd),popupContext);
popupContext.window.openPaintingConsumables();popupContext.window.openFinalMaterialPending();
const pendingCss=source.slice(source.indexOf('#modal .cons-final-pending-list'),source.indexOf('\n.cons-job-report-list',source.indexOf('#modal .cons-final-pending-list')));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
try{for(const width of [320,390,600,768,1280]){
 const page=await browser.newPage({viewport:{width,height:950}});
 await page.setContent('<style>body{margin:0;padding:12px;font:16px Arial}main{padding:12px}input{padding:20px;font-size:24px}'+css+'</style><main class="cons-actual-page">'+out.innerHTML+'</main>');
 assert.equal(await page.locator('.cons-actual-line-name').count(),names.length);
 for(const card of await page.locator('.cons-actual-line-card').all()){
  const result=await card.evaluate(el=>{const children=[...el.children],rects=children.map(x=>x.getBoundingClientRect()),input=el.querySelector('input');return {overflow:[el,...el.querySelectorAll('*')].some(x=>x.scrollWidth>x.clientWidth+1),overlap:rects.some((a,i)=>rects.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)),font:parseFloat(getComputedStyle(input).fontSize),height:input.getBoundingClientRect().height,nameFont:parseFloat(getComputedStyle(el.querySelector('b')).fontSize)};});
  assert.equal(result.overflow,false,'text/input overflow at '+width);assert.equal(result.overlap,false,'panels overlap at '+width);assert.ok(result.font>=16&&result.nameFont>=16&&result.height>=44);
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(await page.locator('input').evaluateAll(inputs=>inputs.map(x=>Number(x.value))),lines.map(l=>l.quantity));
 await page.setContent('<style>body{margin:0;padding:12px;font:16px Arial}button{padding:10px}'+css+'.cons-entry-line-cards{counter-reset:consmat 98!important}</style><main>'+draftOut.innerHTML+'</main>');
 assert.deepEqual(await page.locator('.cons-entry-line-card>div:first-of-type b').allTextContents(),names);
 for(const card of await page.locator('.cons-entry-line-card').all()){
  const result=await card.evaluate(el=>{const badge=getComputedStyle(el,'::before'),style=getComputedStyle(el),box=el.getBoundingClientRect(),children=[...el.children].map(x=>x.getBoundingClientRect());return {position:badge.position,serialRight:box.left+parseFloat(style.paddingLeft)+parseFloat(badge.width),nameLeft:children[0].left,overlap:children.some((a,i)=>children.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)),overflow:[el,...el.querySelectorAll('*')].some(x=>x.scrollWidth>x.clientWidth+1)};});
  assert.equal(result.position,'static');assert.ok(result.nameLeft>=result.serialRight+7,'serial overlaps item at '+width);assert.equal(result.overlap,false,'item/quantity/button overlap at '+width);assert.equal(result.overflow,false,'draft row overflow at '+width);
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setContent('<style>body{margin:0;padding:12px;font:14px Arial}button{font:inherit}'+pendingCss+'</style><main id="modal">'+pendingHtml+'</main>');
 assert.equal(await page.locator('.cons-final-pending-row').count(),3);
 for(const row of await page.locator('.cons-final-pending-row').all()){
  const r=await row.evaluate(el=>{const b=el.getBoundingClientRect(),status=el.querySelector('.cons-row-status').getBoundingClientRect(),children=[...el.children].map(x=>x.getBoundingClientRect());return {height:b.height,statusWidth:status.width,overflow:el.scrollWidth>el.clientWidth+1,overlap:children.some((a,i)=>children.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1))};});
  assert.ok(r.height<130&&r.statusWidth>65,'status must not collapse at '+width);assert.equal(r.overflow,false);assert.equal(r.overlap,false);
 }
 assert.equal(await page.locator('.cons-final-pending-head').isVisible(),width>700);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(await page.locator('.cons-row-status').allTextContents(),['Actual Pending','Reopened Actual','Manager Review']);
 await page.setContent('<style>body{margin:0;padding:12px;font:14px Arial}button{font:inherit}</style><main id="modal">'+menuHtml+'</main>');
 assert.equal(await page.locator('button.cons-action').count(),9);assert.equal(await page.locator('.cons-menu-icon svg').count(),9);
 const cols=await page.locator('.cons-department-menu').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);assert.equal(cols,width<=600?1:2);
 for(const tile of await page.locator('button.cons-action').all()){const v=await tile.evaluate(el=>({top:getComputedStyle(el).borderTopWidth,bottom:getComputedStyle(el).borderBottomWidth,overflow:el.scrollWidth>el.clientWidth+1}));assert.equal(v.top,'4px');assert.equal(v.bottom,'1px');assert.equal(v.overflow,false);}
 await page.close();
}}finally{await browser.close();}
console.log('PASS: serial numbers have a separate column; draft/actual material names and quantities stay readable without overlap at 320–1280px; values unchanged.');
