import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {chromium} from 'playwright';

const source=fs.readFileSync('app/src/main/assets/accountant_accounts.js','utf8');
const fixture='<div id="managerView"><button type="button" class="rc-dashboard-launcher rc-menu" data-rc-menu="1" onclick="window.receptionOpens++"><b>🚘 Reception</b><small>Checklists · Vehicle movements · Insurance</small></button></div><div id="modal"></div>';
const tick=()=>new Promise(r=>setTimeout(r,0));
const dom=new JSDOM(fixture,{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;
w.me={id:'M1',role:'Manager'};
w.zukaitAuth={getToken:()=> 'synthetic-session'};
let opens=0,alerts=0,release;
w.zukaitCloud={openMechanicalWorkspace:async()=>{opens++;if(release)await new Promise(r=>{release=r});return true}};
w.alert=()=>alerts++;
w.fetch=()=>{throw Error('No network allowed in layout test')};
w.eval(source);
let row=w.document.querySelector('[data-accounts-row]');
assert.equal(row.children.length,2,'Default-off keeps current Reception/Accounts access');
assert.equal(row.children[1].id,'manager-accounts-launcher');
w.ZUKAIT_MECHANICAL_ENABLED=true;w.document.body.append(w.document.createElement('i'));await tick();
row=w.document.querySelector('[data-accounts-row]');
assert.deepEqual([...row.children].map(e=>e.id||'reception'),['reception','manager-accounts-launcher','manager-mechanical-launcher']);
assert.equal(row.style.gridTemplateColumns,'repeat(3,minmax(0,1fr))');
const button=row.lastElementChild;
button.click();await tick();assert.equal(opens,1);assert.equal(button.disabled,false);
release=true;button.click();button.click();assert.equal(button.disabled,true);assert.equal(opens,2,'Busy button blocks duplicate opens');release();release=null;await tick();
w.me={id:'M2',role:'Manager'};button.click();await tick();assert.equal(opens,2,'Stale account cannot use the launcher');
w.me={id:'M1',role:'Manager'};w.zukaitCloud.openMechanicalWorkspace=async()=>false;button.click();await tick();assert.equal(alerts,1);assert.equal(button.disabled,false);
w.ZUKAIT_MECHANICAL_ENABLED=false;button.click();await tick();assert.equal(alerts,1,'Activation checked again at click');
w.document.body.append(w.document.createElement('i'));await tick();assert.equal(row.children.length,2);
w.ZUKAIT_MECHANICAL_ENABLED=true;w.document.body.append(w.document.createElement('i'));await tick();
for(let i=0;i<5;i++)w.document.body.append(w.document.createElement('i'));await tick();
assert.equal(w.document.querySelectorAll('#manager-mechanical-launcher').length,1);
w.document.querySelector('[data-rc-menu]').remove();await tick();assert.equal(w.document.querySelector('[data-accounts-row]'),null);
const reception=w.document.createElement('button');reception.dataset.rcMenu='1';w.document.getElementById('managerView').append(reception);await tick();
assert.equal(w.document.querySelectorAll('#manager-mechanical-launcher').length,1,'Dashboard rebuild restores one launcher');
w.document.getElementById('managerView').classList.add('hidden');w.document.body.append(w.document.createElement('i'));await tick();assert.equal(w.document.querySelector('[data-accounts-row]'),null);
dom.window.close();
for(const role of ['Supervisor','Mechanical Supervisor','Accountant','Employee','Purchaser','Receptionist']){
 const d=new JSDOM(fixture,{url:'https://qa.invalid',runScripts:'outside-only'});d.window.me={id:'OTHER',role};d.window.ZUKAIT_MECHANICAL_ENABLED=true;d.window.eval(source);assert.equal(d.window.document.querySelector('[data-accounts-row]'),null,role+' receives no Manager entry');d.window.close();
}

console.log('PASS department row DOM: ordering, activation/role/account guards, busy/error recovery and rebuild deduplication; no live calls.');
if(!process.argv.includes('--dom-only')){
const receptionSource=fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8');
const launcherCss=receptionSource.split('\n').filter(l=>l.includes('.rc-dashboard-launcher')&&!l.includes('className')).join('\n');
const base=fs.readFileSync('app/src/main/assets/offline_test.html','utf8').match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';
fs.mkdirSync('artifacts/department-row',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{})});
try{
 for(const width of [320,375,768,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:route.request().url().endsWith('/accountant.html')?'<h1>Accounts destination</h1>':'<!doctype html><html><head><style>'+base+'\n'+launcherCss+'</style></head><body>'+fixture+'</body></html>'}));
  await page.goto('https://qa.invalid/');
  await page.evaluate(()=>{window.me={id:'M1',role:'Manager'};window.ZUKAIT_MECHANICAL_ENABLED=true;window.receptionOpens=0;window.mechanicalOpens=0;window.zukaitCloud={openMechanicalWorkspace:async()=>{window.mechanicalOpens++;return true}}});
  await page.addScriptTag({content:source});
  const layout=await page.locator('[data-accounts-row]').evaluate(row=>({overflow:document.documentElement.scrollWidth>innerWidth+1,boxes:[...row.children].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,overflow:e.scrollWidth>e.clientWidth+1}})}));
  assert.equal(layout.overflow,false,'No page overflow at '+width);
  assert.equal(layout.boxes.length,3);
  const [first,...rest]=layout.boxes;
  for(const box of rest){assert.ok(Math.abs(box.y-first.y)<1,'All three on same row at '+width);assert.ok(Math.abs(box.width-first.width)<1);assert.ok(Math.abs(box.height-first.height)<1)}
  assert.ok(layout.boxes.every(b=>b.height>=44&&!b.overflow),'Readable touch targets without clipping at '+width);
  await page.locator('[data-rc-menu]').click();assert.equal(await page.evaluate(()=>window.receptionOpens),1,'Original Reception handler retained');
  await page.locator('#manager-mechanical-launcher').click();assert.equal(await page.evaluate(()=>window.mechanicalOpens),1,'Existing Mechanical action used');
  await page.locator('[data-rc-menu]').focus();await page.keyboard.press('Tab');await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'manager-mechanical-launcher','Keyboard order follows the three cards');
  assert.notEqual(await page.locator('#manager-mechanical-launcher').evaluate(e=>getComputedStyle(e).outlineStyle),'none','Keyboard focus visible');
  await page.screenshot({path:'artifacts/department-row/'+width+'.png',fullPage:true});
  await Promise.all([page.waitForURL('**/accountant.html'),page.locator('#manager-accounts-launcher').click()]);
  assert.equal(await page.locator('h1').textContent(),'Accounts destination');
  await page.close();
 }
}finally{await browser.close()}
console.log('PASS department row: three equal columns at 320/375/768/1280, all destinations, keyboard focus, activation/role/account guards, busy/error recovery, no duplicates after rebuild. Synthetic local fixtures only; no live service calls.');
}
