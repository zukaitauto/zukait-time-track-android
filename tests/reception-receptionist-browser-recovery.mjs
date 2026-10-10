// Real Chromium/WebKit browser contexts, actual Receptionist client code and
// browser-persisted localStorage. All HTTPS is intercepted, NOT production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');

const host='reception-recovery.invalid';
const apiHost='pjknotnjkufadqavcmii.supabase.co';
const user={id:'QA-RC',name:'QA Browser Receptionist',role:'Receptionist',department:'Reception'};
const files=new Map(['receptionist.html','receptionist_session.js',
 'v2/features/insurance/reception.js','reception_dashboard.js'].map(
  path=>['/'+path,fs.readFileSync('app/src/main/assets/'+path,'utf8')]));
const testKey='zukait_receptionist_delivery_v1:https://'+apiHost+'/functions/v1/:QA-RC';
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*',
 'access-control-allow-methods':'POST, OPTIONS'};
const fixtureRecord={rc_no:'RC-QA-RESTART',revision:1,insurance_company:'Synthetic',
 details:{make:'Toyota',model:'Camry',registration:'QA-RESTART'},location:'VWC',
 approval_status:'APPROVED',can_edit:true};

for(const engine of ['chromium','webkit']){
 const browser=await playwright[engine].launch({headless:true});
 try{
  for(const fault of ['lost','truncated']){
   const jobCard='QA-BROWSER-'+fault.toUpperCase(),wire=[],errors=[];
   let commits=0,delivered=false;
   async function installNetwork(context){
    await context.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(url.hostname===host&&files.has(url.pathname)){
      return route.fulfill({status:200,contentType:url.pathname.endsWith('.html')?
        'text/html':'text/javascript',body:files.get(url.pathname)});
     }
     if(url.hostname!==apiHost||url.pathname!=='/functions/v1/workshop-api'&&
        url.pathname!=='/functions/v1/staff-auth')return route.abort();
     if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
     assert.equal(request.method(),'POST');
     const body=request.postDataJSON();
     const json=result=>route.fulfill({status:result.ok?200:403,contentType:'application/json',
      headers,body:JSON.stringify(result)});
     if(body.action==='session')return json({ok:true,user});
     if(body.action==='reception_dashboard')return json({ok:true,section:body.section||'checklists',
      counts:{checklists:0,jobs:0,ready:delivered?0:1,delivered:delivered?1:0},
      rows:[],total:0,page:0,page_size:50});
     if(body.action==='reception'){
      const op=body.command?.operation;
      const result=op==='CAPABILITIES'?{ok:true,allowed:true,manager:false}:
       op==='MASTER'?{ok:true,companies:[{id:1,name:'Synthetic'}]}:
       op==='LIST'?{ok:true,rows:[]}:op==='GET'?{ok:true,record:fixtureRecord,
        insurance:{approval_valid:true,can_prepare:false},job_creation:{can_create:false},
        movements:[],audit:[]}:{ok:false,code:'fixture_invalid_operation'};
      return json(result);
     }
     if(body.action==='receptionist_delivery_list'){
      return json({ok:true,rows:[{jobCard,receptionNo:'RC-QA-RESTART',
       vehicle:'Toyota Camry',registration:'QA-RESTART',
       stage:delivered?'DELIVERED':'DELIVERY',delivered,deliveryReady:!delivered,
       expectedQcRevision:2,expectedVehicleIdentity:'QA-IDENTITY-RESTART'}]});
     }
     assert.equal(body.action,'receptionist_deliver','Only allowlisted mock mutations permitted');
     assert.equal(body.jobCard,jobCard);
     assert.equal(body.operation,'DELIVER');
     wire.push(structuredClone(body));
     if(!delivered){
      delivered=true;commits++;
      if(fault==='lost')return route.abort('failed'); // Commit occurred, response lost
      return route.fulfill({status:200,contentType:'application/json',
       headers,body:'{"ok":true,"job":'}); // Commit occurred, response truncated
     }
     return json({ok:true,duplicate:true,job:{jobCard,delivered:true}});
    });
   }
   const context=await browser.newContext({viewport:{width:390,height:844}});
   await installNetwork(context);
   await context.addInitScript(({user})=>{
    if(!localStorage.getItem('zukait_secure_session_v42'))
     localStorage.setItem('zukait_secure_session_v42',JSON.stringify({user,token:'qa-mocked-token'}));
   },{user});
   let page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',d=>d.accept());
   await page.goto('https://'+host+'/receptionist.html');
   await page.locator('#reception-app:not(.hidden)').waitFor();
   await page.locator('#deliveries').click();
   await page.getByRole('button',{name:'Deliver Vehicle',exact:true}).waitFor();
   await page.getByRole('button',{name:'Deliver Vehicle',exact:true}).click();
   await page.locator('#retry-delivery').waitFor();
   assert.equal(commits,1,engine+' '+fault+' must commit mock delivery once');
   assert.equal(wire.length,1,engine+' '+fault+' must send once before restart');
   const pending=await page.evaluate(()=>window.zukaitReceptionist.pending());
   assert.equal(pending.request_id,wire[0].request_id);
   assert.deepEqual(pending,wire[0]);
   assert.match(await page.locator('#workspace').innerText(),/Delivery awaits server confirmation/);
   const stored=await page.evaluate(key=>localStorage.getItem(key),testKey);
   assert.ok(stored,'Original request must be persisted in browser localStorage');
   assert.ok(!await page.getByRole('button',{name:'Deliver Vehicle',exact:true}).count(),
    'Delivered vehicle cannot offer another first delivery with a journal pending');
   const saved=await context.storageState();
   await context.close(); // Simulate browser context/process termination.
   const reopened=await browser.newContext({viewport:{width:390,height:844},storageState:saved});
   await installNetwork(reopened);
   page=await reopened.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://'+host+'/receptionist.html');
   await page.locator('#reception-app:not(.hidden)').waitFor();
   assert.equal(wire.length,1,'Restoring session must never auto-submit saved delivery');
   await page.locator('#deliveries').click();
   await page.locator('#retry-delivery').waitFor();
   assert.deepEqual(await page.evaluate(()=>window.zukaitReceptionist.pending()),pending,
    'Browser must restore original UUID and exact vehicle identity');
   assert.equal(wire.length,1,'Opening Vehicle Delivery must not auto-replay');
   await page.locator('#retry-delivery').click();
   await page.waitForFunction(()=>window.zukaitReceptionist.pending()===null);
   assert.equal(wire.length,2);
   assert.deepEqual(wire[1],wire[0],'Explicit retry must reuse identical request body/UUID');
   assert.equal(commits,1,'Original delivery must not be duplicated by retry');
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),testKey),null,
    'Confirmed matching replay must clear browser journal');
   assert.ok(!await page.locator('#retry-delivery').count(),
    'No stale retry button after server confirmation');
   assert.deepEqual(errors,[],engine+' '+fault+' unhandled page errors');
   await reopened.close();
   console.log('PASS '+engine+' '+fault+': real browser localStorage persistence, restart, explicit UUID retry and single mock commit');
  }
 }finally{await browser.close();}
}
console.log('PASS: Chromium/WebKit x lost/truncated response = 4 browser recovery scenarios (mock backend only).');
