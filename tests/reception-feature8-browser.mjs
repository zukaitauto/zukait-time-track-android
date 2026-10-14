import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium,webkit} from 'playwright';
import {receptionDashboardProjection} from '../supabase/functions/workshop-api/reception_dashboard_rules.js';import {jobViewProjection} from '../supabase/functions/workshop-api/job_edit_rules.js';
const long='Saved repair description with all requested work.\n'.repeat(120)+'LAST SAVED WORK LINE';
const base={no:'12079',jobType:'Cash',vehicle:'Toyota RAV4',make:'Toyota',model:'RAV4',year:'2020',reg:'TEST-80',vin:'JTMRF9EV6HJ151476',customer:'Browser Customer',mobile:'99990000',color:'White',amount:80,notes:long,createdAt:Date.parse('2026-10-14T12:00:00Z'),status:'Open',receptionNo:'RC-SEPARATE'};
fs.mkdirSync('artifacts/features-1-8',{recursive:true});
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.FEATURE8_BROWSER&&process.env.FEATURE8_BROWSER!==engineName)continue;
 const browser=await engine.launch();const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 let data={jobs:[base]},printed=[];
 await page.exposeFunction('qaList',options=>receptionDashboardProjection(data,[],options));
 await page.exposeFunction('qaJob',no=>jobViewProjection(data.jobs.find(j=>j.no===no)));
 await page.setContent('<style>body{margin:0;font:14px Arial}.modal-box{max-height:95vh;overflow:auto}button,input,select{font:inherit}#rc-root{padding:12px}*{box-sizing:border-box}</style><div id="modal"></div>');
 await page.evaluate(()=>{
  window.me={role:'Receptionist',id:'QA'};window.openModal=html=>document.getElementById('modal').innerHTML='<div class="modal-box">'+html+'</div>';window.closeModal=()=>document.getElementById('modal').replaceChildren();window.alert=message=>{throw Error(message)};
  window.zukaitAuth={getToken:()=> 'test'};window.zukaitReception={endpoint:'QA',dashboardShell:(title,html)=>openModal('<div id="rc-root"><h3>'+title+'</h3><div id="rc-error"></div>'+html+'</div>'),action:args=>window.qaList(args)};
  window.fetch=async(_url,options)=>({ok:true,json:async()=>({ok:true,job:await window.qaJob(JSON.parse(options.body).jobCard)})});window.printed=[];window.AndroidBridge={printHtmlNamed:(html,title)=>window.printed.push({html,title})};
 });
 await page.addScriptTag({path:'app/src/main/assets/reception_dashboard.js'});await page.addScriptTag({path:'app/src/main/assets/job_card_edit.js'});
 await page.evaluate(()=>zukaitReceptionDashboard.open({backendAvailable:true}));await page.locator('[data-rdb=tile][data-section=jobs]').click();await page.locator('[data-rdb=open]').waitFor();
 assert.equal(await page.locator('[data-rdb=open]').innerText(),'View Job Card');
 await page.locator('[data-rdb-filter=search]').focus();data.jobs.push({...base,no:'1',createdAt:base.createdAt+1000});await page.waitForFunction(()=>document.querySelector('[data-rdb=open]')?.dataset.job==='1',{},{timeout:15000});assert.equal(await page.locator('[data-rdb-filter=search]').evaluate(el=>el===document.activeElement),true,'Automatic refresh must retain search focus');
 await page.locator('[data-rdb-filter=search]').fill('12079');await page.waitForFunction(()=>document.querySelectorAll('[data-rdb=open]').length===1&&document.querySelector('[data-rdb=open]').dataset.job==='12079');
 for(const role of ['Receptionist','Supervisor','Manager'])for(const type of ['Cash','Credit','Insurance'])for(const delivered of [false,true]){
  data.jobs[0]={...base,jobType:type,delivered};await page.evaluate(role=>window.me.role=role,role);
  await page.locator('[data-rdb=open]').click();await page.locator('#jce-view-print').waitFor();
  assert.match(await page.locator('.jce-view').innerText(),/LAST SAVED WORK LINE/);assert.match(await page.locator('.jce-view').innerText(),new RegExp(type));
  assert.equal(await page.locator('.jce-view-modal').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Full Job Card must not overflow on mobile');
  await page.locator('.jce-view-modal').evaluate(el=>el.scrollTop=el.scrollHeight);assert.ok(await page.locator('.jce-view-modal').evaluate(el=>el.scrollTop>0),'Long Job Card must scroll vertically');
  await page.locator('#jce-view-print').click();assert.match(await page.evaluate(()=>window.printed.at(-1).html),/LAST SAVED WORK LINE/);
  await page.locator('#jce-view-back').click();await page.locator('[data-rdb=open]').waitFor();assert.equal(await page.locator('[data-rdb-filter=search]').inputValue(),'12079');
 }
 await page.locator('[data-rdb=open]').click();await page.locator('#jce-view-print').waitFor();await page.screenshot({path:'artifacts/features-1-8/job-card-'+engineName+'.png'});
 const printHtml=await page.evaluate(()=>window.printed.at(-1).html);await page.evaluate(()=>delete window.AndroidBridge);
 await page.addScriptTag({path:'app/src/main/assets/vendor/pdf/html2canvas-1.4.1.min.js'});await page.addScriptTag({path:'app/src/main/assets/vendor/pdf/jspdf-4.2.1.min.js'});await page.addScriptTag({path:'app/src/main/assets/report_pdf_export.js'});
 const report='<!doctype html><html><head><style>body{font:16px Arial}td{padding:5px;border:1px solid #ddd}</style></head><body><h1>Supervisor Report</h1><p>JC 12079 · Toyota RAV4 · Employee QA · OMR 80.000</p><table>'+Array.from({length:75},(_,i)=>'<tr><td>Saved report line '+(i+1)+'</td><td>80.000</td></tr>').join('')+'</table><p>END OF ORIGINAL REPORT</p></body></html>';
 const result=await page.evaluate(async html=>{const original=window.html2canvas;window.renderedText='';window.html2canvas=(body,options)=>{window.renderedText=body.innerText;return original(body,options)};const file=await zukaitReportPdf.generate(html,'Supervisor_Report.pdf');return {name:file.name,size:file.size,type:file.type,header:await file.slice(0,5).text(),source:window.renderedText}},report);
 assert.equal(result.header,'%PDF-');assert.equal(result.type,'application/pdf');assert.ok(result.size>1000);assert.match(result.source,/JC 12079/);assert.match(result.source,/Saved report line 75/);assert.match(result.source,/END OF ORIGINAL REPORT/);assert.doesNotMatch(result.source,/Job Card List|PDF ready/,'PDF must use original report, not the modal');
 const download=page.waitForEvent('download');await page.evaluate(html=>zukaitReportPdf.share(html,'Supervisor_Report.pdf'),report);await page.locator('#report-pdf-download').click();await (await download).saveAs('artifacts/features-1-8/supervisor-report-'+engineName+'.pdf');
 await page.evaluate(html=>zukaitReportPdf.share(html,'Job_Card.pdf'),printHtml);await page.locator('#report-pdf-download').waitFor();
 let rejected=false;try{await page.evaluate(()=>zukaitReportPdf.generate('<html><body></body></html>','empty.pdf'))}catch(_){rejected=true}assert.equal(rejected,true,'Empty PDF must be rejected before sharing');
 await browser.close();console.log(engineName+': Reception list/view all roles/types/delivery states, mobile scrolling, retained filters, Print, full multi-page report PDF, download and blank prevention passed');
}
