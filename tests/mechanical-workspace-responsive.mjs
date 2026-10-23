import assert from 'node:assert/strict';import fs from 'node:fs';import {chromium} from 'playwright';
const source=fs.readFileSync('app/src/main/assets/mechanical_workspace.js','utf8').replace('export async function mountMechanicalWorkspace','window.mountMechanicalWorkspace=async function');
const navigation=fs.readFileSync('app/src/main/assets/mechanical_navigation.js','utf8').replace('export function installMechanicalNavigation','window.installMechanicalNavigation=function');
const delivery=fs.readFileSync('app/src/main/assets/mechanical_delivery.js','utf8').replace('export async function mountMechanicalDelivery','window.mountMechanicalDelivery=async function');
const browser=await chromium.launch({headless:true});fs.mkdirSync('test-results/mechanical',{recursive:true});
try{for(const width of [320,375,768,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}});
 await page.setContent('<style>body{margin:0;background:#e7edf4}.modal-box{width:1100px;max-width:95vw;margin:10px auto}</style><div class="modal-box"><div id="root"></div></div>');
 await page.addScriptTag({content:source});
 await page.evaluate(async()=>{
  let serial=0;const data={ok:true,recordsRevision:2,workshopRevision:8,capabilities:['MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER'],departmentConfigured:true,nextAfter:25,
   checklists:[{id:'MC_TEST',number:'MC001',jobCard:'12079',manualDate:'2026-10-22'}],mechanics:[{id:'QA_A',name:'Mechanic A'},{id:'QA_B',name:'Mechanic B <script>unsafe</script>'}],detail:null};
  const detail={checklist:data.checklists[0],tasks:[{id:'TASK',title:'Inspect brakes and suspension — '+ 'LongTaskDescription'.repeat(8)}],assignments:[{id:'ASSIGNMENT',taskId:'TASK',employeeId:'QA_A',employeeName:'Mechanic A',suggestedMinutes:60,completed:false,running:false}]};
  window.calls=[];
  const store=new Map();const controller=await window.mountMechanicalWorkspace(document.getElementById('root'),{enabled:true,getSession:()=>({id:'SUP003',role:'Supervisor',key:'QA_SYNTHETIC'}),online:()=>true,storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},deviceId:'QA_DEVICE',uuid:()=>String(++serial),api:async body=>{window.calls.push(body);if(body.action==='mechanical_qc_readiness')return {ok:true,status:{checklistId:'MC_TEST',workComplete:true,mechanicalRequired:true,mechanicalPassed:false,delivered:false,workToken:'a'.repeat(64),recordsRevision:2,workshopRevision:8}};return {...data,detail:body.checklistId?detail:null}}});
  window.enableQcPreview=async()=>{data.qcAvailable=true;data.capabilities.push('MECHANICAL_QC');detail.assignments[0].completed=true;await controller.refresh()};
 });
 await page.getByRole('button',{name:'MC001 · JC 12079 · 2026-10-22',exact:true}).click();await page.locator('[data-operation=TASK_HANDOVER]').waitFor();
 const shape=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.mc-grid')).gridTemplateColumns.split(' ').length,unsafe:document.querySelectorAll('#root script,#root img').length,tooNarrow:[...document.querySelectorAll('#root input,#root select,#root button')].some(e=>e.getBoundingClientRect().height<43)}));
 assert.equal(shape.overflow,false,width+'px horizontal overflow');assert.equal(shape.columns,width<=760?1:2);assert.equal(shape.unsafe,0);assert.equal(shape.tooNarrow,false,'Touch controls need at least 44px');
 assert.equal(await page.locator('[data-operation=TASK_CREATE]').count(),1);assert.equal(await page.locator('[data-operation=TASK_ASSIGN]').count(),1);
 if([375,1280].includes(width))await page.screenshot({path:'test-results/mechanical/workspace-'+width+'.png',fullPage:true});
 await page.evaluate(()=>window.enableQcPreview());await page.getByRole('button',{name:'Check QC status',exact:true}).click();await page.locator('[data-operation=MECHANICAL_QC]').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'QC '+width+'px overflow');
 assert.equal(await page.locator('[data-operation=MECHANICAL_QC] input,[data-operation=MECHANICAL_QC] select,[data-operation=MECHANICAL_QC] button').evaluateAll(es=>es.some(e=>e.getBoundingClientRect().height<43)),false);
 if([375,1280].includes(width))await page.screenshot({path:'test-results/mechanical/qc-'+width+'.png',fullPage:true});
 await page.addScriptTag({content:delivery});
 for(const role of ['Supervisor','Receptionist']){
  await page.evaluate(async role=>{const store=new Map();await window.mountMechanicalDelivery(document.getElementById('root'),{enabled:true,checklistId:'MC_TEST',getSession:()=>({id:'QA_DELIVERY',role,key:'QA_SYNTHETIC'}),online:()=>true,storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},uuid:()=> '78000000-0000-4000-8000-000000000001',api:async()=>({ok:true,status:{checklistId:'MC_TEST',deliveryReady:true,workComplete:true,delivered:false,recordsRevision:2,workshopRevision:8,workToken:'a'.repeat(64)},vehicle:{jobCard:'12079',description:'Synthetic vehicle '+ 'LongDescription'.repeat(8),registration:'QA <script>unsafe</script>'}})})},role);
  assert.equal(await page.getByRole('button',{name:'Confirm vehicle delivered',exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Delivery '+role+' '+width+'px overflow');
  assert.equal(await page.locator('.mechanical-delivery button').evaluateAll(es=>es.some(e=>e.getBoundingClientRect().height<43)),false);assert.equal(await page.locator('#root script,#root img').count(),0);
  if([375,1280].includes(width))await page.screenshot({path:'test-results/mechanical/delivery-'+role+'-'+width+'.png',fullPage:true});
 }
 await page.addScriptTag({content:navigation});
 for(const role of ['Manager','Supervisor']){
  await page.evaluate(role=>{
   document.body.innerHTML='<style>body{margin:0}.modal-box{width:500px;max-width:95vw;margin:10px auto}.v135-manager-menu,.v88-role-account{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}button{font:16px system-ui;padding:10px;min-height:44px}.v135-action span{display:flex;flex-direction:column;min-width:0}</style><div id="modal"></div>';
   const me={id:'QA_NAV',role};window.v111OpenManagerMenu=window.v65OpenAccount=()=>{document.getElementById('modal').innerHTML='<div class="modal-box"><div class="'+(role==='Manager'?'v135-manager-menu':'v88-role-account')+'"><button>Sync</button><button>About / Update</button><button>Leave</button><button>Logout</button></div></div>'};
   window.installMechanicalNavigation({host:window,document,getUser:()=>me,enabled:()=>true,open:async()=>{}});if(role==='Manager')window.v111OpenManagerMenu();else window.v65OpenAccount();
  },role);
  assert.equal(await page.locator('[data-mechanical-navigation]').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,role+' menu '+width+'px overflow');
  assert.ok(await page.locator('[data-mechanical-navigation]').evaluate(e=>e.getBoundingClientRect().height)>=44);
 }
 // Main QC/Ready projection in a separate document (no network or active pilot).
 const overviewPage=await browser.newPage({viewport:{width,height:1000}});
 await overviewPage.setContent('<style>body{margin:0;font:16px system-ui}#modal,#managerView{box-sizing:border-box;width:100%;padding:8px}button{min-height:44px}.v67-control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}</style><div id="managerView"><div class="v67-control-grid"></div></div><div id="modal"></div>');
 await overviewPage.addScriptTag({content:fs.readFileSync('app/src/main/assets/qc_delivery_rules.js','utf8').replaceAll('export ','')});
 await overviewPage.addScriptTag({content:fs.readFileSync('app/src/main/assets/mechanical_qc_projection.js','utf8').replace('export function createMechanicalQcProjection','window.createMechanicalQcProjection=function')});
 await overviewPage.evaluate(()=>{
  window.state={jobs:[],assign:[],sessions:[]};window.me={id:'QA_MGR',role:'Manager'};window.ZUKAIT_MECHANICAL_ENABLED=true;window.zukaitAuth={getToken:()=> 'QA_SYNTHETIC'};window.overviewReads=0;
  window.openModal=html=>document.getElementById('modal').innerHTML=html;window.closeModal=()=>{};
  window.zukaitCloud={syncHealth:{ready:true,dirty:false,revision:8},readMechanicalQcOverview:async()=>{window.overviewReads++;return {ok:true,actorId:'QA_MGR',actorRole:'Manager',workshopRevision:8,recordsRevision:2,capturedAt:Date.now(),counts:{qc:1,ready:1,review:0},rows:[{jobCard:'12079',vehicle:'SyntheticLongVehicle'.repeat(15)+'<img src=x>',registration:'QA001',mechanical:true,checklistId:'MC001',mechanicalRequired:true,mechanicalPassed:true,deliveryReady:true,stage:'DELIVERY',readyAt:1},{jobCard:'12080',vehicle:'Synthetic pending vehicle',mechanical:true,checklistId:'MC002',mechanicalRequired:true,mechanicalPassed:false,deliveryReady:false,stage:'MECHANICAL_QC',qcVisible:true,readyAt:0}]}}};
 });
 await overviewPage.addScriptTag({content:fs.readFileSync('app/src/main/assets/qc_delivery.js','utf8').replace(/^import[^\n]+\n/,'').replace("import('./mechanical_qc_projection.js')","Promise.resolve({createMechanicalQcProjection:window.createMechanicalQcProjection})")});
 await overviewPage.waitForFunction(()=>document.querySelector('[data-manager-ready-slot] .qc-card-count')?.textContent==='1');
 await overviewPage.evaluate(()=>window.zukaitOpenReadyToDeliver());
 assert.equal(await overviewPage.locator('#qcRows .qc-overview-row').count(),1);assert.equal(await overviewPage.locator('#qcRows img').count(),0);assert.equal(await overviewPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Main Ready '+width+'px overflow');
 await overviewPage.evaluate(()=>window.zukaitOpenQCQueue());assert.equal(await overviewPage.locator('#qcRows .qc-overview-row').count(),1);assert.equal(await overviewPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Main QC '+width+'px overflow');
 const overviewReads=await overviewPage.evaluate(()=>window.overviewReads);await overviewPage.evaluate(()=>{for(let i=0;i<10;i++)window.dispatchEvent(new Event('zukait-live-status'))});assert.equal(await overviewPage.evaluate(()=>window.overviewReads),overviewReads);
 if([375,1280].includes(width))await overviewPage.screenshot({path:'test-results/mechanical/qc-overview-'+width+'.png',fullPage:true});await overviewPage.close();
 await page.close();
}console.log('PASS Chromium Mechanical layout at 320/375/768/1280: cards/forms, single-column phones, touch targets, escaping and no horizontal overflow. Not physical-device acceptance.');}
finally{await browser.close()}
