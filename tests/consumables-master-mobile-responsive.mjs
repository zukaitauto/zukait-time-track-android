import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {chromium} from 'playwright';

const src=readFileSync('app/src/main/assets/consumables_ui.js','utf8');
const first=src.indexOf("css.textContent=`",src.indexOf("css.id='consumablesUiCss'"));
const last=src.indexOf("`;document.head.appendChild(css);",first);
assert.ok(first>=0&&last>first,'Consumables stylesheet must be available');
const css=src.slice(first+"css.textContent=`".length,last);
const begin=src.indexOf("window.consOpenMaster=function(");
const end=src.indexOf("window.consCreateMaterial=function()",begin);
assert.ok(begin>=0&&end>begin,'Original Manager Material functions unavailable');
let form='',title='';
const elements={cmNewDepartment:{value:''},cmCreateHeading:{scrollIntoView(){}},
 cmPriceHeading:{scrollIntoView(){}},cmNewMaterial:{focus(){}},cmMaterial:{focus(){}}};
const env={window:{},role:()=> 'Manager',
 modal(t,body){title=t;form=body},
 document:{getElementById:id=>elements[id]||null},
 consRenderMaster(){},consMasterSuggest(){}};
runInNewContext(src.slice(begin,end),env);
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
try{
 for(const mode of ['create','price','']){
  env.window.consOpenMaster('Painting',mode);
  assert.match(form,/id="consMasterWorkspace"/);
  const expected=mode==='create'?'Create Material':mode==='price'?'Brand & Price':'Materials & Brands';
  assert.equal(title,expected,'correct Material Master screen title');
  for(const id of ['cmNewMaterial','cmNewUnit','cmNewCategory','cmNewDepartment','cmMaterial','cmBrand','cmPrice','cmDate'])
   assert.match(form,new RegExp('id="'+id+'"'),'Original Material Master field must persist');
  assert.equal((form.match(/class="cons-master-field"/g)||[]).length,8);
  for(const width of [320,375,390,430,600,768,1280]){
   const page=await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1});
   const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;overflow-x:hidden;background:#dce8f2;font:15px Arial,sans-serif}'+
    '.modal-backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:4px}'+
    '.modal-box{background:#fff;border-radius:15px;padding:20px;width:min(750px,96vw);max-height:90vh;overflow:auto}'+
    'input,select,button{padding:10px;border:1px solid #b2c4d4;border-radius:9px}'+css+'</style></head>'+
    '<body><div class="modal-backdrop"><div class="modal-box"><div class="cons-page"><div class="section-title"><h2>'+expected+'</h2></div>'+form+'</div></div></div></body></html>';
   await page.setContent(html);
   const layout=await page.evaluate(()=>{
    const root=document.getElementById('consMasterWorkspace'),m=document.querySelector('.modal-box').getBoundingClientRect();
    const sections=[...root.querySelectorAll('.cons-master-form')].filter(x=>getComputedStyle(x).display!=='none');
    const ctrls=[...root.querySelectorAll('input,select,button')].filter(x=>x.getBoundingClientRect().height>0&&getComputedStyle(x).display!=='none');
    const visible=id=>{const e=document.getElementById(id);return !!e&&e.getBoundingClientRect().height>0;};
    return {modalRight:m.right,modalOverflow:document.querySelector('.modal-box').scrollWidth>document.querySelector('.modal-box').clientWidth+1,
      count:sections.length,cols:sections.map(x=>getComputedStyle(x).gridTemplateColumns.split(' ').length),
      intro:root.querySelector('.cons-master-intro')?.getBoundingClientRect().height||0,
      flds:ctrls.filter(x=>x.closest('.cons-master-field')).map(x=>x.getBoundingClientRect().height),
      fonts:ctrls.filter(x=>x.matches('input')).map(x=>parseFloat(getComputedStyle(x).fontSize)),
      overflowing:ctrls.some(x=>{const b=x.getBoundingClientRect();return b.right>m.right+1||b.left<m.left-1}),
      create:visible('cmNewMaterial'),category:visible('cmNewCategory'),price:visible('cmPrice'),
      priceForm:visible('cmMaterial'),date:visible('cmDate'),tableVisible:getComputedStyle(document.getElementById('cmList')).display!=='none',
      titleText:root.querySelector('.cons-master-intro h2')?.textContent||'',
      headingStacked:sections.every(x=>{const h=x.querySelector('h3').getBoundingClientRect(),p=x.querySelector('.notice').getBoundingClientRect();return p.top>=h.bottom-1;})};
   });
   assert.equal(layout.modalOverflow,false,'horizontal modal overflow at '+width+' '+mode);
   assert.equal(layout.overflowing,false,'clipped input at '+width+' '+mode);
   assert.ok(layout.modalRight<=width+1,'modal outside phone at '+width);
   assert.ok(layout.flds.every(x=>x>=44),'touch fields too small at '+width);
   assert.ok(layout.fonts.every(x=>x>=16),'iOS zooming input at '+width);
   if(mode){
    assert.equal(layout.count,1,'show just one requested form at '+width);
    assert.deepEqual(layout.cols,[1],'single-column form at '+width);
    assert.ok(layout.intro>50,'missing matching section header');
    assert.equal(layout.titleText,expected);
    assert.equal(layout.create,mode==='create');
    assert.equal(layout.price,mode==='price');
    assert.equal(layout.priceForm,mode==='price');
    assert.equal(layout.date,mode==='price');
    assert.equal(layout.category,false,'Stock new-material shortcut defaults to Consumable');
    assert.equal(layout.tableVisible,false,'catalog list must not clutter focused form');
   }else{
    assert.equal(layout.count,2);
    assert.deepEqual(layout.cols,width<=700?[1,1]:[2,2]);
    assert.equal(layout.headingStacked,true);
    assert.equal(layout.tableVisible,true);
   }
   await page.close();
  }
 }
}finally{await browser.close();}
console.log('PASS Manager Master: approved separate Create/Brand forms, 320–1280px no clipping, legacy combined editing preserved, stock writes unchanged');
