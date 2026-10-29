import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const source=fs.readFileSync('app/src/main/assets/mechanical_workspace.js','utf8').replace('export async function mountMechanicalWorkspace','window.mountMechanicalWorkspace=async function');
const shortcuts=fs.readFileSync('app/src/main/assets/mechanical_shortcuts.js','utf8').replace('export function createMechanicalShortcuts','window.createMechanicalShortcuts=function');
const keys=['estimate','estimate-list','create-checklist','checklists','create-job','jobs','wip','qc','ready','delivered','exceeded','time-management'];
const browser=await chromium.launch({headless:true});
fs.mkdirSync('test-results/mechanical-dashboard',{recursive:true});
try{for(const role of ['Manager','Mechanical Supervisor'])for(const width of [320,375,768,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}});
 await page.route('**/*',r=>r.abort());
 // Exercise the inherited dark header styling from the reported screen as well
 // as the workspace's own light styles. No production services are contacted.
 await page.setContent('<style>body{margin:0;font:16px system-ui;background:#e6ebf0}.modal-box{width:1100px;max-width:95vw;margin:auto}header{background:#101d2c;color:white;border-bottom:3px solid #d5ad3e;padding:20px}button{font:inherit}</style><div class="modal-box"><div id="root"></div></div>');
 await page.addScriptTag({content:shortcuts});await page.addScriptTag({content:source});
 await page.evaluate(async role=>{
  window.ZUKAIT_MECHANICAL_ENABLED=true;window.calls=[];window.opened=[];
  const who={id:role==='Manager'?'QA_MANAGER':'SUP003',role,key:'QA_SESSION'},open=k=>window.opened.push(k);
  window.zukaitEstimate={newEstimate:()=>open('estimate'),openFind:()=>open('estimate-list')};window.zukaitReception={directJob:()=>open('create-job'),open:async()=>{}};window.zukaitReceptionDashboard={showJobs:async()=>{open('jobs');return true}};
  window.zukaitManagerWip={open:()=>open('wip')};window.zukaitOpenQCQueue=()=>open('qc');window.zukaitOpenReadyToDeliver=()=>open('ready');window.zukaitOpenDeliveredVehicles=()=>open('delivered');
  window.openSupervisorJobCardList=()=>{open('exceeded');const e=document.createElement('div');e.hidden=true;e.innerHTML='<select id="v74jld"><option>all</option><option>mechanic</option></select><select id="v74jls"><option>all</option><option>exceeded</option></select>';document.body.append(e)};window.v74JobListRender=()=>{};
  const storage=new Map();await window.mountMechanicalWorkspace(document.getElementById('root'),{enabled:true,deviceId:'QA_DEVICE',navigation:window.createMechanicalShortcuts({host:window,document,getSession:()=>who}),storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},getSession:()=>who,online:()=>true,api:async body=>{window.calls.push(body);return {ok:true,recordsRevision:1,workshopRevision:1,capabilities:['MC_CREATE'],qcAvailable:true,deliveryAvailable:true,checklists:[],mechanics:[],detail:null}}});
 },role);
 assert.deepEqual(await page.locator('[data-mc-card]').evaluateAll(es=>es.map(e=>e.dataset.mcCard)),keys);
 const shape=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,cards:[...document.querySelectorAll('[data-mc-card]')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{x:r.x,y:r.y,width:r.width,height:r.height,overflow:e.scrollWidth>e.clientWidth+1,background:s.backgroundImage}}),header:getComputedStyle(document.querySelector('.mc-workspace-head')).backgroundImage}));
 assert.equal(shape.overflow,false,role+' '+width+' page overflow');
 assert.ok(shape.cards.every(c=>c.height>=44&&!c.overflow));
 for(let i=0;i<shape.cards.length;i++){
  assert.ok(Math.abs(shape.cards[i].width-shape.cards[0].width)<1);assert.ok(Math.abs(shape.cards[i].height-shape.cards[0].height)<1);
  if(i%2===1)assert.ok(Math.abs(shape.cards[i].y-shape.cards[i-1].y)<1,'Two equal cards per row');
  if(i%2===0&&i>0)assert.ok(shape.cards[i].y>shape.cards[i-2].y,'Requested row order');
 }
 assert.ok(new Set(shape.cards.map(c=>c.background)).size>=6,'Distinct soft card tones');assert.ok(shape.header.includes('gradient'),'Light header overrides inherited dark theme');
 await page.locator('[data-mc-card=estimate]').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.dataset.mcCard),'estimate-list');assert.notEqual(await page.locator('[data-mc-card=estimate-list]').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 if([375,1280].includes(width))await page.screenshot({path:'test-results/mechanical-dashboard/'+role.replaceAll(' ','-')+'-'+width+'.png',fullPage:true});
 for(const key of keys)await page.locator('[data-mc-card="'+key+'"]').click();
 assert.equal(await page.evaluate(()=>window.calls.length),1,'No card triggers a background scan or business write');
 const opened=await page.evaluate(()=>window.opened);
 if(role==='Manager'){assert.deepEqual(opened,['estimate','estimate-list','create-job','jobs','exceeded']);for(const key of ['wip','delivered'])assert.equal(await page.locator('[data-mc-card="'+key+'"]').getAttribute('data-restricted'),'true','Body Workshop '+key+' must remain blocked');for(const key of ['qc','ready'])assert.equal(await page.locator('[data-mc-card="'+key+'"]').getAttribute('data-restricted'),null,'Mechanical-local '+key+' shortcut must remain available without opening Body queues');}
 else{assert.deepEqual(opened,[]);assert.equal(await page.locator('[data-mc-card][data-restricted=true]').count(),8);}
 await page.close();
}console.log('PASS all 12 Mechanical cards in real Chromium: requested two-column order, equal compact sizing, six soft colors, icons/light header, 320/375/768/1280 widths, existing destinations and legacy restrictions. No network or business writes.');}
finally{await browser.close()}
