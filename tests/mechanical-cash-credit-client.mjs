// V377 Mechanical Cash/Credit guard: API mapping and safe UI rejection recovery.
// Synthetic JSDOM only. No credentials, network requests, or production data.
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mechanicalApiError} from '../supabase/functions/workshop-api/extensions/mechanical_route.js';
import {mountMechanicalWorkspace} from '../app/src/main/assets/mechanical_workspace.js';

assert.deepEqual(mechanicalApiError({message:'mechanical_job_type_not_allowed'}),{
  status:400,body:{ok:false,code:'mechanical_job_type_not_allowed'}
},'non-Cash/Credit server rejection must reach the client as an actionable 400');
assert.deepEqual(mechanicalApiError({message:'arbitrary_untrusted_sql_error'}),{
  status:503,body:{ok:false,code:'mechanical_unavailable'}
},'unknown SQL errors must remain private');

const dom=new JSDOM('<div id="root"></div>',{url:'https://qa.example.invalid'});
const root=dom.window.document.querySelector('#root');
const pending=new Map();
const calls=[];
let id=0,deny=true;
const model={ok:true,recordsRevision:4,workshopRevision:8,capabilities:['MC_CREATE'],
  departmentConfigured:true,checklists:[],nextAfter:null,detail:null,mechanics:[]};
const controller=await mountMechanicalWorkspace(root,{
  enabled:true,deviceId:'QA_SYNTHETIC_DEVICE',uuid:()=> '77777777-7777-4777-8777-'+String(++id).padStart(12,'0'),
  getSession:()=>({id:'SUP003',role:'Mechanical Supervisor',key:'SYNTHETIC_NO_ACCESS'}),
  storage:{getItem:k=>pending.get(k)??null,setItem:(k,v)=>pending.set(k,v),removeItem:k=>pending.delete(k)},
  online:()=>true,
  api:async body=>{
    if(body.action==='mechanical_dashboard')return {...model};
    assert.equal(body.action,'mechanical_command');
    assert.equal(body.command.operation,'MC_CREATE');
    calls.push(structuredClone(body.command));
    if(deny)throw Error('mechanical_job_type_not_allowed');
    return {ok:true,result:{entityId:body.command.entityId,recordsRevision:5,workshopRevision:8}};
  }
});
const settle=async()=>{await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));};
const form=()=>root.querySelector('form[data-operation="MC_CREATE"]');
let f=form();assert.ok(f,'the Mechanical checklist form must be available');
f.querySelector('[name="job"]').value='QA-INSURANCE-JC';
f.querySelector('[name="date"]').value='2026-10-31';
f.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
await settle();
assert.equal(calls.length,1);
assert.match(root.textContent,/Cash or Credit Job Card/i,'show actionable Cash/Credit message');
assert.ok(pending.has('zukait_mechanical_pending_v1:SUP003'),'rejected request remains reviewable');
const edit=[...root.querySelectorAll('button')].find(b=>b.textContent==='Edit rejected change');
const dismiss=[...root.querySelectorAll('button')].find(b=>b.textContent==='Dismiss rejected change');
assert.ok(edit&&dismiss,'allow users to safely edit or dismiss a rejected registration');
assert.equal(calls.length,1,'never automatically retry rejected request');
edit.click();await settle();
f=form();assert.ok(f);
assert.equal(f.querySelector('[name="job"]').value,'QA-INSURANCE-JC','edit preserves original draft');
deny=false;
f.querySelector('[name="job"]').value='QA-CASH-JC';
f.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
await settle();
assert.equal(calls.length,2,'exactly one corrected submission');
assert.equal(calls[1].payload.manualJobCard.number,'QA-CASH-JC');
assert.notEqual(calls[0].requestId,calls[1].requestId,'corrected request uses a fresh request ID');
assert.equal(pending.has('zukait_mechanical_pending_v1:SUP003'),false,'successful correction clears rejected journal');
controller.destroy();dom.window.close();
console.log('PASS Mechanical Cash/Credit API 400, clear rejection, safe edit and new request ID');
