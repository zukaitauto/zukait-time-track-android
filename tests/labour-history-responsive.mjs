import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{for(const width of [320,390,768,1280]){
 const page=await browser.newPage({viewport:{width,height:950}});
 await page.setContent('<style>*{box-sizing:border-box}body{margin:0;padding:12px;font:15px Arial;background:#eef3f8}#modal{background:white;padding:12px;border-radius:16px}</style><div id="modal"></div>');
 await page.evaluate(()=>{
  const start=Date.parse('2026-10-19T04:00:00Z');window.me={role:'Manager'};window.users=[{id:'E1',name:'Soman',department:'Denter'},{id:'E2',name:'Jijesh',department:'Painter'}];
  window.state={jobs:[{no:'12064',vehicle:'Toyota Camry',reg:'3180 RY'}],assign:[],sessions:[{id:'s1',emp:'E1',job:'12064',start,end:start+3600000,paused:true},{id:'s2',emp:'E1',job:'12064',start:start+5400000,end:start+9000000,finished:true},{id:'not-selected',emp:'E2',job:'12064',start,end:start+3600000}]};
  window.openModal=html=>document.querySelector('#modal').innerHTML=html;window.closeModal=()=>document.querySelector('#modal').innerHTML='';window.zukaitWorkshopOverview={labour:()=>{},labourReviewMetrics:()=>({suggestedMinutes:90,actualMinutes:120,exceededMinutes:30,normalDuty:true})};
  window.AndroidBridge={printHtmlNamed:html=>window.printed=html,shareImageBase64:(name,data)=>window.sharedImage={name,data}};
 });
 for(const file of ['labour_history.js','vendor/pdf/html2canvas-1.4.1.min.js','vendor/pdf/jspdf-4.2.1.min.js','report_pdf_export.js'])await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/'+file,'utf8')});
 await page.evaluate(()=>window.zukaitLabourHistory.openStaff('12064','E1'));
 assert.equal(await page.locator('tbody tr').count(),2);assert.match(await page.locator('.lh-suggested').innerText(),/1h 30m/);assert.match(await page.locator('.lh-actual').innerText(),/2h 00m/);assert.match(await page.locator('.lh-exceeded').innerText(),/0h 30m/);assert.match(await page.locator('.lh-total').innerText(),/2h 00m/);assert.ok(!(await page.locator('#modal').innerText()).includes('Jijesh'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Staff report page overflow at '+width);
 await page.getByRole('button',{name:'Print',exact:true}).click();assert.match(await page.evaluate(()=>window.printed),/Soman/);
 const pdf=await page.evaluate(async()=>{const api=window.zukaitLabourHistory,r=api.getReport('12064','E1'),f=await window.zukaitReportPdf.generate(api.html(r),'JC_12064_Soman_Labour.pdf');return {magic:await f.slice(0,5).text(),size:f.size,name:f.name}});assert.equal(pdf.magic,'%PDF-');assert.ok(pdf.size>1000);assert.equal(pdf.name,'JC_12064_Soman_Labour.pdf');
 await page.evaluate(()=>{window.cardText=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.cardText.push(String(text));return original.call(this,text,...args)}});
 await page.getByRole('button',{name:'Send as card',exact:true}).click();await page.locator('.lh-preview').waitFor();for(const text of ['SUGGESTED TIME','TOTAL ACTUAL TIME','EXCEEDED TIME','1h 30m','2h 00m','0h 30m'])assert.ok((await page.evaluate(()=>window.cardText)).includes(text),'PNG must contain '+text);await page.getByRole('button',{name:'Share this card',exact:true}).click();await page.waitForFunction(()=>!!window.sharedImage);assert.ok((await page.evaluate(()=>window.sharedImage.data)).startsWith('data:image/png;base64,iVBOR'));assert.match(await page.evaluate(()=>window.sharedImage.name),/Soman.*\.png$/);
 await page.getByRole('button',{name:'← Work sessions'}).click();assert.equal(await page.locator('tbody tr').count(),2);
 fs.mkdirSync('artifacts/labour-history',{recursive:true});await page.screenshot({path:'artifacts/labour-history/staff-'+width+'.png',fullPage:true});
 if(width===390){await page.evaluate(()=>{const base=window.state.sessions[0];window.state.sessions=Array.from({length:51},(_,i)=>({...base,id:'many-'+i,start:base.start+i*60000,end:base.start+(i+1)*60000}));window.zukaitLabourHistory.openStaff('12064','E1')});await page.getByRole('button',{name:'Send as card',exact:true}).click();await page.getByText('Soman · JC 12064 · Card 1 of 3',{exact:true}).waitFor();await page.getByRole('button',{name:'Next card →'}).click();assert.match(await page.locator('#modal').innerText(),/Card 2 of 3/);await page.getByRole('button',{name:'Share this card',exact:true}).click();await page.waitForFunction(()=>window.sharedImage.name.endsWith('_2.png'));}
 await page.close();
}}finally{await browser.close();}
console.log('PASS: staff session layout, print HTML, real nonempty PDF, real PNG Android share payload, multi-card pagination and back navigation at 320/390/768/1280px');
