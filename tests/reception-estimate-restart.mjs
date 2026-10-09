// Real RC allocation/draft functions in fresh runtimes; mocked allocation transport.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const source=fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8');
const functions=source.slice(source.indexOf('async function newEstimate('),source.indexOf('function field('));
function start(storage,state,allocate,actor='QA-MANAGER',endpoint='https://qa.invalid/workshop-api') {
  const alerts=[],context={state,canUse:()=>true,currentUser:()=>({id:actor}),ensureState(){},findEstimate:id=>state.estimates.find(e=>e.id===id),uid:randomUUID,localDate:()=> '2026-10-09',navigator:{onLine:true},openEditor(){},audit:e=>state.estimateAudit.push(e.id),saveState(){},alert:m=>alerts.push(m),localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{zukaitCloud:{allocateEstimateNo:allocate},zukaitReception:{endpoint,call:async()=>({record:{rc_no:'RC-QA',job_card:context.round?'JC-QA':null,insurance_company:'QA',details:{make:'Toyota',model:'Corolla'}},additional:{can_prepare:true,requests:[{id:context.round,status:'DRAFT'}]}})}}};
  vm.runInNewContext(functions,context);return {...context,alerts};
}
for(const round of [null,'QA-ROUND']) {
  const storage=new Map(),state={estimates:[],estimateAudit:[]},allocations=new Map(),keys=[];let lost=true;
  const allocate=async key=>{keys.push(key);if(!allocations.has(key))allocations.set(key,{estimate_no:'Zi-Qt-QA',sequence_no:1});if(lost){lost=false;throw Error('allocated but response lost');}return allocations.get(key);};
  let a=start(storage,state,allocate);
  // Additional round permission is provided by replacing the read-only GET fixture.
  if(round)a.window.zukaitReception.call=async()=>({record:{rc_no:'RC-QA',job_card:'JC-QA',details:{make:'Toyota',model:'Corolla'}},additional:{can_prepare:true,requests:[{id:round,status:'DRAFT'}]}});
  await a.newFromReception('RC-QA',round);assert.equal(state.estimates.length,0);assert.equal(storage.size,1);
  const persisted=[...storage.entries()][0];
  let b=start(storage,state,allocate);
  if(round)b.window.zukaitReception.call=a.window.zukaitReception.call;
  const id=await b.newFromReception('RC-QA',round);
  assert.equal(keys[0],keys[1]);assert.equal(id,keys[0]);assert.equal(allocations.size,1);assert.equal(state.estimates.length,1);assert.equal(storage.size,0);
  assert.equal(state.estimates[0].receptionAdditionalRequestId||null,round);
  // Device stopped after draft persistence but before clearing its allocation journal.
  storage.set(...persisted);b=start(storage,state,allocate);if(round)b.window.zukaitReception.call=a.window.zukaitReception.call;
  await b.newFromReception('RC-QA',round);assert.equal(keys.length,2);assert.equal(state.estimates.length,1);assert.equal(state.estimateAudit.length,1);assert.equal(storage.size,0);
}
{
  const storage=new Map(),state={estimates:[],estimateAudit:[]};let sent=0;
  const client=start(storage,state,async()=>{sent++;});
  client.localStorage.setItem=()=>{throw Error('storage denied');};
  await client.newFromReception('RC-QA');assert.equal(sent,0);assert.match(client.alerts[0],/storage denied/);
}
{
  const storage=new Map(),state={estimates:[],estimateAudit:[]},keys=[];
  const allocate=async key=>{keys.push(key);throw Error('lost');};
  await start(storage,state,allocate,'QA-A').newFromReception('RC-QA');
  await start(storage,state,allocate,'QA-B').newFromReception('RC-QA');
  await start(storage,state,allocate,'QA-A','https://other-qa.invalid/workshop-api').newFromReception('RC-QA');
  assert.equal(new Set(keys).size,3);assert.equal(storage.size,3);
  const key=[...storage.keys()][0];storage.set(key,'corrupt');const client=start(storage,state,allocate,'QA-A');
  await client.newFromReception('RC-QA');assert.equal(keys.length,3);assert.match(client.alerts[0],/could not be read/);assert.equal(storage.get(key),'corrupt');
}
console.log('RC estimate restart: initial/additional allocation keys survive response loss/restart, one allocation and draft/audit, saved-draft recovery, actor/backend isolation and storage/corruption refusal passed. Mocked transport only.');
