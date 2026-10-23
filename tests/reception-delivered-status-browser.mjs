import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 for(const role of ['Manager','Supervisor','Receptionist']){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<div id="modal"></div>');
  await page.evaluate(role=>{
   window.me={id:'QA',role};window.users=[];window.state={jobs:[]};window.zukaitAuth={getToken:()=> 'test-only'};
   window.openModal=html=>document.getElementById('modal').innerHTML=html;window.closeModal=()=>{};
   window.fixtureJob={no:'12078',reg:'21224.AA',vehicle:'Range Rover Velar',make:'Range Rover',model:'Velar',jobType:'INSURANCE',receptionNo:'RC0005',delivered:true,status:'Delivered',deliveryDate:'2026-10-16',deliveredAt:Date.parse('2026-10-16T19:00:00+04:00')};
   window.fetch=async(_url,args)=>{const body=JSON.parse(args.body),c=body.command||{};
    if(body.action==='job_card_edit')return {ok:true,json:async()=>({ok:true,job:window.fixtureJob})};
    return {ok:true,json:async()=>({ok:true,record:{rc_no:'RC0005',job_card:'12078',job_type:'INSURANCE',location:'VIW',approval_status:'APPROVED',details:{make:'Range Rover',model:'Velar',registration:'21224.AA'},revision:2},movements:[],audit:[]})};
   };
   window.v112PrintHtml=(html)=>{window.printedJob=html};
  },role);
  await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8')});
  await page.evaluate(()=>window.zukaitReception.openRecord('RC0005'));
  assert.match(await page.locator('.rc-cl-summary').innerText(),/Delivered/);
  assert.match(await page.locator('.rc-cl-summary').innerText(),/16\/10\/2026/);
  assert.doesNotMatch(await page.locator('.rc-cl-summary').innerText(),/VIG|Vehicle In Garage/);
  assert.match(await page.locator('.rc-badge').first().innerText(),/Delivered/);
  assert.equal(await page.evaluate(()=>state.jobs.length),0,'Receptionist delivery display must not require full workshop state');
  await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/job_card_edit.js','utf8')});
  await page.evaluate(()=>window.zukaitJobEdit.view('12078'));
  assert.match(await page.locator('.jce-delivered-status').innerText(),/Delivered/);
  await page.locator('#jce-view-print').click();
  assert.match(await page.evaluate(()=>window.printedJob),/Delivered/);
  await page.close();
 }
 console.log('Delivered checklist and Job Card views/print passed for Manager, Supervisor and Receptionist without cached jobs');
}finally{await browser.close()}
