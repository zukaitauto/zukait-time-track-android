import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<div id="rc-root"></div>',{url:'https://qa.invalid',runScripts:'outside-only'});
const w=dom.window,requests=[];
w.me={role:'Manager',id:'MGR001'};
w.state={jobs:[{no:'12102',make:'TOYOTA',model:'RAV 4',year:'2019',reg:'42429-D',vin:'JTMR13FV4KJ014330'}]};
Object.defineProperty(w.crypto,'randomUUID',{configurable:true,value:()=> 'f474101c-73a4-4c0b-930d-5aa5cd6feb64'});
w.prompt=()=>{throw Error('Native prompt should not be used to link existing Job Cards');};
w.confirm=()=>{throw Error('Native confirm should not be used to link existing Job Cards');};
w.alert=()=>{};
const checklist={rc_no:'RC0007',job_type:'INSURANCE',details:{make:'TOYOTA',model:'RAV 4',year:'2019',registration:'42429-D',vin:'JTMR13FV4KJ014330'},revision:3};
w.zukaitReception={
 endpoint:'https://qa.invalid',action:async req=>{
  requests.push(req);
  if(req.action==='reception_dashboard')return {ok:true,section:req.section,counts:{checklists:1},total:1,rows:[{rc_no:'RC0007',vehicle:'TOYOTA RAV 4 2019',registration:'42429-D',insurance_company:'Liva Insurance',received_date:'2026-10-15',job_type:'INSURANCE',status:'APPROVED'}]};
  if(req.action==='reception'&&req.command?.operation==='GET')return {ok:true,record:checklist};
  if(req.action==='reception'&&req.command?.operation==='LINK_EXISTING_JOB')return {ok:true};
  throw Error('Unexpected request: '+JSON.stringify(req));
 },
 dashboardShell:(_name,body)=>{w.document.querySelector('#rc-root')?.remove();const root=w.document.createElement('div');root.id='rc-root';root.innerHTML='<div id="rc-error"></div>'+body;w.document.body.appendChild(root);}
};
w.eval(fs.readFileSync('app/src/main/assets/reception_dashboard.js','utf8'));
const tick=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
await w.zukaitReceptionDashboard.open({backendAvailable:true});
await w.zukaitReceptionDashboard.choose('checklists');
await tick();
const link=w.document.querySelector('[data-rdb="link-existing"][data-rc="RC0007"]');
assert.ok(link,'Checklist list must expose Link Existing Job Card');
link.click();await tick();
let modal=w.document.querySelector('.rdb-link-overlay [role="dialog"]');
assert.ok(modal,'Link action must open modern in-app dialog');
assert.match(modal.textContent,/RC0007/);
assert.match(modal.textContent,/TOYOTA RAV 4 2019/);
assert.match(modal.textContent,/42429-D/);
assert.match(modal.textContent,/No new Job Card will be created/);
const input=w.document.querySelector('#rdb-link-jc');
input.value='12102';input.dispatchEvent(new w.Event('input',{bubbles:true}));
assert.match(w.document.querySelector('[data-link-preview]').textContent,/Vehicle details appear consistent/);
let reason=w.document.querySelector('#rdb-link-reason');
assert.ok(reason.value.length>=5);
w.document.querySelector('#rdb-link-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
await tick();
assert.equal(w.document.querySelector('.rdb-link-overlay'),null,'Dialog must close after confirmation');
const cmd=requests.find(r=>r.action==='reception'&&r.command?.operation==='LINK_EXISTING_JOB');
assert.ok(cmd,'Existing server action must be invoked');
assert.equal(cmd.command.rc_no,'RC0007');
assert.equal(cmd.command.job_card,'12102');
assert.equal(cmd.command.expected_revision,3);
assert.equal(cmd.command.confirmed,true);
assert.ok(cmd.command.reason);
assert.equal(requests.filter(r=>r.action==='reception'&&r.command?.operation==='LINK_EXISTING_JOB').length,1,'No duplicate link writes');
w.close();
console.log('PASS: modern Checklist-to-Job Card modal, matched vehicle preview, single authorized server link, no native prompt or confirm');
