// Real Chromium regression for the Manager Over Allocated Jobs popup.
// Uses only local source files and synthetic workshop data. No Supabase calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

const files={
 '/workshop_performance.js':readFileSync('app/src/main/assets/workshop_performance.js'),
 '/time_management_rules.js':readFileSync('app/src/main/assets/time_management_rules.js')
};
const server=createServer((req,res)=>{
 const route=new URL(req.url,'http://127.0.0.1').pathname;
 if(files[route]){
  res.writeHead(200,{'content-type':'text/javascript'});res.end(files[route]);return;
 }
 if(route==='/'){
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:12px;background:#f3f7fc;font:15px system-ui}#modal{max-width:1050px;margin:0 auto;background:#fff;padding:12px;border-radius:14px;box-sizing:border-box}*{box-sizing:border-box}</style></head><body><main id="modal"></main></body></html>');
  return;
 }
 res.writeHead(404);res.end();
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
mkdirSync('artifacts/v377-overallocated',{recursive:true});
try{
 for(const width of [320,375,768,1280]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
   const t=h=>Date.parse('2026-10-05T'+String(h).padStart(2,'0')+':00:00+04:00');
   window.me={role:'Manager',id:'MAN001'};
   window.state={
    jobs:[
     {no:'12021',vehicle:'Toyota Camry 2020',reg:'1234 AB',jobType:'INSURANCE'},
     {no:'12036',make:'Honda',model:'Accord',year:2022,reg:'7890 CD',jobType:'CASH'},
     {no:'12083',vehicle:'Nissan Patrol',reg:'3456 EF',jobType:'CREDIT'}
    ],
    assign:[
     {id:'RA',job:'12021',emp:'E1',suggested:30},
     {id:'RB',job:'12021',emp:'E2',suggested:60},
     {id:'RC',job:'12036',emp:'E1',suggested:90},
     {id:'RD',job:'12083',emp:'E2',suggested:110},
     {id:'R5',job:'ID001',emp:'E2',suggested:5}
    ],
    sessions:[...[
     ['RA','12021','E1'],['RB','12021','E2'],['RC','12036','E1'],['RD','12083','E2']
    ].map(([assignmentId,job,emp])=>({
     id:'S-'+assignmentId,assignmentId,job,emp,start:t(8),end:t(10)
    }))]
   };
   window.users=[
    {id:'E1',name:'Pramod <img src=x onerror=alert(1)>',department:'Denter'},
    {id:'E2',name:'Zaheer',department:'Painter'}
   ];
   window.opened=[];
   window.openModal=html=>document.querySelector('#modal').innerHTML=html;
   window.zukaitOpenRunningDetails=job=>window.opened.push(job);
   await import('/workshop_performance.js');
   window.v377OpenOverAllocated();
  });
  assert.equal(await page.locator('.v377-overalloc-card').count(),3,'one card per JC at '+width);
  assert.deepEqual(await page.locator('.v377-overalloc-jc').allTextContents(),['JC 12021','JC 12036','JC 12083']);
  assert.deepEqual(await page.locator('.v377-overalloc-kind').allTextContents(),['Insurance','Cash','Credit']);
  const first=page.locator('.v377-overalloc-card').first();
  assert.match(await first.locator('.v377-overalloc-vehicle').innerText(),/Toyota Camry 2020.*1234 AB/);
  assert.equal(await first.locator('.v377-overalloc-worker').count(),2,'both people are visible');
  assert.deepEqual(await first.locator('.v377-overalloc-exceeded b').allTextContents(),['1h 30m','1h 00m']);
  assert.match(await first.locator('.v377-overalloc-name').first().innerText(),/Pramod <img src=x onerror=alert\(1\)>/);
  assert.equal(await first.locator('img').count(),0,'employee names are HTML-escaped');
  assert.match(await page.locator('.v377-overalloc-summary').innerText(),/3 Job Cards.*4 over-allocated assignments.*3h 10m/);
  assert.match(await page.locator('.v377-overalloc-card').nth(1).locator('.v377-overalloc-vehicle').innerText(),/Honda Accord 2022/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow '+width);
  await first.locator('.v377-overalloc-jc').click();
  assert.deepEqual(await page.evaluate(()=>window.opened),['12021'],'JC button opens existing detail view');
  if(width===375||width===1280)
   await page.screenshot({path:'artifacts/v377-overallocated/popup-'+width+'.png',fullPage:true});
  await page.evaluate(()=>{
   document.getElementById('modal').replaceChildren();
   window.me={role:'Supervisor',id:'SUP001'};
   window.v377OpenOverAllocated();
  });
  assert.equal(await page.locator('.v377-overalloc').count(),0,'Supervisor must not open Manager finance popup');
  assert.deepEqual(errors,[],'no JavaScript errors '+width);
  await page.close();
 }
 console.log('PASS Manager over-allocation popup: JC, vehicle/reg, Insurance/Cash/Credit, individual worker exceed, aggregate time, safe escaping, manager-only, JC drilldown, 320/375/768/1280px');
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
