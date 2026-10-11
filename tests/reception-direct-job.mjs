import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="modal"></div>',{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;
w.me={id:'QA-RC',role:'Receptionist'};w.zukaitAuth={getToken:()=> 'qa-token'};
w.openModal=h=>w.document.getElementById('modal').innerHTML=h;
const calls=[],receipts=new Map();let lose=true,record;
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
w.fetch=async(_url,args)=>{
 const c=JSON.parse(args.body).command;calls.push(c);let result={ok:true};
 if(c.operation==='CAPABILITIES')result={ok:true,allowed:true,manager:w.me.role==='Manager'};
 if(c.operation==='LIST')result={ok:true,rows:[]};
 if(c.operation==='MASTER')result={ok:true,companies:[{id:1,name:'QA Insurance'}]};
 if(c.operation==='GET')result={ok:true,record,movements:[],audit:[],insurance:{approval_valid:false,can_prepare:false,estimates:[],approvals:[]},external_approval:{valid:record.job_type==='INSURANCE',can_record:w.me.role==='Manager'},job_creation:{can_create:false}};
 if(c.operation==='CREATE_DIRECT_JOB'){
  if(!receipts.has(c.request_id)){
   record={rc_no:'RC-QA-'+receipts.size,job_card:c.job_card,job_type:c.job_type,details:c.details,location:'VIW',revision:2,approval_status:'WAITING'};
   receipts.set(c.request_id,{ok:true,record});
  }
  result=receipts.get(c.request_id);
  if(lose){lose=false;throw Error('QA response lost');}
 }
 return {ok:true,json:async()=>structuredClone(result)};
};
w.eval(fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8'));
await w.zukaitReception.open();
const click=async action=>{w.document.querySelector(`[data-rc-action="${action}"]`).click();await settle();};
await click('direct-job');
let form=w.document.getElementById('rc-direct-job');assert.ok(form);
for(const [k,v] of Object.entries({job_card:' qa-cash ',make:'Toyota',model:'Camry',customer:'QA Customer',contact:'QA phone',reason:'QA intake',remarks:'Reception only'}))form.elements[k].value=v;
form.elements.received_confirmed.checked=true;
const submit=async()=>{form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
await submit();assert.match(w.document.getElementById('rc-error').textContent,/response lost/);
await submit();
const cash=calls.filter(c=>c.operation==='CREATE_DIRECT_JOB');assert.equal(cash.length,2);assert.deepEqual(cash[0],cash[1]);assert.equal(cash[0].job_card,'QA-CASH');assert.equal(cash[0].job_type,'CASH');assert.ok(!('credit_account' in cash[0]));assert.equal(receipts.size,1);
assert.equal(w.document.querySelector('[data-rc-action=insurance]'),null);
await click('home');await click('direct-job');form=w.document.getElementById('rc-direct-job');
form.elements.job_type.value='CREDIT';form.elements.job_type.dispatchEvent(new w.Event('change'));
assert.equal(w.document.getElementById('rc-credit-account').hidden,false);assert.equal(form.elements.credit_account.required,true);
for(const [k,v] of Object.entries({job_card:'QA-CREDIT',make:'Toyota',model:'Camry',customer:'QA Company',contact:'QA phone',reason:'QA credit',credit_account:'QA-FLEET'}))form.elements[k].value=v;
form.elements.received_confirmed.checked=true;await submit();assert.equal(receipts.size,2);assert.equal(calls.filter(c=>c.operation==='CREATE_DIRECT_JOB').at(-1).credit_account,'QA-FLEET');
await click('home');await click('direct-job');form=w.document.getElementById('rc-direct-job');
assert.deepEqual([...form.elements.job_type.options].map(x=>x.value),['CASH','INSURANCE','CREDIT']);
form.elements.job_type.value='INSURANCE';form.elements.job_type.dispatchEvent(new w.Event('change'));
assert.equal(w.document.getElementById('rc-direct-insurance').hidden,false);
assert.equal(form.elements.insurance_id.required,true);
assert.equal(form.elements.reference.required,true);
assert.equal(form.elements.approval_date.required,true);
assert.equal(form.elements.evidence.required,true);
assert.equal(form.elements.approval_confirmed.required,true);
assert.equal(w.document.getElementById('rc-credit-account').hidden,true);
for(const [k,v] of Object.entries({job_card:'12069',make:'Nissan',model:'Altima',registration:'7561.BH',
 customer:'QA Insured Customer',contact:'QA phone',reason:'Approved repair',insurance_id:'1',
 reference:'QA-LPO-123',approval_date:'2026-10-11',evidence:'Approval verified'}))form.elements[k].value=v;
form.elements.approval_confirmed.checked=true;form.elements.received_confirmed.checked=true;
await submit();
const insurance=calls.filter(c=>c.operation==='CREATE_DIRECT_JOB').at(-1);
assert.equal(insurance.job_type,'INSURANCE');
assert.equal(insurance.job_card,'12069');
assert.equal(insurance.insurance_id,1);
assert.equal(insurance.approval_confirmed,true);
assert.equal(insurance.reference,'QA-LPO-123');
assert.equal(insurance.evidence,'Approval verified');
assert.ok(!('credit_account' in insurance));
assert.equal(receipts.size,3);
record={rc_no:'RC-QA-INSURANCE',details:{make:'Toyota',model:'Camry'},job_type:'INSURANCE',location:'VWC',approval_status:'APPROVED',revision:2};
// Only authorized staff can record issued approval. Receptionist only creates.
await w.zukaitReception.open();
// Go through the public list/view events with a QA record row.
const oldFetch=w.fetch;w.fetch=async(url,args)=>{
 const c=JSON.parse(args.body).command;
 if(c.operation==='LIST')return {ok:true,json:async()=>({ok:true,rows:[{...record,sequence_no:1}]})};
 return oldFetch(url,args);
};
await click('home');await click('view');await click('insurance');
assert.ok(w.document.getElementById('rc-external-job'));assert.equal(w.document.getElementById('rc-external-approval'),null);assert.equal(w.document.getElementById('rc-approval'),null);
w.me={id:'QA-MGR',role:'Manager'};await w.zukaitReception.open();await click('view');await click('insurance');
assert.ok(w.document.getElementById('rc-external-approval'));
w.me=null;await settle();dom.window.close();console.log('Direct Reception Job Cards: Cash/Credit/Insurance fields, manually numbered approved insurance, stable lost-response UUID, role isolation and approval controls passed (mock transport).');
