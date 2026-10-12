import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="rc-root"></div><input id="vin">',{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};
const evaluate=file=>w.eval(fs.readFileSync('app/src/main/assets/'+file,'utf8'));
w.me={id:'QA-MGR',role:'Manager'};
w.zukaitReception={endpoint:'qa',dashboardShell:(_title,html)=>w.document.getElementById('rc-root').innerHTML='<div id="rc-error"></div>'+html};
let writes=0,lost=true,requests=[],chosen,viewed;
const row={job_card:'JC100',date:'2026-10-10',vehicle:'<img src=x onerror=alert(1)>',claim:'C1',insurance_company:'A',lpo_amount:null,lpo_received_date:'',lpo_revision:0,lpo_history:[]};
w.zukaitReception.action=async body=>{requests.push(structuredClone(body));if(body.action==='reception_dashboard')return {ok:true,rows:[{rc_no:'RC100',vehicle:'Toyota Camry 2022',insurance_company:'A'}],total:1};if(body.action==='insurance_lpo'){writes++;if(lost){lost=false;throw Error('Lost response');}row.lpo_amount=12.345;row.lpo_received_date=body.received_date;return {ok:true,job:{no:body.job_card,insuranceLpo:{amount:12.345,receivedDate:body.received_date,history:[{request_id:body.request_id}]}}};}return {ok:true,summary:{collected_amount:0,delivered_count:0,approval_pending:1,wip_count:1},companies:['A'],company_breakdown:[],rows:[row],total:1};};
w.zukaitJobEdit={view:no=>viewed=no};w.zukaitReceptionDashboard={choose:s=>chosen=s};w.zukaitReception.openRecord=no=>viewed=no;
w.v128JobCostData=()=>({labourHours:8,labour:20,materials:3,paint:4,parts:5,total:32});
w.zukaitJobCardMaster={identity:()=>({vehicle:'Toyota Camry',year:2022,receptionLocation:'VWC'}),costs:()=>({labourHours:8,materials:3,paint:4,parts:5,total:32})};
evaluate('insurance_management.js');await w.zukaitInsuranceManagement.open();
assert.equal(w.document.querySelectorAll('.ins-summary button').length,4);assert.equal(w.document.querySelector('img'),null,'Vehicle text must be escaped');
w.document.querySelector('[data-ins=job]').click();await settle();assert.ok(w.document.querySelector('.ins-detail-grid'),'Opens the two-column Insurance detail page');assert.match(w.document.querySelector('.ins-detail-grid').textContent,/32\.000 OMR/,'Total expense uses authoritative cost');assert.match(w.document.querySelector('.ins-detail-head').textContent,/Toyota Camry 2022/,'Uses authoritative vehicle year');assert.match(w.document.querySelector('.ins-detail-grid').textContent,/VWC/,'Uses authoritative reception location');assert.equal(w.document.querySelector('img'),null);await w.zukaitInsuranceManagement.open();
w.document.querySelector('[data-section=approval]').click();await settle();assert.ok(w.document.querySelector('[data-ins=checklist]'),'Approval Pending has a compact checklist row');w.document.querySelector('[data-ins=checklist]').click();await settle();assert.equal(viewed,'RC100');await w.zukaitInsuranceManagement.open();
w.document.querySelector('[data-section=pending]').click();await settle();w.document.querySelector('[data-ins=job]').click();await settle();assert.ok(w.document.querySelector('[data-ins=lpo]'),'LPO entry belongs to Pending details');w.document.querySelector('[data-ins=lpo]').click();await settle();
const form=w.document.querySelector('#ins-lpo');form.elements.amount.value='12.345';form.elements.date.value='2026-10-10';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
const pending=w.localStorage.getItem('zukait_insurance_lpo_pending:qa:QA-MGR');assert.ok(pending);assert.equal(writes,1);
await w.zukaitInsuranceManagement.open();w.document.querySelector('[data-section=pending]').click();await settle();w.document.querySelector('[data-ins=job]').click();await settle();w.document.querySelector('[data-ins=lpo]').click();await settle();assert.ok(w.document.querySelector('[data-ins=retry]'));
w.document.querySelector('[data-ins=retry]').click();await settle();assert.equal(writes,2);assert.deepEqual(requests.filter(r=>r.action==='insurance_lpo')[0],requests.filter(r=>r.action==='insurance_lpo')[1]);assert.equal(w.localStorage.getItem('zukait_insurance_lpo_pending:qa:QA-MGR'),null);
w.me.role='Receptionist';const reads=requests.length;await w.zukaitInsuranceManagement.open();assert.equal(requests.length,reads,'Receptionist cannot open financial dashboard');
// Native capture uses text recognition and retains ambiguous characters.
evaluateSourceVin();
function evaluateSourceVin(){w.eval(fs.readFileSync('app/src/main/assets/reception_vin.js','utf8').replace('document.currentScript.src',"'https://qa.invalid/reception_vin.js'"));}
const vin=w.document.querySelector('#vin'),alerts=[];w.alert=s=>alerts.push(s);let capture=0;
w.prompt=(_message,value)=>value;const original=()=>{};w.zukaitVinScan={nativeResult:original};w.AndroidBridge={captureVinPhoto:()=>capture++};
await w.zukaitReceptionVin.open(vin);assert.equal(capture,1);w.zukaitVinScan.nativeResult('VIN: 1HGCM82633A004352');assert.equal(vin.value,'1HGCM82633A004352');assert.equal(w.zukaitVinScan.nativeResult,original);
await w.zukaitReceptionVin.open(vin);w.zukaitVinScan.nativeResult('VIN: 1HGCM82633AOO4352');assert.equal(vin.value,'1HGCM82633AOO4352');assert.ok(alerts.length,'Questionable OCR letters must remain visible for correction');
w.prompt=()=>null;await w.zukaitReceptionVin.open(vin);w.zukaitVinScan.nativeResult('1HGCM82633A004352');assert.equal(vin.value,'1HGCM82633AOO4352','Cancelling confirmation preserves manual text');
assert.equal(w.zukaitReceptionVin.valid('1HGCM82633AOO4352'),false);
// Restricted estimator refuses to replay a saved mutation without confirmation.
evaluate('reception_estimate.js');w.localStorage.setItem('zukait_reception_estimate_pending:qa:QA-MGR',JSON.stringify({operation:'SAVE',request_id:'saved'}));w.confirm=()=>false;
await assert.rejects(w.zukaitReceptionEstimate.prepare('RC100'),/Confirm the saved Estimate/);
dom.window.close();console.log('PASS: LPO role/privacy DOM, escaped fields, durable exact retry, clickable summaries/details, VIN text verification and explicit estimate recovery');
