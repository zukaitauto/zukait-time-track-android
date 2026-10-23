import assert from 'node:assert/strict';import fs from 'node:fs';import {chromium} from 'playwright';
const source=fs.readFileSync('app/src/main/assets/mechanical_workspace.js','utf8').replace('export async function mountMechanicalWorkspace','window.mountMechanicalWorkspace=async function');
const navigation=fs.readFileSync('app/src/main/assets/mechanical_navigation.js','utf8').replace('export function installMechanicalNavigation','window.installMechanicalNavigation=function');
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
  const store=new Map();await window.mountMechanicalWorkspace(document.getElementById('root'),{enabled:true,getSession:()=>({id:'QA_SUP',role:'Supervisor',key:'QA_SYNTHETIC'}),online:()=>true,storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},deviceId:'QA_DEVICE',uuid:()=>String(++serial),api:async body=>{window.calls.push(body);return {...data,detail:body.checklistId?detail:null}}});
 });
 await page.getByRole('button',{name:'MC001 · JC 12079 · 2026-10-22',exact:true}).click();await page.locator('[data-operation=TASK_HANDOVER]').waitFor();
 const shape=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.mc-grid')).gridTemplateColumns.split(' ').length,unsafe:document.querySelectorAll('#root script,#root img').length,tooNarrow:[...document.querySelectorAll('#root input,#root select,#root button')].some(e=>e.getBoundingClientRect().height<43)}));
 assert.equal(shape.overflow,false,width+'px horizontal overflow');assert.equal(shape.columns,width<=760?1:2);assert.equal(shape.unsafe,0);assert.equal(shape.tooNarrow,false,'Touch controls need at least 44px');
 assert.equal(await page.locator('[data-operation=TASK_CREATE]').count(),1);assert.equal(await page.locator('[data-operation=TASK_ASSIGN]').count(),1);
 if([375,1280].includes(width))await page.screenshot({path:'test-results/mechanical/workspace-'+width+'.png',fullPage:true});
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
 await page.close();
}console.log('PASS Chromium Mechanical layout at 320/375/768/1280: cards/forms, single-column phones, touch targets, escaping and no horizontal overflow. Not physical-device acceptance.');}
finally{await browser.close()}
