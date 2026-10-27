import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
import {createDatabaseFetch} from '../supabase/functions/workshop-api/database_fetch.js';

for(const status of [429,500,502,503,504,521,525]){
 let calls=0;
 const send=createDatabaseFetch(async()=>{calls++;return new Response('<html>origin unavailable; private diagnostic</html>',{status})});
 const response=await send('https://fixture.invalid/rpc/commit',{method:'POST',body:'same-command'});
 assert.equal(calls,1,'never retry a possibly committed write inside database transport');
 assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'5');
 assert.equal((await response.json()).code,'PGRST003');
}
for(const status of [200,401,403,409]){
 const response=await createDatabaseFetch(async()=>new Response('{"code":"original"}',{status}))('https://fixture.invalid');
 assert.equal(response.status,status);assert.equal((await response.json()).code,'original');
}
const source=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const block=source.slice(source.indexOf('/* V300 SERVER-AUTHORITATIVE'),source.indexOf('/* EMPLOYEE OCEAN TIMER'));
const store=new Map(),receipts=new Map(),sent=[];let commits=0,loseReceipt=true;
function boot(actor='EMP001',{brokenStorage=false,mismatch=false}={}){
 const messages=[];let seq=0;
 const c={Date,Math,JSON,String,Number,Set,Promise,crypto:{randomUUID:()=>`${actor}-${++seq}`},
  me:{id:actor,role:'Employee'},state:{assign:[{id:'assignment',emp:actor,job:'12098'}]},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(brokenStorage)throw Error('quota');store.set(k,v)},removeItem:k=>store.delete(k)},
  document:{getElementById:()=>null,createElement:()=>({style:{}}),body:{appendChild(){}},querySelectorAll:()=>[]},
  activeSession:()=>null,render(){},alert:m=>messages.push(m),window:{zukaitCloud:{employeeTimeAction:async command=>{
    sent.push(structuredClone(command));
    let r=receipts.get(command.action_id);
    if(!r){commits++;r={ok:true,audit:{confirmed:true,id:command.action_id,emp:actor,type:command.event_type}};receipts.set(command.action_id,r)}
    if(loseReceipt){loseReceipt=false;throw Error('NETWORK')}
    return mismatch?{ok:true,audit:{...r.audit,id:'wrong'}}:r;
  }}}};
 vm.runInNewContext(block,c);return {c,messages};
}
let b=boot();await b.c.window.start('12098');
const key='zukait_employee_time_pending_v1:EMP001';
assert.ok(store.has(key));assert.equal(commits,1);
const original=JSON.parse(store.get(key)).command;
b=boot();await b.c.window.start('OTHER');assert.equal(sent.length,1,'different job cannot replay uncertain start');
await b.c.window.v74Pause();assert.equal(sent.length,1,'different action cannot replace uncertain start');
await b.c.window.start('12098');assert.equal(commits,1,'lost receipt then reload must not create another start');
assert.deepEqual(sent[1],original,'same action, session, device and client timestamp across reload');assert.equal(store.has(key),false);
const before=sent.length;b=boot('EMP002',{brokenStorage:true});await b.c.window.start('12098');assert.equal(sent.length,before,'no send without a durable journal');
store.set(key,'{broken');b=boot();await b.c.window.start('12098');assert.equal(sent.length,before,'corrupt journal blocks replacement');
store.delete(key);b=boot('EMP003',{mismatch:true});await b.c.window.start('12098');assert.ok(store.has('zukait_employee_time_pending_v1:EMP003'),'mismatched receipt cannot remove journal');
b=boot('EMP004');await b.c.window.start('12098');assert.ok(store.has('zukait_employee_time_pending_v1:EMP003'),'another employee cannot consume original journal');
const privacy=fs.readFileSync('app/src/main/assets/session_privacy.js','utf8');
const retained=vm.runInNewContext(privacy.slice(privacy.indexOf('  function retained('),privacy.indexOf('  function clearCachedStorage('))+';retained');
assert.equal(retained(key),true);assert.equal(retained('zukait_employee_time_device_v1'),true);assert.equal(retained('zukait_offline_demo_v28_final'),false);
// Exercise the actual server transition as well as the client journal.
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const transitionSource=api.slice(api.indexOf('function employeeTimeTransition('),api.indexOf('// ID001_ASSIGNMENT_RULE_BEGIN'));
const transition=vm.runInNewContext(stripTypeScriptTypes(transitionSource)+';employeeTimeTransition',{cloneValue:structuredClone});
const employee={id:'EMP001',role:'Employee'};
const seed={sessions:[],assign:[{id:'assignment',emp:'EMP001',job:'12098'}],jobs:[{no:'12098'}]};
const first=transition(seed,employee,original,1000);assert.equal(first.ok,true);assert.equal(first.data.sessions.length,1);
const replay=transition(first.data,employee,original,2000);assert.equal(replay.duplicate,true);assert.equal(replay.data.sessions.length,1);assert.equal(replay.audit.serverAt,1000);
const afterPause=transition(first.data,employee,{event_type:'PAUSE',action_id:'pause',session_id:original.new_session_id,job:'12098'},3000);
assert.equal(afterPause.ok,true);
const lateReplay=transition(afterPause.data,employee,original,4000);assert.equal(lateReplay.duplicate,true);assert.equal(lateReplay.data.sessions.length,1);assert.equal(lateReplay.data.sessions[0].end,3000,'replaying a committed start after pause cannot open a new session');
assert.equal(transition(first.data,{id:'EMP002',role:'Employee'},original,2000).code,'employee_time_action_id_conflict');
assert.match(api,/\["57014","55P03","53300","53400","PGRST003"\]\.includes\(databaseCode\)/,'normalized origin errors must map to retryable busy responses');
console.log('PASS: upstream errors sanitized without replay; durable employee retry, lost receipt deduplication, actor isolation, corrupt/full storage safety and privacy cleanup retention.');
