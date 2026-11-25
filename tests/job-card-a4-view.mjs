import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const source=fs.readFileSync('app/src/main/assets/job_card_edit.js','utf8');
const job={no:'QA-12195',createdAt:Date.parse('2026-11-24T18:48:00+04:00'),jobType:'Insurance',status:'Open',promiseDate:'2026-11-28',receptionNo:'RC0065',make:'Nissan',model:'Pick Up',vehicle:'Nissan Pick Up',year:'2015',reg:'97693-H',vin:'3N6DD23W6FK007924',color:'White',colorCode:'QX1',jobIntakeOdometer:321384,jobIntakeOdometerUnit:'KM',customer:'Example Customer',mobile:'90000000',email:'example@example.invalid',customerAddress:'Muscat, Sultanate of Oman',insuranceCompany:'Example Insurance',claimNo:'QA-CLAIM-001',amount:125.5,finalInvoiceAmount:125.5,invoiceDate:'2026-11-24',workDescription:'Repair front bumper.\nReplace headlamp and inspect mounting points.',notes:'Customer notified. Final check required.'};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,375,768,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}});
 await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><main id="modal"></main></body></html>');
 await page.evaluate(j=>{window.me={role:'Manager',id:'QA'};window.zukaitAuth={getToken:()=> 'qa'};window.fetch=async()=>({ok:true,json:async()=>({ok:true,job:j})});window.openModal=h=>document.querySelector('#modal').innerHTML=h;window.closeModal=()=>{};window.alert=m=>{throw Error(m)};window.AndroidBridge={printHtmlNamed:h=>window.printed=h};},job);
 await page.addScriptTag({content:source});await page.evaluate(()=>window.zukaitJobEdit.view('QA-12195'));
 const view=page.locator('.jce-view-document');
 assert.equal(await view.count(),1);
 assert.equal(await view.locator('.jce-view-field').count(),26);
 assert.match(await view.innerText(),/3N6DD23W6FK007924/);
 assert.equal(await view.locator('.jce-view-value').first().evaluate(e=>getComputedStyle(e).fontWeight),'800');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow '+width);
 assert.equal(await view.locator('.jce-view-fields').first().evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),width<=600?2:4);
 if(width===1280){
 await page.locator('#jce-view-print').click();
 const html=await page.evaluate(()=>window.printed);
 const print=await browser.newPage({viewport:{width:794,height:1123}});
 await print.setContent(html);await print.emulateMedia({media:'print'});
 assert.equal(await print.locator('.jce-view-nav').count(),0);
 const pdf=await print.pdf({format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
 assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'normal complete Job Card must print exactly one A4 page');
 assert.match(await print.locator('.jce-view-work').innerText(),/Final check required/);
 await print.close();
 }
 await page.close();
 }
 console.log('PASS bold Job Card data, responsive layout, actual single A4 Chromium PDF and complete field coverage');
}finally{await browser.close();}
