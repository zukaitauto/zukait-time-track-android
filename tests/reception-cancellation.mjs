import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {qcTransition,qcStatus} from '../app/src/main/assets/qc_delivery_rules.js';
const dom=new JSDOM('<div id="modal"></div>',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window;
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};
w.me={id:'QA-MANAGER',role:'Manager'};w.zukaitAuth={getToken:()=> 'qa'};w.openModal=h=>w.document.getElementById('modal').innerHTML=h;
w.state={jobs:[{no:'JC123'}],assign:[{id:'QA',job:'JC123',completed:true}],sessions:[{id:'QA-S',job:'JC123',start:100,end:200}],consumables:{actuals:[{jobCard:'JC123',totalCost:3}]}};
const original=structuredClone(w.state);let pulls=0,fail=true,canReview=true,active=0;
w.zukaitCloud={pull:async()=>{pulls++}};
let record={rc_no:'RC0001',job_card:'JC123',revision:2,location:'VWC',approval_status:'APPROVED',details:{make:'Toyota',model:'Camry',registration:'QA-1'}};
const calls=[],cache=new Map();let history=null;
w.fetch=async(_url,args)=>{const c=JSON.parse(args.body).command;calls.push(c);let result={ok:true};
 if(c.operation==='CAPABILITIES')result={ok:true,allowed:true,manager:true};
 if(c.operation==='LIST')result={ok:true,rows:[{...record,sequence_no:1}]};
 if(c.operation==='GET')result={ok:true,record,movements:[],audit:[],cancellation:{can_review:canReview&&!history,history,review:{fingerprint:'review-v1',active_assignments:active,active_sessions:0,projected_active_sessions:0,unresolved_projected_assignments:0,outstanding_parts:1,parts:[{part_name:'<script>QA Lamp</script>',list_no:'PL-QA',status:'LISTED',ordered_qty:2,received_qty:0}]}}};
 if(c.operation==='CANCEL_JOB'){
  if(!cache.has(c.request_id)){record={...record,revision:3,outcome:'CANCELLED'};history={cancellation_date:c.cancellation_date,reason:c.reason,actor_id:'QA-MANAGER',actor_name:'<script>Manager</script>'};cache.set(c.request_id,{ok:true,record})}
  result=cache.get(c.request_id);if(fail){fail=false;throw Error('Cancellation response lost')}
 }
 return {ok:true,json:async()=>structuredClone(result)};
};
w.eval(fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8'));
const click=async action=>{w.document.querySelector(`[data-rc-action="${action}"]`).click();await settle()};
await w.zukaitReception.open();await click('view');await click('cancel-job');
assert.match(w.document.getElementById('rc-root').textContent,/Outstanding Parts: 1/);assert.equal(w.document.querySelectorAll('#rc-root script').length,0);
let form=w.document.getElementById('rc-cancel-job');assert.ok(form);
form.querySelector('[name="job_card"]').value=' jc123 ';form.querySelector('[name="reason"]').value=' Customer withdrew repair ';form.querySelector('[name="review_acknowledged"]').checked=true;
const submit=async()=>{form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle()};
await submit();assert.match(w.document.getElementById('rc-error').textContent,/Cancellation response lost/);assert.equal(pulls,0);assert.deepEqual(w.state,original);
await submit();const commands=calls.filter(c=>c.operation==='CANCEL_JOB');assert.equal(commands[0].request_id,commands[1].request_id);assert.equal(commands[0].job_card,'JC123');assert.equal(commands[0].review_fingerprint,'review-v1');assert.equal(commands[0].review_acknowledged,true);assert.equal(commands[0].reason,'Customer withdrew repair');assert.equal(pulls,1);assert.deepEqual(w.state,original);assert.equal(record.location,'VWC');assert.match(w.document.getElementById('rc-root').textContent,/Job Card cancelled/);assert.equal(w.document.querySelectorAll('#rc-root script').length,0);assert.equal(w.document.querySelector('[data-rc-action="cancel-job"]'),null);assert.ok(w.document.querySelector('[data-rc-action="movement"]'));
history=null;record={...record,outcome:null};active=1;await w.zukaitReception.openCancellation(record.rc_no);await settle();assert.equal(w.document.getElementById('rc-cancel-job'),null);assert.match(w.document.getElementById('rc-root').textContent,/blocked by active/);
canReview=false;await click('view');assert.equal(w.document.querySelector('[data-rc-action="cancel-job"]'),null);
const cancelled={no:'JC123',status:'Cancelled',cancelled:true},data={jobs:[cancelled],assign:[],sessions:[]};assert.equal(qcTransition(data,{role:'Supervisor',id:'SUP001'},{jobCard:'JC123',operation:'DELIVER'},Date.now()).code,'job_not_available');assert.equal(qcStatus(data,cancelled).deliveryReady,false);assert.equal(qcStatus(data,cancelled).stage,'CANCELLED');
w.eval(fs.readFileSync('app/src/main/assets/v2/features/time/work_rules.js','utf8'));assert.ok(w.zukaitV2.rules.validate('WORK_START',{job:'JC123',emp:'QA'},data).issues.includes('job-cancelled'));
// The legacy destructive action routes linked jobs before password or local writes.
const source=fs.readFileSync('app/src/main/assets/secure_auth.js','utf8'),fn=source.slice(source.indexOf('window.confirmDeleteJob=async function'),source.indexOf('async function restoreSession'));
w.job=()=>({no:'JC123',receptionNo:'RC0001'});let routed=null;w.zukaitReception.openCancellation=async rc=>routed=rc;w.eval(fn);await w.confirmDeleteJob('JC123');assert.equal(routed,'RC0001');assert.deepEqual(w.state,original);
const all=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8'),detail=all.slice(all.indexOf('window.v132OpenSupervisorJobFull=function'),all.indexOf('window.v132ReissueJob=function'));
w.state.jobs=[{no:'JC123',cancelled:true,receptionNo:'RC0001'}];w.v74JLE=String;w.v74JLP=()=>({name:'QA',department:'QA'});w.fmt=String;w.totalForAssignment=()=>2;w.empStatus=()=> 'Finished';let body='';w.showSupervisorModal=(_title,value)=>body=value;w.eval(detail);w.v132OpenSupervisorJobFull('JC123');assert.match(body,/CANCELLED/);assert.ok(!body.includes('REISSUE JOB'));assert.match(body,/Work History/);
w.me=null;dom.window.close();
console.log('Manager cancellation UI: active-work block, outstanding-parts review, mandatory identity/date/reason, stable lost-response retry, confirmed-only refresh, retained data/VWC, escaped history, QC/work rejection and safe legacy-delete routing passed.');
