import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="modal"></div>',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window;
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};
w.me={id:'QA-MANAGER',role:'Manager'};w.zukaitAuth={getToken:()=> 'qa'};
w.openModal=h=>w.document.getElementById('modal').innerHTML=h;
w.state={jobs:[],assign:[],sessions:[]};let pulls=0;
w.zukaitCloud={pull:async force=>{assert.equal(force,true);pulls++;throw Error('offline pull')}};
let r={rc_no:'RC0001',revision:1,location:'VWC',approval_status:'APPROVED',insurance_company:'Liva Insurance',details:{make:'Toyota',model:'Camry'}};
let enabled=true,fail=true;const calls=[],cache=new Map();
w.fetch=async(_url,args)=>{const c=JSON.parse(args.body).command;calls.push(c);let result={ok:true};
 if(c.operation==='CAPABILITIES')result={ok:true,allowed:true,manager:true};
 if(c.operation==='LIST')result={ok:true,rows:[{...r,sequence_no:1}]};
 if(c.operation==='GET')result={ok:true,record:r,movements:[],audit:[],insurance:{can_prepare:false,can_revoke:false,approval_valid:enabled,estimates:[],approvals:[]},job_creation:{can_create:enabled&&!r.job_card,transfers:r.job_card?[{part_id:'qa'}]:[]}};
 if(c.operation==='CREATE_JOB'){
  if(!cache.has(c.request_id)){r={...r,revision:2,job_card:c.job_card};cache.set(c.request_id,{ok:true,record:r,server_revision:10})}
  result=cache.get(c.request_id);if(fail){fail=false;throw Error('Creation response lost')}
 }
 return {ok:true,json:async()=>structuredClone(result)};
};
w.eval(fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8'));
const click=async action=>{w.document.querySelector(`[data-rc-action="${action}"]`).click();await settle()};
await w.zukaitReception.open();await click('view');await click('insurance');
const form=w.document.getElementById('rc-create-job');assert.ok(form);
form.querySelector('[name="job_card"]').value='  jc12345  ';form.querySelector('[name="reason"]').value='  Approval checked  ';
const submit=async()=>{form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle()};
await submit();assert.match(w.document.getElementById('rc-error').textContent,/Creation response lost/);assert.equal(pulls,0);
await submit();const commands=calls.filter(c=>c.operation==='CREATE_JOB');
assert.equal(commands.length,2);assert.equal(commands[0].request_id,commands[1].request_id);
assert.equal(commands[0].job_card,'JC12345');assert.equal(commands[0].reason,'Approval checked');assert.equal(commands[0].expected_revision,1);
assert.equal(cache.size,1);assert.equal(pulls,1);assert.equal(r.location,'VWC');assert.equal(w.state.jobs.length,0);assert.equal(w.state.assign.length,0);assert.equal(w.state.sessions.length,0);
assert.equal(w.document.getElementById('rc-create-job'),null);assert.match(w.document.getElementById('rc-root').textContent,/Linked Job Card JC12345/);
assert.match(w.document.getElementById('rc-root').textContent,/1 approved part items transferred/);
r={...r,job_card:null};enabled=false;await click('home');await click('view');await click('insurance');assert.equal(w.document.getElementById('rc-create-job'),null);
w.me=null;dom.window.close();
console.log('RC creation UI: server gate, normalized number, stable lost-response retry, confirmed linkage, failed pull recovery, no fabricated local work and read-only state passed.');
