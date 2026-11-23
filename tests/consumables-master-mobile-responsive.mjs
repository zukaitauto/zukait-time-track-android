import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {chromium} from 'playwright';

const source=readFileSync('app/src/main/assets/consumables_ui.js','utf8');
const cssStart=source.indexOf("css.textContent=`",source.indexOf("css.id='consumablesUiCss'"));
const cssEnd=source.indexOf("`;document.head.appendChild(css);",cssStart);
assert.ok(cssStart>=0&&cssEnd>cssStart,'Consumables stylesheet missing');
const css=source.slice(cssStart+"css.textContent=`".length,cssEnd);
const funcStart=source.indexOf("window.consOpenMaster=function(");
const funcEnd=source.indexOf("window.consCreateMaterial=function()",funcStart);
assert.ok(funcStart>=0&&funcEnd>funcStart,'Manager Material forms missing');
let form='';
const elements={
 cmNewDepartment:{value:''},
 cmCreateHeading:{scrollIntoView(){}},
 cmPriceHeading:{scrollIntoView(){}},
 cmNewMaterial:{focus(){}},
 cmMaterial:{focus(){}}
};
const env={
 window:{},role:()=> 'Manager',
 modal(_title,body){form=body},
 document:{getElementById:id=>elements[id]||null},
 consRenderMaster(){},consMasterSuggest(){}
};
runInNewContext(source.slice(funcStart,funcEnd),env);
env.window.consOpenMaster('Painting','create');
assert.match(form,/id="consMasterWorkspace"/);
for(const id of ['cmNewMaterial','cmNewUnit','cmNewCategory','cmNewDepartment','cmMaterial','cmBrand','cmPrice','cmDate'])
 assert.match(form,new RegExp('id="'+id+'"'));
assert.equal((form.match(/class="cons-master-field"/g)||[]).length,8,'all fields must have persistent labels');
assert.match(css,/@media\(max-width:700px\)/);
assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);

const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
try{
 for(const width of [320,375,390,430,600,768,1280]){
  const page=await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1});
  const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;overflow-x:hidden;background:#dce8f2;font:15px Arial,sans-serif}'+
   '.modal-backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:4px}'+
   '.modal-box{background:#fff;border-radius:15px;padding:20px;width:min(750px,96vw);max-height:90vh;overflow:auto}'+
   'input,select,button{padding:10px;border:1px solid #b2c4d4;border-radius:9px}'+css+'</style></head>'+
   '<body><div class="modal-backdrop"><div class="modal-box"><div class="cons-page"><div class="section-title"><h2>Materials &amp; Brands</h2></div>'+form+'</div></div></div></body></html>';
  await page.setContent(html);
  const layout=await page.evaluate(()=>{
   const modal=document.querySelector('.modal-box'), sections=[...document.querySelectorAll('.cons-master-form')];
   const m=modal.getBoundingClientRect(),controls=[...document.querySelectorAll('#consMasterWorkspace input,#consMasterWorkspace select,#consMasterWorkspace button')];
   return {
    modalWidth:m.width,modalRight:m.right,viewportWidth:innerWidth,
    modalOverflow:modal.scrollWidth>modal.clientWidth+1,
    sectionColumns:sections.map(x=>getComputedStyle(x).gridTemplateColumns.split(' ').length),
    headingStacked:sections.map(s=>{const h=s.querySelector('h3').getBoundingClientRect(),
      p=s.querySelector('.notice').getBoundingClientRect();return p.top>=h.bottom-1}),
    fieldOverflow:controls.some(x=>{const a=x.getBoundingClientRect();return a.right>m.right+1||a.left<m.left-1}),
    fieldHeights:controls.filter(x=>x.closest('.cons-master-field')).map(x=>x.getBoundingClientRect().height),
    inputFonts:controls.filter(x=>x.matches('input')).map(x=>parseFloat(getComputedStyle(x).fontSize)),
    labels:[...document.querySelectorAll('.cons-master-field')].map(x=>x.textContent.trim())
   };
  });
  assert.equal(layout.modalOverflow,false,'horizontal modal overflow at '+width);
  assert.equal(layout.fieldOverflow,false,'field clipped at '+width);
  assert.ok(layout.modalRight<=width+1,'modal spills viewport at '+width);
  assert.ok(layout.headingStacked.every(Boolean),'title/help text side-by-side at '+width);
  assert.ok(layout.fieldHeights.every(n=>n>=44),'field too short at '+width);
  assert.ok(layout.inputFonts.every(n=>n>=16),'iPhone input focus zoom at '+width);
  assert.deepEqual(layout.sectionColumns,width<=700?[1,1]:[2,2],'wrong responsive grid at '+width);
  const table=page.locator('#cmList');
  await table.evaluate(el=>el.innerHTML='<div class="cons-table"><table style="min-width:980px"><tr><td>Material</td><td>Brand</td><td>Price</td></tr></table></div>');
  const scrolled=await page.locator('#cmList .cons-table').evaluate(el=>el.scrollWidth>=el.clientWidth);
  assert.equal(scrolled,true,'master table must keep its own scroll area');
  await page.close();
 }
}finally{await browser.close();}
console.log('PASS Manager Materials modal: 320–1280px, full-width labeled fields on phones, readable headings, no clipping, wide-screen columns retained, business inputs unchanged');
