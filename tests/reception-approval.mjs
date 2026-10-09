import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};
function setup(){const dom=new JSDOM('<div id="modal"></div>',{url:'https://test.invalid',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.me={id:'QA-MANAGER',role:'Manager'};w.openModal=h=>w.document.getElementById('modal').innerHTML=h;w.closeModal=()=>{};w.alert=()=>{};return {dom,w}}
{
 const {dom,w}=setup();w.state={jobs:[],assignments:[],sessions:[],estimates:[],estimateAudit:[]};let saves=0,fail=true;const keys=[];
 let rc={rc_no:'RC0001',insurance_company:'Liva Insurance',details:{make:'Toyota',model:'Camry',customer:'QA Customer',contact:'90000000',registration:'QA-1',year:'2020',vin:'QA-VIN',claim:'QA-CLAIM'}};
 w.zukaitReception={call:async()=>({record:rc})};w.save=()=>saves++;
 w.zukaitCloud={allocateEstimateNo:async key=>{keys.push(key);if(fail){fail=false;throw Error('lost allocation response')}return {estimate_no:'Zi-Qt001',sequence_no:1}}};
 w.eval(fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8'));
 await w.zukaitEstimate.newFromReception(rc.rc_no);assert.equal(w.state.estimates.length,0);
 w.eval(fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8')); // Fresh module memory; device storage survives restart.
 const id=await w.zukaitEstimate.newFromReception(rc.rc_no);await new Promise(r=>setTimeout(r,25));assert.equal(keys[0],keys[1],'retry allocation key');assert.equal(id,keys[0]);
 const e=w.state.estimates[0];assert.equal(e.receptionNo,rc.rc_no);assert.equal(e.makeModel,'Toyota Camry');assert.equal(e.insuranceCompany,'Liva Insurance');assert.equal(e.vin,'QA-VIN');assert.equal(e.jobCard,'');assert.equal(saves,1);
 assert.equal(w.localStorage.length,0,'confirmed draft clears allocation retry');
 const retryKey='zukait_reception_estimate_request_v1:'+JSON.stringify([w.me.id,w.location.origin,rc.rc_no,'']);
 w.localStorage.setItem(retryKey,id);w.eval(fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8'));
 await w.zukaitEstimate.newFromReception(rc.rc_no);assert.equal(keys.length,2,'saved draft recovery must not allocate again');assert.equal(w.state.estimates.length,1);assert.equal(saves,1);assert.equal(w.localStorage.length,0);
 for(const name of ['estName','estMobile','estMakeModel','estYear','estReg','estVin','estClaim','estJobCard'])assert.equal(w.document.getElementById(name).readOnly,true);
 assert.ok([...w.document.querySelectorAll('button[onclick*="zukaitVinScan"]')].every(b=>b.disabled));
 w.document.getElementById('estJobCard').value='FAKE-JC';w.zukaitEstimate.loadJob();assert.equal(w.state.jobs.length,0);assert.equal(w.state.sessions.length,0);assert.equal(w.state.assignments.length,0);
 rc={...rc,outcome:'CANCELLED'};await w.zukaitEstimate.newFromReception(rc.rc_no);assert.equal(keys.length,2,'closed case must not allocate');
 w.me=null;await settle();dom.window.close();
}
{
 const {dom,w}=setup();w.zukaitAuth={getToken:()=> 'qa'};
 const partId='a0000000-0000-4000-8000-000000000001',quoteId='b0000000-0000-4000-8000-000000000001';
 let record={rc_no:'RC0001',revision:1,location:'VWC',approval_status:'WAITING',details:{make:'Toyota',model:'Camry'},insurance_company:'Liva Insurance',can_edit:true},canPrepare=true,valid=false,quotes=[],approvals=[],fail=false;
 const commands=[],requests=new Map();
 w.fetch=async(_url,args)=>{const c=JSON.parse(args.body).command;commands.push(c);let result={ok:true};
  if(c.operation==='CAPABILITIES')result={ok:true,allowed:true,manager:true};
  if(c.operation==='LIST')result={ok:true,rows:[{...record,sequence_no:1}]};
  if(c.operation==='GET')result={ok:true,record,movements:[],audit:[],preliminary_parts:{items:[{id:partId,name:'<script>Bumper</script>',part_no:'B1',qty:2}],can_edit:canPrepare},insurance:{can_prepare:canPrepare,can_revoke:canPrepare,approval_valid:valid,estimates:quotes,approvals}};
  if(['LINK_ESTIMATE','RECORD_APPROVAL','REVOKE_APPROVAL'].includes(c.operation)){
   if(requests.has(c.request_id))result=requests.get(c.request_id);
   else{
    record={...record,revision:record.revision+1};
    if(c.operation==='LINK_ESTIMATE')quotes=[{id:quoteId,estimate_no:'Zi-Qt001',linked_at:'2026-10-09T08:00:00Z'}];
    if(c.operation==='RECORD_APPROVAL'){record.approval_status='APPROVED';valid=true;approvals=[{reference:c.reference,approved_amount:c.approved_amount,approval_date:c.approval_date,actor_id:'QA-MANAGER',reason:c.reason,approved_parts:[{name:'<script>Bumper</script>',qty:c.approved_parts[0].qty}]}]}
    if(c.operation==='REVOKE_APPROVAL'){record.approval_status='WAITING';valid=false}
    result={ok:true,record};requests.set(c.request_id,result);
   }
   if(fail){fail=false;throw Error('Approval response lost')}
  }
  return {ok:true,json:async()=>structuredClone(result)};
 };
 w.eval(fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8'));
 const click=async action=>{w.document.querySelector(`[data-rc-action="${action}"]`).click();await settle()};
 const set=(form,name,value)=>w.document.querySelector(`#${form} [name="${name}"]`).value=value;
 const submit=async form=>{w.document.getElementById(form).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle()};
 await w.zukaitReception.open();await click('view');await click('insurance');
 set('rc-link-estimate','estimate_no','Zi-Qt001');set('rc-link-estimate','reason','Submission');await submit('rc-link-estimate');
 assert.equal(record.approval_status,'WAITING');assert.equal(record.location,'VWC');
 set('rc-approval','reference','APP-1');set('rc-approval','approved_amount','120.555');set('rc-approval','reason','Surveyor approval');
 const check=w.document.querySelector('[name="approve_part"]'),qty=w.document.querySelector('[data-approved-id]');assert.equal(check.checked,false);assert.equal(qty.disabled,true);check.checked=true;check.dispatchEvent(new w.Event('change'));qty.value='1';
 fail=true;await submit('rc-approval');assert.match(w.document.getElementById('rc-error').textContent,/Approval response lost/);await submit('rc-approval');
 const calls=commands.filter(c=>c.operation==='RECORD_APPROVAL');assert.equal(calls[0].request_id,calls[1].request_id);assert.equal(calls[0].approved_amount,'120.555');assert.deepEqual(calls[0].approved_parts,[{id:partId,qty:1}]);assert.equal(approvals.length,1);assert.equal(record.revision,3);assert.equal(record.location,'VWC');assert.equal(record.job_card,undefined);assert.match(w.document.getElementById('rc-root').textContent,/OMR 120.555/);assert.equal(w.document.querySelectorAll('#rc-root script').length,0);
 set('rc-revoke','reason','Manager review');await submit('rc-revoke');assert.equal(record.approval_status,'WAITING');assert.equal(approvals.length,1);assert.equal(record.location,'VWC');
 canPrepare=false;record.approval_status='APPROVED';valid=false;await click('home');await click('view');await click('insurance');assert.equal(w.document.querySelectorAll('#rc-root form').length,0);assert.match(w.document.getElementById('rc-root').textContent,/Approval needs review/);
 assert.ok(commands.every(c=>['CAPABILITIES','LIST','GET','LINK_ESTIMATE','RECORD_APPROVAL','REVOKE_APPROVAL'].includes(c.operation)));
 w.me=null;await settle();dom.window.close();
}
console.log('RC estimates/approval UI: server-prefill, read-only identity, stable allocation/retry IDs, selected quantities, OMR precision, history, source-review warning, read-only access and no JC/parts allocation passed.');

