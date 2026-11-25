import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

// Isolated UI: fake authenticated status and in-memory LIST pages only.
// Never connect to a real workshop API or submit a Stock WRITE.
const source=readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8');
const bootstrap=`
window.me={role:'Manager',id:'qa-manager'};
window.state={consumables:{
 materials:[{id:'m1',name:'2K BLACK',unit:'Liter',department:'Painting'},
 {id:'m2',name:'2K Hardener',unit:'Liter',department:'Painting'},
 {id:'m3',name:'Primer',unit:'Liter',department:'Painting'},
 {id:'m4',name:'2K BLACK',unit:'Liter',department:'Painting'}],
 brands:[{id:'b1',name:'2K BLACK'},{id:'b2',name:'Z99'},{id:'b3',name:'Sikkens'},
 {id:'b4',name:'2K BLACK'},{id:'b5',name:'KARUSHI'}],
 prices:[{materialId:'m2',brandId:'b5',pricePerUnit:3}]
}};
window.__stockRequests=[];
window.ZUKAIT_STOCK_UI_PREVIEW_ONLY=true;
window.ZUKAIT_STOCK_LIVE_CHECK_ON_OPEN=true;
window.zukaitAuth={getToken(){return 'qa-token'}};
window.ZukaitConsumables={ensureState(s){return s.consumables}};
window.closeModal=()=>{};
window.openModal=()=>{throw Error('Unexpected modal')};
window.openConsumablesModule=()=>{};
window.zukaitCloud={async stockRequest(request){
 window.__stockRequests.push(request);
 if(request.operation==='STATUS')return {ok:true,live:true,ready:true,writes:true,masterLink:true};
 if(request.operation==='LIST'){
  const rows=request.page===0?
   [{material_id:'m1',brand_id:'b1',unit:'Liter',physical:5,reserved:0,stock_value:35,minimum:1,initialised:true},
    {material_id:'m2',brand_id:'b2',unit:'Liter',physical:4,reserved:0,stock_value:20,minimum:1,initialised:true}]:
   [{material_id:'m3',brand_id:'b3',unit:'Liter',physical:10,reserved:0,stock_value:80,minimum:1,initialised:true},
    {material_id:'m4',brand_id:'b4',unit:'Liter',physical:2,reserved:0,stock_value:10,minimum:1,initialised:true}];
  return {ok:true,items:rows,hasMore:request.page===0};
 }
 if(request.operation==='MASTER_LINK')return {ok:true,linked:{linked:true}};
 if(request.operation==='WRITE')return {ok:true,receipt:{final:true}};
 throw Error('A Stock UI test attempted unexpected server action: '+request.operation);
}};
`;
const rgb=x=>(x.match(/\d+/g)||[]).slice(0,3).map(Number);
const lum=c=>c.map(v=>{const n=v/255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4})
 .reduce((acc,v,i)=>acc+v*[0.2126,0.7152,0.0722][i],0);
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,390,430,600,768]){
  const page=await browser.newPage({viewport:{width,height:812},deviceScaleFactor:1});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<style>*{box-sizing:border-box}body{margin:0;font:16px Arial,sans-serif}</style></head><body></body></html>');
  await page.addScriptTag({content:bootstrap});
  await page.addScriptTag({content:source});
  await page.evaluate(async()=>{await window.openStockManagement();window.zukStockSelectDepartment('Painting')});
  await page.locator('.zs-home-tile').first().waitFor();
  const home=await page.evaluate(()=>{
   const root=document.querySelector('#zs-stock-screen');
   const header=root.querySelector('.zs-screen-toolbar');
   const back=header.querySelector('button:first-child'),close=header.querySelector('button:last-child'),brand=header.querySelector('.zs-screen-brand');
   const cards=[...root.querySelectorAll('.zs-home-tile')];
   const box=e=>{const r=e.getBoundingClientRect();return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
   return {back:box(back),close:box(close),brand:box(brand),cards:cards.map(e=>({
     color:getComputedStyle(e).backgroundColor,title:getComputedStyle(e.querySelector('strong')).color,
     subtitle:getComputedStyle(e.querySelector('small')).color,box:box(e)
   })),pageWidth:document.body.scrollWidth,headerWidth:box(header).width};
  });
  assert.equal(home.cards.length,4,'four stock functions on department screen '+width);
  assert.ok(home.back.right+7<=home.close.x,'Back and Close overlap at '+width);
  assert.ok(home.back.bottom<=home.brand.y+2,'Brand title must sit below buttons at '+width);
  assert.ok(home.close.bottom<=home.brand.y+2,'Brand title must sit below Close at '+width);
  assert.ok(home.back.height>=43&&home.close.height>=43,'Touch targets too small '+width);
  assert.ok(home.pageWidth<=width+1,'horizontal page overflow at '+width);
  for(const card of home.cards){
   assert.ok(lum(rgb(card.color))>.72,'Stock menu needs pastel background at '+width);
   assert.ok(contrast(rgb(card.color),rgb(card.title))>=7,'Stock menu title contrast at '+width);
   assert.ok(contrast(rgb(card.color),rgb(card.subtitle))>=4.5,'Stock menu subtitle contrast at '+width);
   assert.ok(card.box.right<=width+1,'Stock tile clipped at '+width);
  }

  assert.equal(await page.getByRole('button',{name:/Add Stock/}).count(),0,'No duplicate departmental entry');
  await page.evaluate(()=>window.zukStockResetDepartment());
  await page.getByRole('button',{name:/Add Stock/}).click();
  await page.locator('#zs-material-brand-search').waitFor();
  assert.equal(await page.locator('#zs-material-brand-search').inputValue(),'',
   'Do not silently preselect the first Material/Brand');
  assert.equal(await page.locator('#zs-material').inputValue(),'');
  await page.locator('#zs-material-brand-search').fill('Z99');
  assert.equal(await page.locator('.zs-pair-choice:visible').count(),1,'Brand search must filter a visible tappable menu');
  await page.locator('.zs-pair-choice:visible').first().click();
  assert.equal(await page.locator('#zs-material').inputValue(),'m2');
  assert.equal(await page.locator('#zs-brand').inputValue(),'b2');
  assert.equal(await page.locator('#zs-pair-results').isVisible(),false);

  await page.locator('#zs-material-brand-search').fill('Sikkens');
  assert.equal(await page.locator('#zs-material').inputValue(),'',
   'Editing the search must clear a previous selection');
  // Loading another page is read-only and must not erase an unfinished count.
  assert.equal(await page.locator('#zs-entrytype').inputValue(),'OPENING');
  await page.locator('#zs-qty').fill('3.25');
  await page.locator('#zs-method').selectOption('unit');
  await page.locator('#zs-price').fill('8.5');
  await page.locator('#zs-count-confirmed').check();
  await page.locator('#zs-opening-note').fill('Manager verified this stock count on site');
  await page.getByRole('button',{name:/Load next 100 linked materials/}).click();
  assert.equal(await page.locator('#zs-entrytype').inputValue(),'OPENING');
  assert.equal(await page.locator('#zs-qty').inputValue(),'3.25');
  assert.equal(await page.locator('#zs-method').inputValue(),'unit');
  assert.equal(await page.locator('#zs-price').inputValue(),'8.5');
  assert.equal(await page.locator('#zs-count-confirmed').isChecked(),true);
  assert.equal(await page.locator('#zs-opening-note').inputValue(),'Manager verified this stock count on site');
  assert.match(await page.locator('#zs-price-calculated').textContent(),/27\.625/);
  await page.locator('.zs-pair-choice:visible').first().waitFor();
  assert.equal(await page.locator('#zs-material-brand-search').inputValue(),'Sikkens',
   'Keep typed query when user loads next page');
  assert.equal(await page.locator('.zs-pair-choice:visible').count(),1,'Search must include user-loaded second page');
  await page.locator('.zs-pair-choice:visible').first().click();
  assert.equal(await page.locator('#zs-material').inputValue(),'m3');
  assert.equal(await page.locator('#zs-brand').inputValue(),'b3');

  // Two differently identified items can legitimately have identical labels.
  // Typing the ambiguous label must NOT silently select the first matching ID.
  await page.locator('#zs-material-brand-search').fill('2K BLACK — 2K BLACK');
  assert.equal(await page.locator('#zs-material').inputValue(),'');
  assert.equal(await page.locator('#zs-brand').inputValue(),'');
  assert.match(await page.locator('#zs-pair-hint').textContent(),/more than one matching item/i);
  assert.equal(await page.locator('.zs-pair-choice:visible').count(),2);
  await page.locator('.zs-pair-choice:visible').nth(1).click();
  assert.equal(await page.locator('#zs-material').inputValue(),'m4');
  assert.equal(await page.locator('#zs-brand').inputValue(),'b4');
  const operations=await page.evaluate(()=>window.__stockRequests.map(x=>x.operation));
  assert.equal(operations.filter(x=>x==='WRITE').length,0,'Searching and selecting cannot write stock');
  assert.deepEqual(operations.filter(x=>x==='LIST'),['LIST','LIST'],
   'Only one server LIST per deliberately loaded page');
  // Fake in-memory stock API only: Save must submit the clicked exact IDs.
  assert.equal(await page.locator('#zs-entrytype').inputValue(),'OPENING');
  await page.locator('#zs-qty').fill('2');
  await page.locator('#zs-method').selectOption('unit');
  await page.locator('#zs-price').fill('10');
  await page.locator('#zs-save-entry').click();
  await page.waitForFunction(()=>window.__stockRequests.some(x=>x.operation==='WRITE'));
  const saves=await page.evaluate(()=>window.__stockRequests.filter(x=>x.operation==='WRITE'));
  assert.equal(saves.length,1);
  assert.equal(saves[0].command,'OPENING');
  assert.equal(saves[0].data.countConfirmed,true);
  assert.equal('supplier' in saves[0].data,false);
  assert.equal('invoiceNumber' in saves[0].data,false);
  assert.equal(saves[0].data.materialId,'m4');
  assert.equal(saves[0].data.brandId,'b4');
  assert.equal(saves[0].data.quantity,2);
  // A new saved Master pair is selectable without a separate setup screen.
  await page.evaluate(()=>window.zukStockNav('add',true));
  await page.locator('#zs-material-brand-search').waitFor();
  await page.getByRole('button',{name:/Load next 100 linked materials/}).click();
  await page.locator('#zs-material-brand-search').fill('KARUSHI');
  assert.equal(await page.locator('.zs-pair-choice:visible').count(),1);
  await page.locator('.zs-pair-choice:visible').first().click();
  assert.equal(await page.locator('#zs-material').inputValue(),'m2');
  assert.equal(await page.locator('#zs-brand').inputValue(),'b5');
  assert.equal(await page.evaluate(()=>window.__stockRequests.filter(x=>x.operation==='MASTER_LINK').length),0,'Selection alone cannot create stock');
  await page.locator('#zs-qty').fill('1');
  await page.locator('#zs-price').fill('3');
  await page.locator('#zs-count-confirmed').check();
  await page.locator('#zs-opening-note').fill('Physically verified new material count');
  await page.locator('#zs-save-entry').click();
  await page.waitForFunction(()=>window.__stockRequests.filter(x=>x.operation==='WRITE').length===2);
  const linkedAndWritten=await page.evaluate(()=>window.__stockRequests.filter(x=>['MASTER_LINK','WRITE'].includes(x.operation)).slice(-2));
  assert.deepEqual(linkedAndWritten[0],{operation:'MASTER_LINK',materialId:'m2',brandId:'b5',origin:'Painting'});
  assert.equal(linkedAndWritten[1].data.brandId,'b5');
  await page.getByRole('button',{name:/Close/}).first().click();
  assert.equal(await page.locator('#zs-stock-screen').count(),0,'Close must remove full-screen stock UI');
  await page.close();
 }
}finally{await browser.close();}
console.log('PASS V416: iPhone header, pastel cards, duplicate-label exact-ID selection/save, form persistence and manual paging; fake API only');
