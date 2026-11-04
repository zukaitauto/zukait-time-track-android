// Mechanical pre-job checklist must match Reception's mobile intake layout.
// This acceptance test serves only local checkout assets with a synthetic backend.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

const js='/app/src/main/assets/mechanical_prejob_intake.js';
const art='/app/src/main/assets/v2/features/insurance/vehicle-inspection-approved.png';
const server=createServer((req,res)=>{
 if(req.url===js){res.writeHead(200,{'content-type':'text/javascript'});res.end(readFileSync('app/src/main/assets/mechanical_prejob_intake.js'));return;}
 if(req.url===art){res.writeHead(200,{'content-type':'image/png'});res.end(readFileSync('app/src/main/assets/v2/features/insurance/vehicle-inspection-approved.png'));return;}
 if(req.url==='/app/src/main/assets/offline_test.html'){
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#dedede}#modal{max-width:680px;margin:20px auto}#modal .modal-box{padding:15px}#modal header{background:#0c1728;color:#0d1b2b}</style></head><body><div id="modal"><div class="modal-box"><div id="root"></div></div></div></body></html>');
  return;
 }
 res.writeHead(404);res.end();
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const address='http://127.0.0.1:'+server.address().port+'/app/src/main/assets/offline_test.html';
const browser=await chromium.launch({headless:true});
mkdirSync('artifacts/mechanical-prejob',{recursive:true});
try{
 for(const width of [320,375,768,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(address,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
   const {mountMechanicalPrejob}=await import('./mechanical_prejob_intake.js');
   window.syntheticCalls=[];
   const options={getSession:()=>({id:'SUP003',role:'Mechanical Supervisor'}),isEnabled:()=>true,uuid:()=> '12345678-1234-4123-8123-000000000901',
    api:async body=>{window.syntheticCalls.push(body);return body.command.operation==='LIST'?{ok:true,checklists:[]}:{ok:true,checklist:{id:'QA-1',checklist_number:'MC-P000901',registration:body.command.registration,approval_status:'PENDING',revision:1}};}};
   window.controller=await mountMechanicalPrejob(document.getElementById('root'),options);
  });
  await page.locator('.mc-car-stage img').waitFor();
  const shape=await page.evaluate(()=>{
   const root=document.querySelector('.mc-prejob'),modal=document.querySelector('#modal'),
     diagram=document.querySelector('.mc-car-stage img'),
     header=document.querySelector('.mc-prejob>header'),title=header.querySelector('h2'),
     controls=[...document.querySelectorAll('.mc-intake-form button:not(.mc-zone),.mc-intake-form input:not([type=radio]):not([type=checkbox]),.mc-intake-form select,.mc-intake-form textarea')];
   return {
    modalWidth:modal.getBoundingClientRect().width,
    rootWidth:root.getBoundingClientRect().width,
    viewport:innerWidth,
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
    imageLoaded:diagram.complete&&diagram.naturalWidth>0,
    titleColor:getComputedStyle(title).color,
    headerBackground:getComputedStyle(header).backgroundImage,
    tooSmall:controls.filter(el=>{const rect=el.getBoundingClientRect();return rect.width>0&&rect.height<42;}).map(el=>el.tagName).slice(0,8)
   };
  });
  assert.ok(shape.modalWidth>=width-1,'full-screen Mechanical overlay at '+width+'px');
  assert.ok(shape.rootWidth>=width-1,'full-screen Mechanical form at '+width+'px');
  assert.equal(shape.horizontalOverflow,false,'no horizontal scrolling at '+width+'px');
  assert.ok(shape.imageLoaded,'Reception artwork loaded at '+width+'px');
  assert.match(shape.headerBackground,/gradient/,'contrast header is active');
  assert.deepEqual(shape.tooSmall,[],'touch controls are readable at '+width+'px');
  assert.deepEqual(await page.locator('[name=job_type] option').evaluateAll(o=>o.map(x=>x.value)),['CASH','CREDIT']);
  assert.equal(await page.locator('[name=insurance_id],[name=claim]').count(),0);
  await page.locator('[data-zone="Front Bumper"]').click();
  assert.equal(await page.locator('[data-zone="Front Bumper"]').getAttribute('data-mark'),'X');
  assert.deepEqual(errors,[],'no browser errors at '+width+'px');
  if(width===375||width===1280)await page.screenshot({path:'artifacts/mechanical-prejob/intake-'+width+'.png',fullPage:true});
  await page.close();
 }
 console.log('PASS: Reception-style Mechanical checklist full-screen 320/375/768/1280, Cash/Credit only, shared diagram, readable controls, no horizontal overflow');
} finally {await browser.close();server.close();}
