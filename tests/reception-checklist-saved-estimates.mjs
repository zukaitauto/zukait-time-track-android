import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const estimate=fs.readFileSync(new URL('../app/src/main/assets/v2/features/estimate/main_module.js',import.meta.url),'utf8');
const reception=fs.readFileSync(new URL('../app/src/main/assets/v2/features/insurance/reception.js',import.meta.url),'utf8');
const a=estimate.indexOf('let receptionEstimateListBusy=false;'),b=estimate.indexOf('let receptionEstimateBusy=false;',a);
assert.ok(a>=0&&b>a,'Checklist estimate chooser must exist');
const code=estimate.slice(a,b);

test('checklist Estimate action opens existing-estimate chooser instead of allocating new quote',()=>{
 assert.match(reception,/case "rc-estimate":\s*await window\.zukaitEstimate\.openReceptionEstimates\(current\.record\.rc_no\)/);
 assert.doesNotMatch(reception,/case "rc-estimate":\s*await window\.zukaitEstimate\.newFromReception/);
});

test('saved estimates are loaded from the authoritative case-specific endpoint and scoped by RC number',async()=>{
 const state={estimates:[{id:'other',receptionNo:'RC0040',status:'Saved',estimateNo:'Zi-Qt-OTHER'}]};
 let html='',calls=0,allocations=0;
 const response={estimates:[
  {id:'saved',receptionNo:'RC0033',status:'Saved',estimateNo:'Zi-Qt-SAVED',lsRows:[{amount:40}],type:'LS'},
  {id:'draft',receptionNo:'RC0033',status:'Draft',estimateNo:'Zi-Qt-DRAFT'},
  {id:'additional',receptionNo:'RC0033',receptionAdditionalRequestId:'ROUND1',status:'Saved',estimateNo:'Zi-Qt-ADDITIONAL'}
 ]};
 const window={zukaitReception:{action:async(command)=>{calls++;assert.equal(command.command.operation,'GET');assert.equal(command.command.rc_no,'RC0033');return response;}}};
 const args={window,state,canUse:()=>true,role:()=> 'Manager',navigator:{onLine:true},ensureState:()=>{},
  ensureStyle:()=>{},nav:()=>'',esc:String,money:x=>Number(x||0).toFixed(3),totals:x=>({total:x.lsRows?.[0]?.amount||0}),
  openModal:x=>{html=x},alert:()=>{},newFromReception:()=>{allocations++}};
 const open=new Function(...Object.keys(args),code+';return openReceptionEstimates;')(...Object.values(args));
 await open('RC0033');
 assert.equal(calls,1);
 assert.equal(allocations,0,'merely opening existing estimates never allocates another quote number');
 assert.match(html,/Zi-Qt-SAVED/);
 assert.match(html,/View Estimate/);
 assert.match(html,/Edit Estimate/);
 assert.match(html,/Zi-Qt-DRAFT/);
 assert.match(html,/Continue Draft/);
 assert.match(html,/Create New Estimate/);
 assert.doesNotMatch(html,/Zi-Qt-OTHER|Zi-Qt-ADDITIONAL/,'other checklists and additional-round quotes are excluded');
 assert.ok(state.estimates.some(e=>e.id==='other'),'other estimate records are preserved');
});
