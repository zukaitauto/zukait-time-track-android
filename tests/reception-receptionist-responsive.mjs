import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const user={id:'QA-RC',name:'QA Receptionist',role:'Receptionist',department:'Reception'};
const files=new Map(['receptionist.html','receptionist_session.js','v2/features/insurance/reception.js'].map(path=>['/'+path,fs.readFileSync('app/src/main/assets/'+path,'utf8')]));
const record={rc_no:'RC-QA',revision:1,insurance_company:'QA Insurance',details:{make:'Toyota',model:'Camry',customer:'QA <script>unsafe</script>',registration:'QA123'},location:'VWC',approval_status:'APPROVED',can_edit:true};
for(const engine of ['chromium','webkit']){
 const browser=await playwright[engine].launch({headless:true});
 try{for(const width of [1440,1024,768,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),calls=[],errors=[];
  // Intercept EVERY request. This fixture has no route to any real backend.
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.host==='reception-qa.invalid'&&files.has(url.pathname))return route.fulfill({status:200,contentType:url.pathname.endsWith('.html')?'text/html':'text/javascript',body:files.get(url.pathname)});
   if(!url.hostname.endsWith('.supabase.co'))return route.abort();
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST, OPTIONS'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   const body=route.request().postDataJSON();calls.push(body);let result;
   if(url.pathname.endsWith('/staff-auth'))result={ok:true,user};
   else if(body.action==='receptionist_delivery_list')result={ok:true,rows:[{jobCard:'QA-JC',receptionNo:'RC-QA',vehicle:'Toyota Camry',registration:'QA123',stage:'DELIVERY',deliveryReady:true,expectedQcRevision:2,expectedVehicleIdentity:'QA-VEHICLE'}]};
   else if(body.action==='reception'){
    const op=body.command.operation;result=op==='CAPABILITIES'?{ok:true,allowed:true,manager:false}:op==='MASTER'?{ok:true,companies:[{id:1,name:'QA Insurance'}]}:op==='LIST'?{ok:true,rows:[record]}:op==='GET'?{ok:true,record,insurance:{approval_valid:true,can_prepare:false},job_creation:{can_create:true},external_approval:{valid:true,can_record:false},movements:[],audit:[]}:{ok:false,code:'fixture_unexpected_operation'};
   }else{result={ok:false,code:'fixture_forbidden'};}
   return route.fulfill({status:result.ok?200:403,contentType:'application/json',headers,body:JSON.stringify(result)});
  });
  await context.addInitScript(({user})=>localStorage.setItem('zukait_secure_session_v42',JSON.stringify({user,token:'qa-session'})),{user});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://reception-qa.invalid/receptionist.html');await page.locator('.rc-table tbody tr').waitFor();
  assert.equal(await page.locator('#reception-app nav button').count(),4);
  assert.equal(await page.locator('script').count(),2);
  assert.equal(await page.locator('.rc-table script').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine} ${width} list overflow`);
  await page.locator('[data-rc-action=view]').click();await page.locator('[data-rc-action=insurance]').click();await page.locator('#rc-create-job').waitFor();
  assert.equal(await page.locator('#rc-approval,#rc-external-approval,#rc-link-estimate,[data-rc-action=parts],[data-rc-action=cancel-job]').count(),0);
  assert.equal(await page.locator('#rc-external-job').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine} ${width} Job Card form overflow`);
  await page.locator('[data-rc-action=home]').click();await page.locator('[data-rc-action=new]').click();await page.locator('#rc-form').waitFor();
  await page.locator('[name=make]').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.name),'model');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine} ${width} editor overflow`);
  await page.locator('[data-rc-action=home]').click();await page.locator('[data-rc-action=direct-job]').click();await page.locator('#rc-direct-job').waitFor();
  await page.locator('[name=job_type]').selectOption('CREDIT');assert.equal(await page.locator('#rc-credit-account').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine} ${width} direct credit intake overflow`);
  await page.locator('[name=job_type]').selectOption('CASH');assert.equal(await page.locator('#rc-credit-account').isVisible(),false);
  await page.locator('#deliveries').click();await page.getByRole('button',{name:'Deliver Vehicle',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine} ${width} delivery overflow`);
  assert.ok(!calls.some(c=>['load','save','qc_delivery'].includes(c.action)));
  assert.deepEqual(errors,[]);await context.close();console.log(`${engine} ${width}: Receptionist session, restricted checklist/Job Card/editor/delivery, keyboard and overflow checks passed (mock transport; not physical)`);
 }}finally{await browser.close();}
}
