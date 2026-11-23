import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {chromium} from 'playwright';

// Render the actual Stock chooser markup; never use production APIs.
const src=readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8');
let screen=null,networkCalls=0;
const document={
 body:{style:{overflow:''},appendChild(node){screen=node;node.parentNode=this}},
 getElementById(id){return id==='zs-stock-screen'?screen:null},
 createElement(tag){return {tagName:tag.toUpperCase(),id:'',dataset:{},innerHTML:'',
  scrollTop:0,setAttribute(){},focus(){},remove(){screen=null}}}
};
const ctx={
 me:{id:'M',role:'Manager'},state:{consumables:{materials:[],brands:[],prices:[]}},
 document,navigator:{onLine:true},console,
 window:{
  ZUKAIT_STOCK_UI_PREVIEW_ONLY:true,
  closeModal(){},
  openModal(){throw Error('Stock home must never open legacy modal')},
  ZukaitConsumables:{ensureState(s){return s.consumables}},
  zukaitCloud:{stockRequest(){networkCalls++;throw Error('Stock home tried to call live server')}}
 }
};
runInNewContext(src,ctx);
ctx.window.openStockManagement();
assert.ok(screen?.innerHTML,'full-screen Stock chooser renders');
const markup=screen.innerHTML;
assert.match(markup,/Consumables Stock/);
assert.match(markup,/Stock Departments/);
assert.match(markup,/Material Setup/);
assert.equal((markup.match(/class="zs-department-card /g)||[]).length,2);
assert.equal((markup.match(/class="zs-(?:create-item|materials-btn)" onclick/g)||[]).length,2);
assert.match(markup,/onclick="zukStockSelectDepartment\(this.dataset.department\)"/);
assert.match(markup,/onclick="zukStockCreateItem\(\)"/);
assert.match(markup,/onclick="zukStockOpenMaterials\(\)"/);
assert.equal(networkCalls,0,'landing page must be read-only');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{
 executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{})});
try{
 for(const width of [320,375,390,430,600,768,1280]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<style>*{box-sizing:border-box}body{margin:0;font:16px Arial,sans-serif}</style></head>'+
    '<body><main id="zs-stock-screen">'+markup+'</main></body></html>');
  const m=await page.evaluate(()=>{
   const buttons=[...document.querySelectorAll('.zs-entry-home .zs-department-card,.zs-entry-home .zs-manager-actions button')];
   const boxes=buttons.map(x=>x.getBoundingClientRect());
   const contentRight=Math.max(...boxes.map(x=>x.right));
   return {
    width:innerWidth,bodyWidth:document.body.scrollWidth,screenWidth:document.querySelector('#zs-stock-screen').scrollWidth,
    cards:buttons.length,
    sectionCols:[...document.querySelectorAll('.zs-entry-home .zs-department-grid,.zs-entry-home .zs-manager-actions')].map(x=>getComputedStyle(x).gridTemplateColumns.split(' ').length),
    labels:buttons.map(x=>x.querySelector('strong')?.textContent),
    titleSizes:buttons.map(x=>parseFloat(getComputedStyle(x.querySelector('strong')).fontSize)),
    subtitleSizes:buttons.map(x=>parseFloat(getComputedStyle(x.querySelector('small')).fontSize)),
    cardMinHeights:boxes.map(x=>x.height),
    textOverflow:buttons.some(x=>[x.querySelector('strong'),x.querySelector('small')].some(y=>y.scrollWidth>y.clientWidth+1)),
    cardOverflow:buttons.some(x=>x.scrollWidth>x.clientWidth+1),
    titleOverlapsDesc:buttons.some(x=>{const a=x.querySelector('strong').getBoundingClientRect(),b=x.querySelector('small').getBoundingClientRect();return b.top<a.bottom-1}),
    iconsVisible:buttons.every(x=>x.querySelector('.zs-entry-card-top')?.getBoundingClientRect().width>0),
    maxRight:contentRight,
    colors:buttons.map(x=>({
      title:getComputedStyle(x.querySelector('strong')).color,
      description:getComputedStyle(x.querySelector('small')).color,
      fill:getComputedStyle(x).backgroundImage
    })),
    toolbar:{background:getComputedStyle(document.querySelector('.zs-screen-toolbar')).backgroundColor,
      text:getComputedStyle(document.querySelector('.zs-screen-brand')).color}
   };
  });
  assert.equal(m.cards,4,'four actions at '+width);
  assert.deepEqual(m.sectionCols,width<350?[1,1]:[2,2],'responsive columns '+width);
  assert.deepEqual(m.labels,['Paint Consumables','Mechanical Consumables','Create Material','Brand & Price']);
  assert.ok(m.titleSizes.every(x=>x>=16),'tiny card titles at '+width);
  assert.ok(m.subtitleSizes.every(x=>x>=13),'tiny help text at '+width);
  assert.ok(m.cardMinHeights.every(x=>x>=120),'touch cards too short at '+width);
  assert.equal(m.titleOverlapsDesc,false,'text overlaps at '+width);
  assert.equal(m.textOverflow,false,'text clipped at '+width);
  assert.equal(m.cardOverflow,false,'card clipped at '+width);
  assert.equal(m.iconsVisible,true);
  assert.ok(m.maxRight<=width+1,'card outside viewport at '+width);
  assert.ok(m.bodyWidth<=width+1,'horizontal scroll at '+width);
  // The landing screen now uses one coordinated light palette instead of
  // saturated dark blocks with white text. Verify actual browser colors.
  const colorRgb=s=>(s.match(/\\d+/g)||[]).slice(0,3).map(Number);
  const luminance=rgb=>rgb.map(v=>{const x=v/255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4})
    .reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
  for(const item of m.colors){
    const stops=[...item.fill.matchAll(/rgb\\(\\d+, \\d+, \\d+\\)/g)].map(x=>colorRgb(x[0]));
    assert.ok(stops.length>=2,'Card must have a soft gradient at '+width);
    for(const fill of stops){
      assert.ok(luminance(fill)>0.78,'Card too dark at '+width);
      assert.ok(contrast(fill,colorRgb(item.title))>=7,'Card title contrast below 7:1 at '+width);
      assert.ok(contrast(fill,colorRgb(item.description))>=4.5,'Card help-text contrast below 4.5:1 at '+width);
    }
  }
  assert.ok(luminance(colorRgb(m.toolbar.background))>0.8,'Toolbar should be light on the chooser at '+width);
  assert.ok(contrast(colorRgb(m.toolbar.background),colorRgb(m.toolbar.text))>=7,'Toolbar brand contrast too low at '+width);
  await page.close();
 }
}finally{await browser.close();}
ctx.me.role='Supervisor';
ctx.window.openStockManagement();
assert.doesNotMatch(screen.innerHTML,/class="zs-create-item"|class="zs-materials-btn"/);
assert.match(screen.innerHTML,/Paint Consumables/);
ctx.me.role='Employee';
ctx.window.zukStockPreviewExit('dashboard');
ctx.window.openStockManagement();
assert.equal(screen,null,'Employee must not access Stock chooser');
assert.equal(networkCalls,0,'home redesign must never write or read stock');
console.log('PASS: Stock home uses unified light palette with accessible contrast, four responsive cards without overflow at 320–1280px; Manager-only setup and routes preserved, no stock API calls');
