import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const suite=fs.readFileSync('tests/v215-spare-parts-entry-regression.mjs','utf8');
const prefix=suite.slice(0,suite.indexOf('\ntest('));
const {fixture}=await import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {fixture};').toString('base64'));
const base=fs.readFileSync('app/src/main/assets/offline_test.html','utf8').match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';
const shared=fs.readFileSync('app/src/main/assets/dashboard_cards.css','utf8');
fs.mkdirSync('artifacts/dashboard-cards',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
try{
 for(const role of ['Manager','Supervisor','Purchaser']){
  const f=fixture(role);await f.parts.open();
  const styles=[...f.elements.values()].map(e=>e.textContent||'').join('\n');
  for(const width of [320,390,768,1280]){
   const page=await browser.newPage({viewport:{width,height:1000}});
   await page.setContent('<style>'+base+'\n'+styles+'\n'+shared+'</style><div id="modal" class="v2-sp-modal-host v2-sp-fullscreen-host"><div class="modal-box">'+f.html()+'</div></div>');
   const result=await page.evaluate(()=>{
    const modal=document.querySelector('#modal'),nav=document.querySelector('.v2-sp-nav');
    return {overflow:modal.scrollWidth>modal.clientWidth+1,nav:getComputedStyle(nav).position,cards:[...document.querySelectorAll('.v2-sp-tile')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,shadow:getComputedStyle(el).boxShadow,ink:getComputedStyle(el).color,label:getComputedStyle(el.querySelector('b')||el).color}))};
   });
   assert.equal(result.overflow,false,role+' horizontal overflow at '+width);
   assert.equal(result.nav,'relative',role+' Close bar stays in document flow');
   assert.ok(result.cards.length>0);
   assert.ok(result.cards.every(c=>c.width>90&&c.height>=90&&c.shadow!=='none'),role+' readable raised cards at '+width);
   if(role!=='Purchaser')assert.ok(result.cards.every(c=>c.ink===c.label),role+' labels inherit contrasting card ink');
   if(width===390)await page.screenshot({path:'artifacts/dashboard-cards/'+role.toLowerCase()+'.png',fullPage:true});
   await page.close();
  }
 }
}finally{await browser.close()}
console.log('Dashboard cards: raised surfaces, label contrast, responsive widths and non-overlapping Close bar passed at 320–1280px.');
