// Real Chromium acceptance for the V377 inspection component.
// All records and RPCs are synthetic. Serves files only from the checkout.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

const base='/app/src/main/assets/';
const moduleUrl=base+'mechanical_inspection_view.js';
const imageUrl=base+'v2/features/insurance/vehicle-inspection-approved.png';
const source=readFileSync('app/src/main/assets/mechanical_inspection_view.js');
const image=readFileSync('app/src/main/assets/v2/features/insurance/vehicle-inspection-approved.png');
const server=createServer((req,res)=>{
 if(req.url===moduleUrl){res.writeHead(200,{'content-type':'text/javascript'});res.end(source);return;}
 if(req.url===imageUrl){res.writeHead(200,{'content-type':'image/png'});res.end(image);return;}
 if(req.url==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><main id="root"></main></body></html>');return;}
 res.writeHead(404);res.end();
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const address='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const widths=[320,375,768,1280];
mkdirSync('artifacts/v377-inspection',{recursive:true});
const checkId='11111111-1111-4111-8111-111111111111';
try{
 for(const width of widths){
  const page=await browser.newPage({viewport:{width,height:940}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(address+'/')?route.continue():route.abort());
  await page.goto(address,{waitUntil:'networkidle'});
  await page.evaluate(async ({checkId})=>{
   const {mountMechanicalInspection}=await import('/app/src/main/assets/mechanical_inspection_view.js');
   let saved=null,revision=0;
   window.synthetic={writes:[],prints:0};
   window.print=()=>{window.synthetic.prints++;};
   window.syntheticApi=async ({action,command})=>{
    if(action!=='mechanical_inspection'||command.checklistId!==checkId)throw Error('unexpected RPC');
    if(command.operation==='READ_INSPECTION')return {ok:true,inspection:saved};
    if(command.operation!=='SAVE_INSPECTION')throw Error('unexpected operation');
    window.synthetic.writes.push(command);
    if(command.expectedRevision!==revision)throw Error('inspection_revision_conflict');
    saved={checklistId:checkId,revision:++revision,inspection:command.inspection};
    return {ok:true,result:{revision,replayed:false}};
   };
   const options={checklistId:checkId,jobCard:'MJC001',api:window.syntheticApi,
    getSession:()=>({id:'SUP003',role:'Mechanical Supervisor'}),
    isEnabled:()=>true,online:()=>true};
   window.reopen=async()=>{window.controller?.destroy();window.controller=await mountMechanicalInspection(document.getElementById('root'),options);};
   await window.reopen();
  },{checkId});
  const get=(label)=>page.locator('label.mi-field').filter({has:page.locator('span', {hasText:label})}).first();
  assert.deepEqual(await get('Job type').locator('option').allTextContents(),['Cash','Credit']);
  await get('Job type').locator('select').selectOption('CREDIT');
  for(const [label,value] of [
   ['Registration number','1234 AB'],['Make','Toyota'],['Model','Camry'],['Year','2022'],
   ['Customer / company','Customer A'],['Contact number','90000000'],
   ['Detailed repair instructions','Inspection and repair notes']
  ])await get(label).locator('input,textarea').fill(value);
  await get('Mark type').locator('select').selectOption('X');
  await page.getByRole('button',{name:'Front Bumper',exact:true}).click();
  await get('Lights status').locator('select').selectOption('ISSUE');
  await get('Issue note').locator('input').first().fill('Lamp issue observed');
  await page.getByRole('button',{name:'Save checklist'}).click();
  await page.getByText('Saved and confirmed by the server (revision 1).').waitFor();
  assert.equal(await page.evaluate(()=>window.synthetic.writes.length),1);
  assert.equal(await page.evaluate(()=>window.synthetic.writes[0].inspection.jobType),'CREDIT');
  await page.getByRole('button',{name:'Print checklist'}).click();
  assert.equal(await page.evaluate(()=>window.synthetic.prints),1);
  const shape=await page.evaluate(()=>{
   const img=document.querySelector('.mi-vehicle-image');
   const controls=[...document.querySelectorAll('.mechanical-inspection-view button,.mechanical-inspection-view input,.mechanical-inspection-view select,.mechanical-inspection-view textarea')];
   return {overflow:document.documentElement.scrollWidth>innerWidth,visibleImage:img?.complete&&img.naturalWidth>0,
    smallControls:controls.filter(el=>el.getBoundingClientRect().height<43).map(el=>el.textContent||el.tagName).slice(0,3)};
  });
  assert.equal(shape.overflow,false,width+'px horizontal overflow');
  assert.equal(shape.visibleImage,true,'approved image not loaded');
  assert.deepEqual(shape.smallControls,[],'all touch targets should be at least 44px');
  if(width===375||width===1280)await page.screenshot({path:'artifacts/v377-inspection/inspection-'+width+'.png',fullPage:true});
  await page.evaluate(()=>window.reopen());
  assert.equal(await get('Year').locator('input').inputValue(),'2022');
  assert.equal(await get('Job type').locator('select').inputValue(),'CREDIT');
  assert.match(await page.locator('[role=status]').textContent(),/Revision 1/);
  assert.deepEqual(errors,[],'no JavaScript errors at '+width+'px');
  await page.close();
 }
 console.log('PASS V377 real Chromium: Cash/Credit, X marks, ISSUE notes, save/reopen, print, approved diagram, touch targets and 320/375/768/1280 widths');
}finally{await browser.close();server.close();}
