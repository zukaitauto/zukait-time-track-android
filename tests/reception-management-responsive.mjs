import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
// Local fixture only; no deployed API, credentials or production data.
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const width of [390,768,1024,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.setContent('<style>body{margin:0;font:16px Arial}*{box-sizing:border-box}button,input,select,textarea{font:inherit;max-width:100%}#rc-root{padding:12px}label{display:block}button{padding:12px}input,select,textarea{width:100%}</style><main id="rc-root"></main>');
  await page.evaluate(()=>{
   window.me={id:'QA-MGR',role:'Manager'};
   window.zukaitReception={dashboardShell:(title,html)=>document.querySelector('#rc-root').innerHTML='<h2>'+title+'</h2><div id="rc-error"></div>'+html,action:async()=>({ok:true,summary:{collected_amount:12345.678,delivered_count:123,approval_pending:12,wip_count:34},companies:['Long Insurance Company Name'],company_breakdown:[],rows:[{job_card:'JC10000',date:'2026-10-12',vehicle:'Toyota Land Cruiser 2025',insurance_company:'Long Insurance Company Name',claim:'CLAIM-LONG-1234567890',lpo_amount:null,lpo_received_date:'',lpo_revision:0,lpo_history:[]}],total:1})};
  });
  await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/insurance_management.js','utf8')});
  await page.evaluate(()=>window.zukaitInsuranceManagement.open());
  const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(await overflow(),false,'Insurance list overflow at '+width);
  await page.locator('[data-section=pending]').click();await page.locator('[data-ins=lpo]').click();assert.equal(await overflow(),false,'LPO form overflow at '+width);
  await page.close();
 }}finally{await browser.close();}
}
console.log('PASS: Insurance summaries, responsive list and LPO forms at 390/768/1024/1440 in Chromium/WebKit');
