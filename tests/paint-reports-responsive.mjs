import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 for(const width of [360,390,768]){
  await page.setViewportSize({width,height:844});
  await page.setContent('<style>*{box-sizing:border-box}body{margin:0;padding:12px;font:14px Arial}.paint-page{max-width:100%}input,select{min-height:40px}button{min-height:40px}</style><div id="modal"></div>');
  await page.evaluate(()=>{
   window.me={id:'M1',role:'Manager'};window.users=[];
   window.openModal=html=>document.getElementById('modal').innerHTML=html;window.closeModal=()=>{};
   window.state={jobs:[],paintPurchasing:{orders:['Base Coat','Pearl Coat','2K Paint'].map((paintType,i)=>({id:'PO'+i,poNumber:'PO-Zi'+i,jobCard:'1200'+i,vendor:'Long vendor name for responsive report verification',createdAt:Date.parse('2026-09-01T00:00:00Z'),receivedAt:Date.parse('2026-10-01T00:00:00Z'),lines:[{id:'l'+i,paintType,quantity:1,lineTotal:10,pricePerLitre:10}],returns:[]}))}};
  });
  await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/print_navigation.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/paint_module.js','utf8')});
  await page.evaluate(()=>{openPaintReports();document.getElementById('paintReportMonth').value='2026-10';paintReportSetMonth()});
  assert.equal(await page.locator('.paint-type-report').count(),3);
  assert.equal(await page.locator('.paint-type-report[open]').count(),0);
  assert.match(await page.locator('#paintReportResult').innerText,/30.000/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Report summary must fit the phone');
  await page.locator('.paint-type-report summary').filter({hasText:'Base Coat'}).click();
  assert.equal(await page.locator('.paint-type-report[open]').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Expanded table must scroll within its card');
  await page.getByRole('button',{name:'PRINT / PDF',exact:true}).click();
  await page.frameLocator('iframe').getByRole('heading',{name:'ZUKAIT AUTO · PAINT REPORT'}).waitFor();
  assert.equal(await page.frameLocator('iframe').locator('.paint-type-report[open]').count(),1);
  await page.getByRole('button',{name:'✕ Close',exact:true}).click();
  assert.equal(await page.locator('.zukait-print-overlay').count(),0);
 }
 console.log('Paint reports: 360/390/768px summaries, expandable details and shared print preview passed');
}finally{await browser.close()}
