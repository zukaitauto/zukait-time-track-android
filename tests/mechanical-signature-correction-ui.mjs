import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {mountMechanicalSignature} from '../app/src/main/assets/mechanical_signature_capture.js';
const id='79000000-0000-4000-8000-000000000001',signature='79000000-0000-4000-8000-000000000002',tick=()=>new Promise(r=>setImmediate(r));
async function fixture(){const dom=new JSDOM('<div id="root"></div>'),root=dom.window.document.getElementById('root');let actor={id:'SUP003',role:'Mechanical Supervisor',key:'QA'},online=true,lost=true;const calls=[];
 const controller=await mountMechanicalSignature(root,{enabled:true,checklistId:id,expectedRevision:2,expectedWorkshopRevision:4,deviceId:'QA',uuid:()=>id,getSession:()=>actor,online:()=>online,api:async b=>{
  if(b.action==='mechanical_document')return {ok:true,checklistId:id,sourceHash:'c'.repeat(64),document:{checklistNumber:'MC001',jobCard:'12079',recordsRevision:2,workshopRevision:4,rows:[]}};
  if(b.action==='mechanical_signature_status')return {ok:true,sourceHash:'c'.repeat(64),signature:{result:{requestId:signature}}};
  calls.push(structuredClone(b));if(lost){lost=false;throw Error('lost acknowledgement')}
  return {ok:true,duplicate:true,result:{requestId:b.command.requestId,checklistId:id,actorId:'SUP003',signatureId:signature,recordsRevision:3,workshopRevision:4,requiresRedraw:true}};
 }});return {root,controller,calls,offline:()=>online=false,switch:()=>actor={id:'OTHER',role:'Mechanical Supervisor',key:'NEW'}};
}
async function click(x,label){const b=[...x.root.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);b.click();await tick();await tick()}
let x=await fixture();assert.equal(x.calls.length,0);await click(x,'Correct my signature');assert.equal(x.calls.length,0);assert.match(x.root.textContent,/at least five/);
x.root.querySelector('textarea').value='Wrongly drawn signature';await click(x,'Correct my signature');assert.equal(x.calls[0].action,'mechanical_signature_correction');assert.equal(x.root.querySelector('textarea').disabled,true);
await click(x,'Retry same correction');assert.deepEqual(x.calls[0],x.calls[1]);assert.match(x.root.textContent,/original signature is retained/);assert.match(x.root.textContent,/draw your corrected signature/);assert.equal(x.root.querySelectorAll('svg').length,0);
for(const interrupt of ['offline','switch']){x=await fixture();x.root.querySelector('textarea').value='Wrongly drawn signature';x[interrupt]();await click(x,'Correct my signature');assert.equal(x.calls.length,0)}
x=await fixture();x.controller.destroy();assert.equal(x.root.textContent,'');assert.equal(x.calls.length,0);
console.log('PASS signature correction UI: reason required, original-signature identity, explicit redraw, exact lost-ack retry, offline/account/close guards, no automatic correction or ink storage.');
