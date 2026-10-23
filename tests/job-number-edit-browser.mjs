import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const script=fs.readFileSync('app/src/main/assets/manager_job_edit.js','utf8'),css=fs.readFileSync('app/src/main/assets/manager_job_edit.css','utf8');
fs.mkdirSync('artifacts/job-edit',{recursive:true});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]])for(const width of [390,820]){
 const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport:{width,height:844}});
 await page.setContent('<style>body{margin:0;font:14px Arial;background:#e7eef6}.modal-box{box-sizing:border-box;padding:12px;margin:12px auto;background:white;width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto}'+css+'</style><div class="modal-box" id="modal"></div>');
 await page.evaluate(()=>{
  window.state={jobs:[{no:'11965',make:'BYD',model:'Leopard 7 EV',vehicle:'BYD Leopard 7 EV',reg:'2970-R',year:'2025',jobType:'Cash',createdAt:Date.parse('2026-09-27T09:00:00+04:00')},{no:'12000'}],assign:[],sessions:[]};window.me={id:'M',role:'Manager'};window.users=[];window.calls=[];window.messages=[];
  window.openModal=html=>document.getElementById('modal').innerHTML=html;window.closeModal=()=>{};window.alert=m=>messages.push(m);window.render=()=>{};
  window.fetch=async(_url,args)=>{const body=JSON.parse(args.body);calls.push(body);if(window.rejectDuplicate)return {ok:false,json:async()=>({ok:false,code:'job_number_duplicate'})};return {ok:true,json:async()=>({ok:true,job:{...state.jobs[0],...body.patch,no:body.newJobNumber||'11965'}})};};
 });
 await page.addScriptTag({content:script});await page.evaluate(()=>editJobManager('11965'));
 assert.equal(await page.locator('#mje-number').inputValue(),'11965');assert.equal(await page.locator('.mje-editor-header h3').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('.modal-box').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 await page.screenshot({path:'artifacts/job-edit/'+name+'-'+width+'.png'});
 await page.locator('#mje-number').fill('12000');await page.locator('#mje-reason').fill('Correct imported number');await page.locator('#mje-save').click();assert.equal(await page.evaluate(()=>calls.length),0);assert.match(await page.evaluate(()=>messages.at(-1)),/already in use/);
 await page.locator('#mje-number').fill('12965');page.once('dialog',async dialog=>{assert.match(dialog.message(),/11965 to 12965/);await dialog.dismiss()});await page.locator('#mje-save').click();assert.equal(await page.evaluate(()=>calls.length),0);assert.equal(await page.evaluate(()=>state.jobs[0].no),'11965');
 await page.evaluate(()=>window.rejectDuplicate=true);page.once('dialog',dialog=>dialog.accept());await page.locator('#mje-save').click();assert.equal(await page.evaluate(()=>state.jobs[0].no),'11965');assert.match(await page.evaluate(()=>messages.at(-1)),/assigned or reserved/);assert.equal(await page.locator('#mje-save').isEnabled(),true);
 await page.evaluate(()=>window.rejectDuplicate=false);page.once('dialog',dialog=>dialog.accept());await page.locator('#mje-save').click();assert.equal(await page.evaluate(()=>calls.at(-1).newJobNumber),'12965');assert.equal(await page.evaluate(()=>calls.at(-1).numberChangeConfirmed),true);assert.equal(await page.evaluate(()=>state.jobs[0].no),'12965');
 await browser.close();
}
console.log('Manager Full Edit: Chromium/WebKit phone and tablet layout, readable header, duplicate rejection, cancel confirmation, failed-save recovery and confirmed number change passed.');
