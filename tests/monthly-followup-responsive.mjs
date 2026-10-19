import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try {
 for(const width of [320,390,768,1280]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.setContent('<style>*{box-sizing:border-box}body{margin:0;padding:12px;font:15px Arial;color:#18324a;background:#eef4fa}button{font:inherit}#modal{background:white;padding:12px}.section-title{display:flex;justify-content:space-between;gap:12px}h2{font-size:20px}</style><main id="managerView"></main><div id="modal"></div>');
  await page.evaluate(()=>{
   const now=Date.now(),day=new Date(now+14400000).toISOString().slice(0,10);
   window.me={role:'Manager'};
   window.state={jobs:[{no:'12029',jobType:'INSURANCE',vehicle:'Toyota Camry',year:'2014',reg:'55331 R',createdAt:now,insuranceCompany:'Liva Insurance',insuranceLpo:{amount:123456.789,receivedDate:day}},{no:'12030',jobType:'INSURANCE',vehicle:'Nissan Altima',reg:'12345 A',createdAt:now,delivered:true,deliveredAt:now},{no:'12031',jobType:'CASH',vehicle:'Toyota Corolla',reg:'4321 B',createdAt:now,amount:123456.789}]};
   window.openModal=html=>document.querySelector('#modal').innerHTML=html;
   window.closeModal=()=>document.querySelector('#modal').innerHTML='';
  });
  await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/cash_monthly_pulse.js','utf8')});
  await page.evaluate(()=>window.v251CashPulse.install());
  assert.equal(await page.locator('.v251-cash-circle').count(),3);
  assert.equal(await page.locator('.v251-followup-card').count(),3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Page overflow at '+width);
  const boxes=await page.locator('.v251-cash-circle,.v251-followup-card').evaluateAll(els=>els.map(el=>({radius:getComputedStyle(el).borderRadius,width:el.clientWidth,scroll:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight})));
  for(const box of boxes){assert.equal(box.radius,'16px');assert.ok(box.scroll<=box.width+1,'Card horizontal overflow at '+width);assert.ok(box.scrollHeight<=box.height+1,'Card vertical overflow at '+width);}
  await page.getByRole('button',{name:/INSURANCE IN/}).click();assert.match(await page.locator('#modal').innerText(),/12029/);
  await page.getByRole('button',{name:/INSURANCE OUT/}).click();assert.match(await page.locator('#modal').innerText(),/12030/);
  await page.getByRole('button',{name:/LPO COLLECTED/}).click();assert.match(await page.locator('#modal').innerText(),/OMR 123456.789/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Insurance list overflow at '+width);
  fs.mkdirSync('artifacts/monthly-followup',{recursive:true});
  await page.evaluate(()=>window.closeModal());
  await page.screenshot({path:'artifacts/monthly-followup/manager-'+width+'.png',fullPage:true});
  await page.close();
 }
}finally{await browser.close();}
console.log('PASS: six clickable follow-up boxes, readable card bounds and insurance lists at 320/390/768/1280px');
