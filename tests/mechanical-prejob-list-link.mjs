// Independent Mechanical prejob list/print/approval and approved-checklist Job Card linking.
// All data and API responses are synthetic; no live production changes.
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountMechanicalPrejob} from '../app/src/main/assets/mechanical_prejob_intake.js';
import {mountMechanicalSection} from '../app/src/main/assets/mechanical_sections.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const dom=new JSDOM('<main><div id="prejob"></div><div id="job"></div></main>',{url:'https://qa.invalid/mechanical_supervisor.html',pretendToBeVisual:true});
const w=dom.window,session={id:'SUP003',role:'Mechanical Supervisor',key:'QA'};
const approved={
 id:'b75b5000-0000-4000-8000-000000000001',checklist_number:'MC-P000001',
 registration:'QA-REG',job_type:'CASH',approval_status:'APPROVED',revision:2,
 approved_at:'2026-11-04T09:00:00Z',linked_job_card:null,
 vehicle:{make:'Toyota',model:'Corolla',year:'2020',registration:'QA-REG',odometer:'12345',odometer_unit:'KM',vin:'QA-VIN',customer:'Test Customer',contact:'90000000'},
 inspection:{damageMarks:[{part:'Front Bumper',mark:'X'}],tools:['jack','spare_tyre'],fuel:'Half',
  functions:{lights:{status:'OK'},dashboardWarning:{status:'ISSUE',note:'Synthetic warning'}}},
 work_description:'Inspect brakes',approval_note:'Approved by customer',created_at:'2026-11-04T07:00:00Z'
};
const pending={...approved,id:'b75b5000-0000-4000-8000-000000000002',checklist_number:'MC-P000002',
 registration:'QA-PEND',approval_status:'PENDING',revision:1,approved_at:null,approval_note:null};
const linked={...approved,id:'b75b5000-0000-4000-8000-000000000003',checklist_number:'MC-P000003',
 registration:'QA-LINK',linked_job_card:'MJC900001'};
let items=[approved,pending,linked],selected=null;
const calls=[];
let printed;
const popup=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'https://qa.invalid'}).window;
popup.focus=()=>{};popup.print=()=>{printed=true;};w.open=()=>popup;
const pre=await mountMechanicalPrejob(w.document.getElementById('prejob'),{
 section:'checklists',getSession:()=>session,isEnabled:()=>true,
 onCreateJob:item=>{selected=item;},
 onCreateChecklist:()=>{},
 api:async body=>{
  calls.push(structuredClone(body));
  const cmd=body.command;
  if(cmd.operation==='LIST')return {ok:true,checklists:items.filter(i=>!cmd.query||i.registration.includes(cmd.query)||i.checklist_number.includes(cmd.query))};
  if(cmd.operation==='APPROVE'){
   assert.equal(cmd.id,pending.id);
   assert.equal(cmd.expected_revision,1);
   assert.equal(cmd.note,'QA customer approved');
   items=items.map(i=>i.id===pending.id?{...i,approval_status:'APPROVED',revision:2,approval_note:cmd.note,approved_at:'2026-11-04T10:00:00Z'}:i);
   return {ok:true,checklist:items.find(i=>i.id===pending.id)};
  }
  throw Error('Unexpected operation '+cmd.operation);
 }
});
await tick();await tick();
const root=w.document.getElementById('prejob');
assert.equal(root.querySelectorAll('form.mc-intake-form').length,0,'Check Lists must be a list screen, not another creation form');
assert.equal(root.querySelectorAll('.mc-list-record').length,3);
assert.equal(root.querySelectorAll('[data-operation=MC_CREATE]').length,0);
let filter=root.querySelector('select[aria-label="Mechanical checklist status filter"]');
filter.value='UNLINKED';filter.dispatchEvent(new w.Event('change'));
assert.equal(root.querySelectorAll('.mc-list-record').length,2,'Job Card not open excludes linked items');
filter=root.querySelector('select[aria-label="Mechanical checklist status filter"]');
filter.value='APPROVED';filter.dispatchEvent(new w.Event('change'));
assert.equal(root.querySelectorAll('.mc-list-record').length,2,'Approved filter includes linked and unlinked');
const open=[...root.querySelectorAll('button')].find(b=>b.textContent==='Create Job Card from approved checklist');
assert.ok(open,'Approved checklist must allow link to Job Card');open.click();
assert.equal(selected.id,approved.id);
const print=[...root.querySelectorAll('button')].find(b=>b.textContent==='Print Checklist');
assert.ok(print,'Print action must be present');print.click();
assert.match(popup.document.body.textContent,/ZUKAIT INTERNATIONAL LLC/);
assert.match(popup.document.body.textContent,/Function Check/);
assert.match(popup.document.body.textContent,/Synthetic warning/);
assert.match(popup.document.body.textContent,/Inspect brakes/);
assert.ok(popup.document.querySelector('.diagram img'),'Print must include the vehicle diagram');
assert.ok(popup.document.querySelector('.mark[data-mark="X"]'),'Print must include saved damage marks');
filter=root.querySelector('select[aria-label="Mechanical checklist status filter"]');
filter.value='PENDING';filter.dispatchEvent(new w.Event('change'));
const note=root.querySelector('textarea[aria-label="Checklist approval notes"]');
assert.ok(note,'Pending checklist requires approval notes');
note.value='QA customer approved';
[...root.querySelectorAll('button')].find(b=>b.textContent==='Customer approved').click();
await tick();await tick();
assert.ok(calls.some(c=>c.command.operation==='APPROVE'));
assert.match(root.textContent,/Checklist approved/);
pre.destroy();

const rootJob=w.document.getElementById('job'),jobCalls=[];
const job=await mountMechanicalSection(rootJob,{
 section:'create-job',prejobChecklist:approved,storage:w.localStorage,
 getSession:()=>session,isEnabled:()=>true,online:()=>true,
 uuid:()=> 'e8d9611b-e975-4e9f-85b7-000000000901',
 api:async body=>{
  jobCalls.push(structuredClone(body));
  if(body.command.operation==='READ')return {ok:true,jobs:[],customers:[],users:[],assign:[]};
  assert.equal(body.command.operation,'CREATE_LINKED_JOB','Approved checklist must use atomic linking');
  return {ok:true,request_id:body.command.request_id,job_card:body.command.command.job_card};
 }
});
const form=rootJob.querySelector('form');
assert.ok(form,'Job Card screen exists');
assert.equal(form.elements.make.value,'Toyota','Approved checklist pre-fills vehicle details');
assert.equal(form.elements.registration.value,'QA-REG');
assert.equal(form.elements.registration.readOnly,true,'Linked vehicle details must not be edited');
assert.equal(form.elements.job_type.value,'CASH');
form.elements.job_card.value='MJC900999';
form.elements.received_confirmed.checked=true;
form.elements.reason.value='Brake inspection request';
form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
assert.match(rootJob.textContent,/Review Job Card/);
const confirm=[...rootJob.querySelectorAll('button')].find(b=>b.textContent==='Confirm and create');
assert.ok(confirm);confirm.click();
await tick();await tick();
const saved=jobCalls.find(c=>c.command.operation==='CREATE_LINKED_JOB');
assert.ok(saved,'Server receives an atomic linked Job Card command');
assert.equal(saved.command.checklist_id,approved.id);
assert.equal(saved.command.expected_revision,approved.revision);
assert.equal(saved.command.command.job_type,'CASH');
assert.equal(saved.command.command.details.registration,'QA-REG');
assert.equal(saved.command.command.job_card,'MJC900999');
assert.equal(w.localStorage.getItem('zukait_mechanical_section_pending_v1:SUP003'),null,'Confirmed request clears pending journal');
job.destroy();popup.close();dom.window.close();
console.log('PASS Mechanical prejob list, filters, complete print, approval, selected checklist lock and atomic Job Card link (synthetic only).');
