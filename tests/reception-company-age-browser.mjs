import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {receptionDashboardProjection} from '../supabase/functions/workshop-api/reception_dashboard_rules.js';
const now=Date.parse('2026-10-23T06:00:00Z');
const data={jobs:Array.from({length:70},(_,i)=>({no:'JC'+i,jobType:i%3===0?'CASH':'INSURANCE',insuranceCompany:i%3===0?'':i%3===1?'Alpha Insurance':'Beta Insurance',createdAt:Date.parse('2026-10-20T06:00:00Z')+i*1000,status:'Open',reg:'REG'+i,vehicle:'Test Vehicle',promiseDate:''}))};
const browser=await chromium.launch({headless:true});
try{
 for(const role of ['Manager','Supervisor','Receptionist']){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.exposeFunction('projectDashboard',body=>receptionDashboardProjection(data,[],body,now));
  await page.setContent('<style>*{box-sizing:border-box}body{margin:0;padding:10px;font-family:Arial}button,input,select{max-width:100%}</style><div id="modal"></div>');
  await page.evaluate(role=>{
   window.me={id:'QA',role};
   window.zukaitReception={endpoint:'test-only',dashboardShell:(_title,body)=>document.getElementById('modal').innerHTML='<div id="rc-root">'+body+'</div>',action:body=>window.projectDashboard(body)};
  },role);
  await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/reception_dashboard.js','utf8')});
  await page.evaluate(async()=>{await zukaitReceptionDashboard.open({backendAvailable:true});await zukaitReceptionDashboard.choose('followup')});
  assert.equal(await page.locator('.rdb-row').count(),50);
  assert.equal(await page.locator('.rdb-open-days').first().innerText(),'Days open: 3');
  const filter=page.locator('[data-rdb-filter="company_filter"]');
  assert.ok((await filter.locator('option').allTextContents()).includes('Alpha Insurance'));
  await filter.selectOption('insurer:ALPHA INSURANCE');
  await page.waitForFunction(()=>document.querySelectorAll('.rdb-row').length===23);
  assert.match(await page.locator('#rdb-page').innerText(),/of 23/);
  assert.equal(await page.locator('.rdb-insurer').count(),23);
  assert.ok((await page.locator('.rdb-insurer').allTextContents()).every(t=>t==='Alpha Insurance'));
  await filter.selectOption('cash');
  await page.waitForFunction(()=>document.querySelectorAll('.rdb-row').length===24);
  assert.equal(await page.locator('.rdb-insurer').count(),0);
  await filter.selectOption('all');
  await page.waitForFunction(()=>document.querySelectorAll('.rdb-row').length===50);
  await page.locator('[data-rdb="next"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.rdb-row').length===20);
  await filter.selectOption('cash');
  await page.waitForFunction(()=>document.querySelectorAll('.rdb-row').length===24);
  assert.match(await page.locator('#rdb-page').innerText(),/Showing 1/,'Company changes reset pagination');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Company filter and age count fit the phone');
  await page.close();
 }
 console.log('Reception company filters and Days Open: all roles, server totals, pagination reset and phone layout passed');
}finally{await browser.close()}
