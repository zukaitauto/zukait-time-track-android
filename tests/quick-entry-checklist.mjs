import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('app/src/main/assets/quick_entry_checklist.js','utf8');
function setup({choice='1',confirm=true,fail=false,insurance=false,approved=true}={}){
 const storage=new Map(),calls=[],alerts=[],record={rc_no:'RC1',sequence_no:1,revision:3,job_type:insurance?'INSURANCE':'CASH',repair_status:'PENDING',details:{make:'Toyota',model:'Camry',year:'2017',registration:'4493.D',vin:'VIN123'}};
 const ctx={state:{jobs:[]},me:{id:'S1'},crypto:{randomUUID:()=> 'request-1'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},prompt:()=>choice,confirm:()=>confirm,alert:t=>alerts.push(t),render(){},console};ctx.window=ctx;
 ctx.zukaitReception={call:async c=>{calls.push(c);if(c.operation==='LIST')return {rows:[record,{...record,rc_no:'RC2',job_card:'ALREADY'}]};if(c.operation==='GET')return {record,external_approval:{valid:approved}};if(fail)throw Error('Connection lost');ctx.state.jobs.push({no:c.job_card,receptionNo:c.rc_no});return {job_card:c.job_card}}};
 ctx.zukaitCloud={syncNow:async()=>{},pull:async()=>{}};ctx.assignJobCore=(...args)=>{ctx.assigned=args;return {id:'assigned'}};
 vm.runInNewContext(source,ctx);return {ctx,calls,storage,alerts,record,offer:ctx.zukaitQuickChecklist.offer};
}
const input={no:'12099',reg:'4493.D',vin:'VIN123',jobType:'CASH',amountRaw:'',emp:'E1',mins:120};
let h=setup();assert.equal(await h.offer(input),true);assert.equal(h.calls.at(-1).operation,'CREATE_CHECKLIST_JOB');assert.equal(h.calls.at(-1).expected_revision,3);assert.equal(h.ctx.assigned[0],'12099');assert.equal(h.storage.size,0);
for(const config of [{choice:null},{choice:'0'},{confirm:false}]){h=setup(config);assert.equal(await h.offer(input),config.choice==='0'?false:true);assert.ok(!h.calls.some(c=>c.operation.startsWith('CREATE')));}
h=setup();assert.equal(await h.offer({...input,reg:'OTHER',vin:''}),false);assert.equal(h.calls.length,1);
h=setup({insurance:true,approved:false});await h.offer({...input,jobType:'INSURANCE'});assert.ok(!h.calls.some(c=>c.operation.startsWith('CREATE')));assert.match(h.alerts.at(-1),/approval/);
h=setup({insurance:true});await h.offer({...input,jobType:'INSURANCE'});assert.equal(h.calls.at(-1).operation,'CREATE_EXTERNAL_JOB');
h=setup({fail:true});await h.offer(input);assert.equal(h.storage.size,1);const first=h.calls.at(-1);await h.offer(input);assert.deepEqual(h.calls.at(-1),first,'Uncertain writes must retry the exact same command');assert.equal(h.ctx.assigned,undefined);
const supervisor=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8');assert.equal((supervisor.match(/await window\.zukaitQuickChecklist\?\.offer/g)||[]).length,2);
console.log('Quick Entry checklist linking: matching, explicit consent, skip/cancel, approvals, stable retry and post-confirmation assignment passed');
