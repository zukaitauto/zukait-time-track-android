import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.setContent('<main id="managerView"><header class="v135-manager-header">Manager</header><input id="search" aria-label="Job Card Search"><div style="height:1800px"></div></main><span id="net">Online</span><div id="modal"></div>');
 await page.evaluate(()=>{window.me={role:'Manager'};window.state={jobs:[{no:'QA1',jobType:'CASH',createdAt:Date.now(),amount:100},{no:'QA2',jobType:'INSURANCE',createdAt:Date.now(),amount:200}]};window.openModal=html=>document.querySelector('#modal').innerHTML=html;});
 const source=fs.readFileSync('app/src/main/assets/cash_monthly_pulse.js','utf8');
 await page.addScriptTag({content:source});await page.evaluate(()=>window.v251CashPulse.install());
 await page.evaluate(()=>{window.savedCash=document.querySelector('.v251-cash-circle.in');window.savedInsurance=document.querySelector('.insurance-in');window.search=document.getElementById('search');search.value='12195';search.focus();search.setSelectionRange(2,4);window.scrollTo(0,350);window.originalScroll=scrollY;window.changes=0;new MutationObserver(records=>window.changes+=records.length).observe(document.querySelector('.v251-followup-layout'),{childList:true,subtree:true,attributes:true,characterData:true});});
 // Real elapsed five minutes, one remote update per minute and repeated sync signals.
 for(let i=0;i<60;i++){
  await page.evaluate(i=>{if(i%12===6){state.jobs[0].amount+=1;state.jobs[1].amount+=2;}for(const n of ['zukait:state-synced','zukait:state-updated','zukait:cloud-sync'])window.dispatchEvent(new Event(n));},i);
  await page.waitForTimeout(5000);
  const check=await page.evaluate(()=>({cash:document.querySelector('.v251-cash-circle.in')===savedCash,insurance:document.querySelector('.insurance-in')===savedInsurance,search:document.getElementById('search')===search,focused:document.activeElement===search,value:search.value,start:search.selectionStart,end:search.selectionEnd,scroll:scrollY,original:originalScroll,amount:savedCash.querySelector('data').getAttribute('aria-label'),insuranceAmount:savedInsurance.querySelector('data').getAttribute('aria-label'),changes}));
  assert.ok(check.cash&&check.insurance&&check.search&&check.focused);assert.equal(check.value,'12195');assert.equal(check.start,2);assert.equal(check.end,4);assert.equal(check.scroll,check.original);assert.equal(check.amount,'OMR '+(100+Math.floor((i+6)/12)).toFixed(3));assert.equal(check.insuranceAmount,'OMR '+(200+Math.floor((i+6)/12)*2).toFixed(3));
  if(i%12!==6&&i>0)assert.equal(check.changes,previous,'identical data must cause zero card DOM mutations');var previous=check.changes;
 }
 console.log('PASS actual five-minute monthly dashboard stability, live changed amounts, stable card identities, search focus/cursor/scroll and unchanged refresh mutations');
}finally{await browser.close();}
