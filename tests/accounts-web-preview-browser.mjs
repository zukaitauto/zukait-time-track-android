import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const live=process.env.ACCOUNTS_PREVIEW_LIVE==='true',base=live?'https://zukaitauto.github.io/zukait-time-track-android/':'https://preview.invalid/',prefix='previews/accounts-cash-invoices/';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
try{for(const width of [320,375,768,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url())});
 if(!live)await page.route('**/*',r=>{const url=new URL(r.request().url());assert.equal(url.origin,new URL(base).origin);const file=path.resolve('_site','.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));assert.ok(file.startsWith(path.resolve('_site')+'/'));return r.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'})});
 await page.goto(base+prefix);const frame=page.frameLocator('iframe');
 await frame.getByRole('button',{name:'Cash Invoices',exact:true}).click();
 await frame.locator('#cash-invoice-total-amount').filter({hasText:'235.500'}).waitFor();
 assert.match(await frame.locator('#rows').innerText(),/DEMO-001/);
 await page.evaluate(()=>localStorage.setItem('preview-parent-sentinel','parent session unchanged'));
 await page.screenshot({path:`artifacts/accounts-preview/${live?'live':'staged'}-invoices-${width}.png`,fullPage:true});
 await frame.locator('#cash-entry').click();await frame.locator('#cash-entry-dialog').waitFor({state:'visible'});
 await frame.locator('#kind').selectOption('CASH_OUT');
 const isolation=await frame.locator('body').evaluate(async()=>{
  const read=localStorage.getItem('zukait_secure_session_v42');let denied=false;try{await fetch('https://visual-preview.invalid/functions/v1/workshop-api',{method:'POST',body:JSON.stringify({action:'accountant_command'})})}catch{denied=true}
  return {denied,read,origin:window.origin,overflow:document.documentElement.scrollWidth>innerWidth+1};
 });assert.equal(isolation.denied,true);assert.equal(isolation.origin,'null','preview must have opaque sandbox origin');assert.match(isolation.read,/VISUAL-PREVIEW/);assert.equal(isolation.overflow,false);assert.deepEqual(external,[],'no external/API requests');assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.getItem('preview-parent-sentinel')),'parent session unchanged');
 fs.mkdirSync('artifacts/accounts-preview',{recursive:true});await page.screenshot({path:`artifacts/accounts-preview/${live?'live':'staged'}-${width}.png`,fullPage:true});await page.close();
}console.log('PASS '+(live?'LIVE':'STAGED')+' Cash Invoices assets: total OMR 235.500, example invoices, cash-entry dialog, 320/375/768/1280 layouts, opaque storage isolation, write denial and zero external requests.');}finally{await browser.close()}
