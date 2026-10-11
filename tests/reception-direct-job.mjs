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
assert.equal(form.elements.claim.required,true);
assert.equal(form.elements.approval_date.required,false);
assert.equal(form.elements.evidence.required,false);
assert.equal(form.elements.approval_confirmed.required,true);
assert.equal(w.document.getElementById('rc-credit-account').hidden,true);
for(const [k,v] of Object.entries({job_card:'12069',make:'Nissan',model:'Altima',registration:'7561.BH',
 customer:'QA Insured Customer',contact:'QA phone',reason:'Approved repair',insurance_id:'1',
 claim:'QA-CLAIM-123',approval_date:'2026-10-11',evidence:'Approval verified'}))form.elements[k].value=v;
form.elements.approval_confirmed.checked=true;form.elements.received_confirmed.checked=true;
await submit();
const insurance=calls.filter(c=>c.operation==='CREATE_DIRECT_JOB').at(-1);
assert.equal(insurance.job_type,'INSURANCE');
assert.equal(insurance.job_card,'12069');
assert.equal(insurance.insurance_id,1);
assert.equal(insurance.approval_confirmed,true);
assert.equal(insurance.reference,'QA-CLAIM-123');
assert.equal(insurance.evidence,'Approval verified');
assert.equal(insurance.details.claim,'QA-CLAIM-123','Claim Number must be saved in vehicle details');
assert.equal(insurance.details.odometer,'','Blank Job Card odometer stays blank, never inherited from checklist');
assert.equal(insurance.details.odometer_unit,'KM');
assert.ok(!('credit_account' in insurance));
assert.equal(receipts.size,3);
// Existing checklist search must fill editable identity fields, preserve the original reading,
// and refuse an unlinked second job until the atomic linked-update API is available.
const searchRecord={rc_no:'RC0099',job_type:'INSURANCE',insurance_id:1,revision:2,location:'VWC',approval_status:'APPROVED',
 details:{make:'Nissan',model:'Altima',registration:'7561.BH',year:'2014',vin:'QA-VIN',customer:'QA Customer',contact:'QA Phone',
 claim:'QA-CLAIM',odometer:'53699',odometer_unit:'KM'}};
const fetchBeforeSearch=w.fetch;
w.fetch=async(url,args)=>{
 const command=JSON.parse(args.body).command;
 if(command.operation==='LIST'&&command.search)return {ok:true,json:async()=>({ok:true,rows:[searchRecord]})};
 if(command.operation==='GET'&&command.rc_no===searchRecord.rc_no)return {ok:true,json:async()=>({ok:true,record:searchRecord,external_approval:{valid:true}})};
 if(command.operation==='CREATE_EXTERNAL_JOB')return {ok:true,json:async()=>({ok:true,record:{...searchRecord,job_card:command.job_card}})};
 return fetchBeforeSearch(url,args);
};
await click('home');await click('direct-job');form=w.document.getElementById('rc-direct-job');
assert.equal(w.document.querySelector('[data-rc-action="new"]'),null);
w.document.getElementById('rc-direct-checklist-search').value='7561.BH';
w.document.getElementById('rc-direct-checklist-find').click();await settle();
const pick=w.document.querySelector('[data-rc-pick="0"]');assert.ok(pick,'Checklist search result available');
pick.click();await settle();
assert.equal(form.elements.registration.value,'7561.BH');
assert.equal(form.elements.make.value,'Nissan');
assert.equal(form.elements.model.value,'Altima');
assert.equal(form.elements.claim.value,'QA-CLAIM');
assert.equal(form.elements.insurance_id.value,'1');
assert.equal(form.elements.odometer.value,'','Original checklist reading must never prefill as new intake');
form.elements.odometer.value='53845';
form.elements.odometer_unit.value='Miles';
assert.equal(form.elements.odometer.value,'53845');
assert.match(w.document.getElementById('rc-direct-checklist-note').textContent,/53699/,'Original recorded 53699 KM remains visible while new reading changes');
assert.deepEqual([...form.elements.odometer_unit.options].map(x=>x.value),['KM','Miles'],'Units must match PostgreSQL validation');
assert.match(w.document.getElementById('rc-direct-checklist-note').textContent,/53699/);
form.elements.customer.value='Updated QA Customer';assert.equal(form.elements.customer.value,'Updated QA Customer');
const beforeLinked=calls.filter(c=>c.operation==='CREATE_DIRECT_JOB').length;
await submit();assert.equal(calls.filter(c=>c.operation==='CREATE_DIRECT_JOB').length,beforeLinked,'Linked checklist must never create a second direct intake');
assert.equal(calls.filter(c=>c.operation==='CREATE_EXTERNAL_JOB').length,0,'Receptionist cannot silently alter approved identity');
assert.equal(w.document.getElementById('rc-direct-checklist-clear').hidden,false);
w.document.getElementById('rc-direct-checklist-clear').click();await settle();
assert.equal(w.document.getElementById('rc-direct-checklist-clear').hidden,true);
assert.equal(form.elements.make.value,'');
assert.equal(form.elements.odometer.value,'');
assert.match(w.document.getElementById('rc-direct-checklist-note').textContent,/NEW reception intake/);
w.fetch=fetchBeforeSearch;
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
