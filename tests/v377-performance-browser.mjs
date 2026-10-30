import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const pos=html.indexOf("const cards=[['Work in Progress'");
const theme=html.slice(html.lastIndexOf('<script>',pos)+8,html.indexOf('</script>',pos));
const labels=['Work in Progress','Workshop Efficiency','Repeat Work','Labour Cost','Purchase Cost','Consumables Cost','Cash','Insurance'];
const expected=['overallocated','progress','repeat','efficiency','parts','consumables','cash','insurance'];
const browser=await chromium.launch({headless:true});
try{for(const width of [320,375,768,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 await page.setContent('<div id="managerView"><section class="v123-manager-performance"><div class="v123-grid">'+labels.map((l,i)=>'<button class="v123-perf" onclick="opened.push('+i+')"><span>'+l+'</span><b>12.345 OMR</b></button>').join('')+'</div></section></div>');
 await page.evaluate(()=>{window.opened=[];window.zukaitWorkshopPerformance={overAllocatedRows:()=>[{exceeded:95}]};window.v377OpenOverAllocated=()=>opened.push('over');window.openEmployeeEfficiency=()=>opened.push('eff');});
 await page.addScriptTag({content:theme});await page.waitForFunction(()=>document.querySelectorAll('[data-perf-key]').length===8);
 const cards=await page.locator('[data-perf-key]').evaluateAll(es=>es.map(e=>({key:e.dataset.perfKey,order:+getComputedStyle(e).order,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width})).sort((a,b)=>a.order-b.order));
 assert.deepEqual(cards.map(c=>c.key),expected);for(let i=0;i<8;i+=2){assert.equal(cards[i].y,cards[i+1].y);assert.ok(cards[i+1].x>cards[i].x);assert.ok(Math.abs(cards[i].width-cards[i+1].width)<1);if(i)assert.ok(cards[i].y>cards[i-2].y);}
 assert.equal(await page.locator('[data-perf-key=overallocated] b').textContent(),'1h 35m');
 for(const key of expected)await page.locator('[data-perf-key='+key+']').click();assert.deepEqual(await page.evaluate(()=>opened),['over',0,2,'eff',4,5,6,7]);
 await page.evaluate(()=>{zukaitWorkshopPerformance.overAllocatedRows=()=>[{exceeded:125}];dispatchEvent(new Event('zukait:state-updated'));});await page.waitForFunction(()=>document.querySelector('[data-perf-key=overallocated] b').textContent==='2h 05m');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.close();
}console.log('PASS V377 real Chromium: all eight card routes, exact four rows, 320/375/768/1280 widths, live correction refresh and no runtime errors.');}finally{await browser.close();}
