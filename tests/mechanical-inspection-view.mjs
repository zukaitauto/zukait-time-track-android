// Browser-DOM regression for the V377 full-screen Mechanical inspection view.
// Test data and DOM are disposable; no production endpoints are contacted.
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountMechanicalInspection} from '../app/src/main/assets/mechanical_inspection_view.js';

const checklistId='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
const makeDom=()=>{
 const dom=new JSDOM('<main id="root"></main>',{url:'https://test.invalid/mechanical_supervisor.html'});
 Object.defineProperty(dom.window.crypto,'randomUUID',{value:()=>requestId,configurable:true});
 dom.window.print=()=>{dom.printed=(dom.printed||0)+1;};
 dom.window.confirm=()=>true;
 return dom;
};
function field(root,label){
 const wrap=[...root.querySelectorAll('label.mi-field')].find(el=>el.querySelector('span')?.textContent===label);
 assert.ok(wrap,'missing field '+label);
 return wrap.querySelector('input,textarea,select');
}
function fill(root,win,label,value){
 const el=field(root,label);
 el.value=value;
 el.dispatchEvent(new win.Event('input',{bubbles:true}));
}
function choose(root,win,label,value){
 const el=field(root,label);
 el.value=value;
 el.dispatchEvent(new win.Event('change',{bubbles:true}));
}
function click(root,title){
 const b=[...root.querySelectorAll('button')].find(x=>x.textContent.trim()===title);
 assert.ok(b,'missing button '+title);b.click();
}
function validVehicle(root,win){
 for(const [label,value] of [
  ['Registration number','1234 AB'],['Make','Toyota'],['Model','Camry'],
  ['Year','2022'],['Customer / company','Example Customer'],
  ['Contact number','90000000']
 ]) fill(root,win,label,value);
 fill(root,win,'Detailed repair instructions','Inspect and repair selected panels.');
}
function submit(root,win){
 const form=root.querySelector('form');
 assert.ok(form,'inspection form must exist');
 assert.equal(form.reportValidity(),true,'form should accept complete data');
 form.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
}

let stored=null,revision=0,saveCalls=0;
const api=async ({action,command})=>{
 assert.equal(action,'mechanical_inspection');
 assert.equal(command.checklistId,checklistId);
 if(command.operation==='READ_INSPECTION')return {ok:true,inspection:stored};
 if(command.operation==='SAVE_INSPECTION'){
  saveCalls++;
  assert.equal(command.inspection.jobType,'CREDIT');
  assert.equal(command.inspection.damageMarks[0].mark,'S');
  assert.equal(command.inspection.functions.lights.status,'ISSUE');
  assert.equal(command.inspection.functions.lights.note,'Checked');
  assert.equal(command.inspection.vehicle.year,'2022');
  assert.equal(command.expectedRevision,revision);
  revision++;
  stored={checklistId,revision,inspection:command.inspection};
  return {ok:true,result:{revision,replayed:false}};
 }
 throw Error('unexpected command');
};
const dom=makeDom(),root=dom.window.document.querySelector('#root');
const options={checklistId,jobCard:'MJC001',api,online:()=>true,
 isEnabled:()=>true,getSession:()=>({id:'SUP003',role:'Mechanical Supervisor'})};
const mounted=await mountMechanicalInspection(root,options);
assert.equal(field(root,'Job type').querySelectorAll('option').length,2,'only Cash/Credit');
assert.match(root.textContent,/Work Description \/ Notes/);
assert.ok(root.querySelector('img.mi-vehicle-image')?.src.includes('vehicle-inspection-approved.png'),
 'must use approved reception inspection illustration');
choose(root,dom.window,'Job type','CREDIT');
validVehicle(root,dom.window);
choose(root,dom.window,'Mark type','S');
click(root,'Front Bumper');
assert.match(root.textContent,/Front Bumper · S/);
choose(root,dom.window,'Lights status','ISSUE');
fill(root,dom.window,'Issue note','Checked');
submit(root,dom.window);
await nextTurn();
assert.equal(saveCalls,1);
assert.equal(revision,1);
assert.match(root.textContent,/Saved and confirmed by the server \(revision 1\)/);
click(root,'Print checklist');
assert.equal(dom.printed,1,'confirmed inspection must print');
mounted.destroy();
const reopened=await mountMechanicalInspection(root,options);
assert.equal(field(root,'Year').value,'2022');
assert.equal(field(root,'Job type').value,'CREDIT');
assert.match(root.textContent,/Revision 1/);
reopened.destroy();

// A definite optimistic-revision rejection must not trap the user in
// infinite retry mode. Unknown network outcomes MUST retain the same request ID.
const errorDom=makeDom(),errorRoot=errorDom.window.document.querySelector('#root');
let fail='network',attempts=[];
const errorApi=async ({command})=>{
 if(command.operation==='READ_INSPECTION')return {ok:true,inspection:null};
 attempts.push(command.requestId);
 if(fail==='network'){fail='conflict';throw Error('network timeout');}
 if(fail==='conflict')throw Error('inspection_revision_conflict');
 return {ok:true,result:{revision:1,replayed:false}};
};
const errorView=await mountMechanicalInspection(errorRoot,{...options,api:errorApi});
validVehicle(errorRoot,errorDom.window);
submit(errorRoot,errorDom.window);
await nextTurn();
assert.match(errorRoot.textContent,/Unconfirmed request/);
assert.ok([...errorRoot.querySelectorAll('input')].every(input=>input.disabled),
 'uncertain write must freeze editing');
click(errorRoot,'Retry same save');
await nextTurn();
assert.deepEqual(attempts,[requestId,requestId],'retry must reuse original request ID');
assert.doesNotMatch(errorRoot.textContent,/Unconfirmed request/);
assert.match(errorRoot.textContent,/Reload to review the current checklist/);
errorView.destroy();
console.log('PASS V377 Mechanical inspection DOM: Cash/Credit, edit, image, notes, save/reopen, print, safe retry, definite conflict');
