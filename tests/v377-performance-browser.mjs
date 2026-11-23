import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';

// Exercise the CURRENT eight-card Manager composition, including the two
// original QC buttons that retain their existing click handlers and counters.
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const pos=html.indexOf("const cards=[['Over Allocated'");
assert.ok(pos>=0,'Current Manager Workshop Performance theme exists');
const theme=html.slice(html.lastIndexOf('<script>',pos)+8,html.indexOf('</script>',pos));
const legacyLabels=['Work in Progress','Workshop Efficiency','Repeat Work','Labour Cost','Purchase Cost','Consumables Cost','Cash','Insurance'];
const expected=['overallocated','progress','qc','ready','parts','consumables','cash','insurance'];
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,768,1280]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.abort());
  const legacy=legacyLabels.map((l,i)=>'<button class="v123-perf" onclick="opened.push('+i+')"><span>'+l+'</span><b>12.345 OMR</b></button>').join('');
  const qc='<button class="v123-perf qc-launch" data-perf-key="qc" data-qc-queue="1" onclick="opened.push(\'qc\')"><span class="qc-card-icon">✅</span><span class="qc-card-copy"><b>QC</b><small>Painting / Final quality check</small></span><span class="qc-card-count">2</span></button>';
  const ready='<button class="v123-perf qc-launch" data-perf-key="ready" data-qc-ready="1" onclick="opened.push(\'ready\')"><span class="qc-card-icon">🚘✓</span><span class="qc-card-copy"><b>Ready to Deliver</b><small>Both QC stages passed</small></span><span class="qc-card-count">3</span></button>';
  await page.setContent('<div id="managerView"><section class="v123-manager-performance"><div class="v123-grid">'+legacy+qc+ready+'</div></section></div>');
  await page.evaluate(()=>{
   window.me={role:'Manager',id:'MAN001'};
   window.opened=[];
   window.zukaitWorkshopPerformance={overAllocatedRows:()=>[{assignment:{job:'JC1'},exceeded:95},{assignment:{job:'JC1'},exceeded:25}]};
   window.v377OpenOverAllocated=()=>opened.push('over');
   window.v123ManagerPerformanceOpen=key=>opened.push(key);
   window.openEmployeeEfficiency=()=>opened.push('rank');
  });
  await page.addScriptTag({content:theme});
  await page.waitForFunction(()=>document.querySelectorAll('#managerView .v123-grid button').length===8&&document.querySelectorAll('[data-perf-key]').length===8);
  const cards=await page.locator('#managerView .v123-grid button[data-perf-key]').evaluateAll(es=>es.map(e=>({key:e.dataset.perfKey,order:+getComputedStyle(e).order,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width})).sort((a,b)=>a.order-b.order));
  assert.deepEqual(cards.map(c=>c.key),expected,'Manager overview has the approved four-row order');
  for(let i=0;i<8;i+=2){
   assert.equal(cards[i].y,cards[i+1].y,'cards in row '+(i/2+1)+' align');
   assert.ok(cards[i+1].x>cards[i].x,'right-hand card follows left');
   assert.ok(Math.abs(cards[i].width-cards[i+1].width)<1,'equal two-column widths');
   if(i)assert.ok(cards[i].y>cards[i-2].y,'rows progress vertically');
  }
  assert.equal(await page.locator('[data-perf-key=overallocated] b').textContent(),'1 Jobs');
  assert.equal(await page.locator('[data-perf-key=qc] .qc-card-count').textContent(),'2');
  assert.equal(await page.locator('[data-perf-key=ready] .qc-card-count').textContent(),'3');
  assert.equal(await page.locator('[data-perf-key=repeat]').count(),0);
  assert.equal(await page.locator('[data-perf-key=efficiency]').count(),0);
  for(const key of expected)await page.locator('[data-perf-key='+key+']').click();
  assert.deepEqual(await page.evaluate(()=>opened),['over',0,'qc','ready',4,5,6,7],'old actions retained, existing QC and Ready actions intact');
  await page.evaluate(()=>{
   zukaitWorkshopPerformance.overAllocatedRows=()=>[{assignment:{job:'JC1'},exceeded:125},{assignment:{job:'JC2'},exceeded:35}];
   dispatchEvent(new Event('zukait:state-updated'));
  });
  await page.waitForFunction(()=>document.querySelector('[data-perf-key=overallocated] b').textContent==='2 Jobs');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow at '+width);
  assert.deepEqual(errors,[],'no browser errors at '+width);
  await page.close();
 }
 console.log('PASS Manager Workshop Performance: current 8-card order, responsive rows, QC / Ready original click handlers, over-allocation refresh, no horizontal overflow (320/375/768/1280).');
}finally{await browser.close()}
