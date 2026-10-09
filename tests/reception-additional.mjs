import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};
const round='a0000000-0000-4000-8000-000000000001',part='b0000000-0000-4000-8000-000000000001',quote='c0000000-0000-4000-8000-000000000001';
function setup(){const dom=new JSDOM('<div id="modal"></div>',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window;w.me={id:'QA-MANAGER',role:'Manager'};w.openModal=h=>w.document.getElementById('modal').innerHTML=h;w.alert=()=>{};w.closeModal=()=>{};return {dom,w}}
{
 const {dom,w}=setup();w.state={jobs:[],sessions:[],assignments:[],estimates:[],estimateAudit:[]};let allowed=true,fail=true,pulls=0;const keys=[];
 w.zukaitReception={call:async()=>({record:{rc_no:'RC0001',job_card:'JC123',location:'VWC',insurance_company:'Liva',details:{make:'Toyota',model:'Camry'}},additional:{can_prepare:allowed,requests:[{id:round,status:'DRAFT'}]}})};
 w.save=()=>pulls++;w.zukaitCloud={allocateEstimateNo:async key=>{keys.push(key);if(fail){fail=false;throw Error('lost allocation')}return {estimate_no:'Zi-QtQA',sequence_no:1}}};
 w.eval(fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8'));
 await w.zukaitEstimate.newFromReception('RC0001',round);assert.equal(w.state.estimates.length,0);
 w.eval(fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8')); // Discard the former in-memory retry map.
 await w.zukaitEstimate.newFromReception('RC0001',round);await settle();assert.equal(keys[0],keys[1]);
 const e=w.state.estimates[0];assert.equal(e.jobCard,'JC123');assert.equal(e.receptionNo,'RC0001');assert.equal(e.receptionAdditionalRequestId,round);assert.equal(e.makeModel,'Toyota Camry');assert.equal(pulls,1);assert.equal(w.document.getElementById('estJobCard').readOnly,true);
 allowed=false;await w.zukaitEstimate.newFromReception('RC0001',round);assert.equal(keys.length,2);
 await w.zukaitEstimate.newFromReception('RC0001','missing');assert.equal(keys.length,2);assert.equal(w.state.jobs.length,0);
 w.me=null;dom.window.close();
}
{
 const {dom,w}=setup();w.zukaitAuth={getToken:()=> 'qa'};w.state={jobs:[],sessions:[],assignments:[]};
 let record={rc_no:'RC0001',revision:1,job_card:'JC123',location:'VWC',approval_status:'APPROVED',details:{make:'Toyota',model:'Camry'},insurance_company:'Liva'},requests=[],quotes=[],approvals=[],transfers=[],allowed=true,fail=true,pulls=0,hydrates=0;
 const calls=[],cache=new Map();w.zukaitCloud={pull:async()=>pulls++};w.zukaitV2={sparePartsMain:{hydrateAuthoritativeLists:async()=>hydrates++}};
 w.fetch=async(_url,args)=>{const c=JSON.parse(args.body).command;calls.push(c);let result={ok:true};
  if(c.operation==='CAPABILITIES')result={ok:true,allowed:true,manager:true};
  if(c.operation==='LIST')result={ok:true,rows:[{...record,sequence_no:1}]};
  if(c.operation==='GET')result={ok:true,record,movements:[],audit:[],preliminary_parts:{items:[],can_edit:false},insurance:{can_prepare:false,can_revoke:false,approval_valid:true,estimates:quotes,approvals:[]},additional:{can_prepare:allowed,requests,approvals,transfers,initial_amount:100,additional_amount:approvals.length?15.555:0}};
  if(['SAVE_ADDITIONAL_REQUEST','LINK_ADDITIONAL_ESTIMATE','APPROVE_ADDITIONAL'].includes(c.operation)){
   if(!cache.has(c.request_id)){
    record={...record,revision:record.revision+1};
    if(c.operation==='SAVE_ADDITIONAL_REQUEST')requests=[{id:c.round_id,status:'DRAFT',items:c.items}];
    if(c.operation==='LINK_ADDITIONAL_ESTIMATE'){quotes=[{id:quote,estimate_no:'Zi-QA',linked_at:'2026-10-09'}];requests[0].quotation_id=quote}
    if(c.operation==='APPROVE_ADDITIONAL'){requests[0].status='APPROVED';approvals=[{id:round,reference:c.reference,approval_date:c.approval_date,approved_amount:c.approved_amount,actor_id:'QA',reason:c.reason,approved_parts:[{name:requests[0].items[0].name,qty:1}]}];transfers=[{approval_id:round,list_no:'PL-QA',qty:1}]}
    cache.set(c.request_id,{ok:true,record});
   }
   result=cache.get(c.request_id);if(fail){fail=false;throw Error('Response lost')}
  }
  return {ok:true,json:async()=>structuredClone(result)};
 };
 w.eval(fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8'));
 const click=async action=>{w.document.querySelector(`[data-rc-action="${action}"]`).click();await settle()};
 const submit=async id=>{w.document.getElementById(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle()};
 const set=(id,name,value)=>w.document.querySelector(`#${id} [name="${name}"]`).value=value;
 await w.zukaitReception.open();await click('view');await click('insurance');await click('additional-parts');
 w.document.getElementById('rc-add-part').click();set('rc-parts','part_name','<script>QA Lamp</script>');set('rc-parts','part_no','L1');set('rc-parts','part_qty','3');set('rc-parts','reason','Assessment');
 await submit('rc-parts');assert.match(w.document.getElementById('rc-error').textContent,/Response lost/);await submit('rc-parts');
 const saved=calls.filter(c=>c.operation==='SAVE_ADDITIONAL_REQUEST');assert.equal(saved[0].request_id,saved[1].request_id);assert.equal(saved[0].round_id,saved[1].round_id);assert.equal(saved[0].items[0].id,saved[1].items[0].id);assert.equal(pulls,0);
 await click('insurance');set('rc-additional-link','estimate_no','Zi-QA');set('rc-additional-link','reason','Review');await submit('rc-additional-link');
 const qty=w.document.querySelector('[data-approved-id]'),check=w.document.querySelector('[name="approve_part"]');assert.equal(qty.disabled,true);check.checked=true;check.dispatchEvent(new w.Event('change'));qty.value='1';
 set('rc-additional-approval','reference','<script>ADD</script>');set('rc-additional-approval','approved_amount','15.555');set('rc-additional-approval','reason','Surveyor approval');
 fail=true;await submit('rc-additional-approval');assert.equal(pulls,0);assert.equal(hydrates,0);assert.equal(w.state.jobs.length,0);
 await submit('rc-additional-approval');const approved=calls.filter(c=>c.operation==='APPROVE_ADDITIONAL');assert.equal(approved[0].request_id,approved[1].request_id);assert.equal(approved[0].quotation_id,quote);assert.deepEqual(approved[0].approved_parts,[{id:saved[0].items[0].id,qty:1}]);assert.equal(pulls,1);assert.equal(hydrates,1);
 assert.equal(record.location,'VWC');assert.equal(w.document.querySelectorAll('#rc-root script').length,0);assert.match(w.document.getElementById('rc-root').textContent,/OMR 15.555/);assert.match(w.document.getElementById('rc-root').textContent,/incremental approvals/);assert.match(w.document.getElementById('rc-root').textContent,/PL-QA/);
 allowed=false;await click('home');await click('view');await click('insurance');assert.equal(w.document.querySelector('[data-rc-action="additional-parts"]'),null);assert.equal(w.document.getElementById('rc-additional-approval'),null);
 assert.equal(w.state.sessions.length,0);assert.equal(w.state.assignments.length,0);w.me=null;dom.window.close();
}
console.log('Additional approvals UI: server-gated estimates, reviewed quote linkage, stable draft/approval retries, partial quantities, confirmed-only parts refresh, immutable history rendering and unchanged VWC/workflows passed.');

