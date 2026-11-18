// Mechanical Estimate -> reviewed Cash Job Card, UI-only synthetic regression.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountMechanicalSection} from '../app/src/main/assets/mechanical_sections.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const page=new JSDOM('<main><iframe id="estimate" src="https://qa.invalid/mechanical_estimate.html"></iframe><div id="job"></div></main>',{url:'https://qa.invalid/mechanical_supervisor.html',pretendToBeVisual:true,runScripts:'outside-only'});
const outer=page.window,child=outer.document.getElementById('estimate').contentWindow;
child.document.open();child.document.write('<!doctype html><html><head></head><body><p id="estimate-notice"></p><div id="modal"><div class="modal-box"></div></div></body></html>');child.document.close();
child.me={id:'SUP003',role:'Mechanical Supervisor'};
child.state={jobs:[],estimateAudit:[],estimates:[{
 id:'estimate-1',estimateNo:'Zi-Qt0081',date:'2026-11-17',type:'PL',vatEnabled:true,
 customerName:'Test Customer',mobile:'91234567',makeModel:'Toyota Corolla',year:'2020',
 registration:'32621-M',vin:'JTDBR32E720000001',jobCard:'',labourRows:[
  {id:'L1',description:'Replace brake pads',amount:20},{id:'L2',description:'Road test',amount:10}
 ],partRows:[{id:'P1',description:'Brake pad set',qty:1,unitPrice:25}],
 lsRows:[{id:'S1',description:'Legacy repair scope',amount:500}],misc:0,
 lsSpareParts:0,createdBy:'SUP003',revision:2,status:'Saved'
}]};
child.openModal=html=>{child.document.querySelector('.modal-box').innerHTML=html;};
child.closeModal=()=>{};
child.alert=message=>{child.lastAlert=message;};
let saved=null,saveCount=0;
child.zukaitMechanicalEstimate={active:()=>true,save:async(estimate,revision)=>{
 saveCount++;assert.equal(revision,2);saved=structuredClone(estimate);return {...estimate,revision:3,status:'Saved'};
}};
child.zukaitReception={call:async()=>({companies:[]})};
child.eval(fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8'));
child.zukaitEstimate.openEditor('estimate-1');
await new Promise(resolve=>setTimeout(resolve,35));
assert.equal(child.document.querySelector('#estLsSection').classList.contains('hidden'),true,'Mechanical PL hides redundant repair scope');
assert.equal(child.document.querySelector('#estTypeLS').hasAttribute('hidden'),false,'Mechanical Lumpsum remains available');
child.zukaitEstimate.setType('LS');
assert.equal(child.document.querySelector('#estPlSection').hidden,true,'LS hides the separate Parts + Labour section');
assert.equal(child.document.querySelector('#estLsSection').hidden,false);
const lsCount=child.document.querySelectorAll('[data-est-ls-row]').length;
child.document.querySelector('#estLsRows .est-desc').value='';
child.zukaitEstimate.addRow('LS');
assert.equal(child.document.querySelectorAll('[data-est-ls-row]').length,lsCount+1,'Add repair works without description (JSDOM calls handler directly)');
child.zukaitEstimate.setType('PL');
assert.equal(child.document.querySelector('#estLsSection').hidden,true,'PL hides duplicate Repair Scope');
assert.equal(child.document.querySelector('#estPayINSURANCE'),null,'Cash-only Mechanical Estimate has no insurance choice');
assert.match(child.document.querySelector('.est-cash-only').textContent,/Cash/);
assert.equal(child.document.querySelector('.est-open-jc'),null,'Create Job Card must not appear in estimate editor');
for(const id of ['estName','estMakeModel','estReg'])assert.ok(child.document.getElementById(id).required,id+' must be required');
assert.equal(child.document.querySelectorAll('.est-required-star').length,3);
const n0=child.document.querySelectorAll('[data-est-lab-row]').length;
child.zukaitEstimate.addRow('LAB');
assert.equal(child.document.querySelectorAll('[data-est-lab-row]').length,n0+1,'Add Labour works even with empty description');
const p0=child.document.querySelectorAll('[data-est-part-row]').length;
child.zukaitEstimate.addRow('PART');
assert.equal(child.document.querySelectorAll('[data-est-part-row]').length,p0+1,'Add Part works even with empty description');
child.document.querySelector('#estName').value='';
await child.zukaitEstimate.saveCurrent('estimate-1');
assert.match(child.lastAlert,/Customer name is required/);
assert.equal(saveCount,0,'invalid quote must not reach server');
child.document.querySelector('#estName').value='Test Customer';
assert.equal(child.document.querySelector('#estPartRows .est-desc').value,'Brake pad set');
await child.zukaitEstimate.openFind();
assert.ok(child.document.querySelector('.est-saved-create-jc'),'Saved list must have the Create Job Card action');
assert.equal(child.document.querySelectorAll('.est-saved-create-jc').length,1);
let prefill=null;
outer.postMessage=(data,targetOrigin)=>{assert.equal(targetOrigin,outer.location.origin,'handoff remains same-origin');prefill=data.mechanicalEstimateCreateJob;};
await child.zukaitEstimate.createMechanicalJob('estimate-1');
await tick();
assert.equal(saveCount,0,'Saved Estimates handoff must not silently re-save the quote');
assert.equal(saved,null);
assert.ok(prefill,'saved-list action delivered the prefill to the parent');
assert.equal(prefill.job_type,'CASH');
assert.equal(prefill.make,'Toyota');assert.equal(prefill.model,'Corolla');
assert.equal(prefill.customer,'Test Customer');assert.equal(prefill.contact,'91234567');
assert.equal(prefill.registration,'32621-M');
assert.match(prefill.reason,/Replace brake pads\nRoad test/);
assert.doesNotMatch(prefill.reason,/Brake pad set|Legacy repair scope|25\.000/,'parts and unused repair scope are not work descriptions');

const session={id:'SUP003',role:'Mechanical Supervisor',key:'qa'},calls=[];
const section=await mountMechanicalSection(outer.document.getElementById('job'),{
 section:'create-job',estimatePrefill:prefill,getSession:()=>session,isEnabled:()=>true,
 online:()=>true,storage:outer.localStorage,uuid:()=> '4a98b2ad-1c1c-4fca-ab55-a9b341cc1222',
 api:async body=>{
  calls.push(structuredClone(body));
  if(body.command.operation==='READ')return {ok:true,jobs:[],customers:[]};
  return {ok:true,request_id:body.command.request_id,job_card:body.command.command.job_card};
 }
});
const form=outer.document.querySelector('#job form');
assert.ok(form,'reused existing form for Mechanical job');
for(const [name,value] of Object.entries({make:'Toyota',model:'Corolla',registration:'32621-M',customer:'Test Customer',contact:'91234567'}))
 assert.equal(form.elements[name].value,value,'prefilled '+name);
assert.equal(form.elements.job_type.value,'CASH');
assert.equal(form.elements.job_card.value,'','never invents a Job Card number');
assert.match(form.elements.reason.value,/Replace brake pads\nRoad test/);
assert.match(form.elements.remarks.value,/Zi-Qt0081/);
assert.equal(form.elements.cash_amount.value,'','estimate amount must not become collected cash');
assert.equal(calls.filter(c=>c.command.operation!=='READ').length,0,'opening JC cannot mutate data');
form.elements.job_card.value='MJC99901';
form.elements.received_confirmed.checked=true;
form.dispatchEvent(new outer.Event('submit',{bubbles:true,cancelable:true}));
assert.match(outer.document.querySelector('#job').textContent,/Review Job Card/);
const confirm=[...outer.document.querySelectorAll('#job button')].find(b=>b.textContent==='Confirm and create');
assert.ok(confirm);
confirm.click();await tick();await tick();
const command=calls.find(c=>c.command.operation==='CREATE_JOB');
assert.ok(command,'uses existing audited Mechanical Job Card command');
assert.equal(command.command.command.job_type,'CASH');
assert.equal(command.command.command.details.registration,'32621-M');
assert.equal(command.command.command.details.customer,'Test Customer');
assert.match(command.command.command.reason,/Replace brake pads/);
assert.doesNotMatch(JSON.stringify(command),/Brake pad set/);
section.destroy();page.window.close();
console.log('PASS Mechanical saved-estimate-only Job Card prefill, LS/PL toggles, required indicators, +Add blank rows, no parts posting, confirmation required');
