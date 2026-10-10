// Actual Chromium/WebKit fetch over HTTPS to the isolated QA Edge API.
// Negative-authentication browser test only: NO valid staff tokens or mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');

const QA_REF='omqgkqknbdcnotabffek';
const QA_KEY='sb_publishable_DBp6FI8Z4ThAq_4LXrZXSg_Xw2uPPgO';
const PROD_REF='pjknotnjkufadqavcmii';
const PROD_KEY='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';
const origin='https://zukait-reception-browser-qa.invalid';
const endpoint='https://'+QA_REF+'.supabase.co/functions/v1/';
const actor={id:'ZQA_RC_V305_RECEPTION',name:'Isolated Browser QA',role:'Receptionist',department:'Reception'};
const SESSION='zukait_secure_session_v42';
const journalKey='zukait_receptionist_delivery_v1:'+endpoint+':'+actor.id;
const pending={action:'receptionist_deliver',operation:'DELIVER',
 jobCard:'ZQA-BROWSER-NOAUTH',expectedQcRevision:0,expectedVehicleIdentity:'QA-ONLY',
 request_id:'c614d286-bae9-4c65-a105-1a3f2a809dbb'};
const assetNames=['receptionist.html','receptionist_session.js',
 'v2/features/insurance/reception.js','reception_dashboard.js'];
const assets=new Map(assetNames.map(name=>{
 const src=fs.readFileSync('app/src/main/assets/'+name,'utf8');
 const safe=src.replaceAll(PROD_REF,QA_REF).replaceAll(PROD_KEY,QA_KEY);
 assert.ok(!safe.includes(PROD_REF)&&!safe.includes(PROD_KEY),
  'No production endpoint/key permitted in QA browser source: '+name);
 return ['/'+name,safe];
}));

async function installRoutes(context,wire){
 context.on('request',request=>{
  if(request.url().startsWith(endpoint)&&request.method()==='POST'){
   const body=request.postDataJSON();
   wire.push({action:body.action,operation:body.command?.operation||body.operation||null});
   assert.ok(['session','login','receptionist_deliver'].includes(body.action),
    'Unexpected real QA request from browser: '+body.action);
  }
 });
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin&&assets.has(url.pathname)){
   return route.fulfill({status:200,
    contentType:url.pathname.endsWith('.html')?'text/html':'application/javascript',
    body:assets.get(url.pathname)});
  }
  if(url.origin==='https://'+QA_REF+'.supabase.co'&&url.pathname.startsWith('/functions/v1/')){
   return route.continue(); // Real browser network and real QA HTTPS/CORS.
  }
  return route.abort(); // Fail closed for all other hosts.
 });
}
for(const name of ['chromium','webkit']){
 const browser=await playwright[name].launch({headless:true});
 try {
  // Expired session must not silently replay, delete, or confirm an old delivery.
  const context=await browser.newContext({viewport:{width:1250,height:760}});
  const wire=[],errors=[];
  await installRoutes(context,wire);
  await context.addInitScript(({SESSION,actor,journalKey,pending})=>{
   localStorage.setItem(SESSION,JSON.stringify({user:actor,token:'QA_BROWSER_INVALID_SESSION'}));
   localStorage.setItem(journalKey,JSON.stringify(pending));
  },{SESSION,actor,journalKey,pending});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/receptionist.html');
  await page.waitForFunction(()=>document.querySelector('#message')?.textContent?.length>0,
   null,{timeout:30000});
  assert.match(await page.locator('#message').innerText(),/session|expired|sign in/i);
  assert.equal(await page.locator('#login').isVisible(),true);
  assert.equal(await page.locator('#reception-app').isVisible(),false);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),SESSION),null,
   'Expired QA test login should be cleared');
  assert.deepEqual(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),journalKey)),
   pending,'Expired session must retain original delivery UUID/body');
  assert.deepEqual(wire,[{action:'session',operation:null}],
   'Expired browser session must never submit pending delivery');

  // Explicit browser HTTPS delivery probe must be rejected BEFORE any commit.
  const denied=await page.evaluate(async ({endpoint,QA_KEY,pending})=>{
   const response=await fetch(endpoint+'workshop-api',{
    method:'POST',headers:{
     'Content-Type':'application/json',apikey:QA_KEY,
     'x-zukait-session':'QA_BROWSER_INVALID_SESSION'
    },body:JSON.stringify(pending)});
   return {status:response.status,body:await response.json()};
  },{endpoint,QA_KEY,pending});
  assert.equal(denied.status,401,name+' must see 401 through real CORS');
  assert.equal(denied.body.code,'invalid_session');
  assert.deepEqual(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),journalKey)),
   pending,'401 must not destroy saved delivery journal');
  assert.deepEqual(wire.map(v=>v.action),['session','receptionist_deliver']);
  assert.deepEqual(errors,[],'Unhandled page errors');
  await context.close();

  // Actual sign-in form must refuse unknown synthetic QA account.
  const guest=await browser.newContext({viewport:{width:390,height:844}});
  const guestWire=[],guestErrors=[];
  await installRoutes(guest,guestWire);
  const login=await guest.newPage();
  login.on('pageerror',e=>guestErrors.push(e.message));
  await login.goto(origin+'/receptionist.html');
  await login.locator('#user-id').fill('ZQA_BROWSER_NOT_A_USER');
  await login.locator('#password').fill('NeverValidBrowserQA');
  await login.locator('#login button[type="submit"]').click();
  await login.waitForFunction(()=>document.querySelector('#message')?.textContent?.length>0,
   null,{timeout:30000});
  assert.match(await login.locator('#message').innerText(),/incorrect|invalid|locked/i);
  assert.equal(await login.locator('#login').isVisible(),true);
  assert.equal(await login.evaluate(key=>localStorage.getItem(key),SESSION),null);
  assert.deepEqual(guestWire,[{action:'login',operation:null}]);
  assert.deepEqual(guestErrors,[]);
  await guest.close();
  console.log('PASS '+name+': real QA HTTPS/CORS, invalid session preserves delivery journal, zero unauthorized commits, unknown sign-in denied');
 } finally {await browser.close();}
}
console.log('QA Chromium/WebKit live HTTPS browser DENIAL checks passed; no authorized client/fault recovery and no production writes.');
