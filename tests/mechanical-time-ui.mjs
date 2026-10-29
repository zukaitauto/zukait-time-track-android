import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {mountMechanicalTimeManagement} from '../app/src/main/assets/mechanical_time_management.js';
import {mountMechanicalWorkspace} from '../app/src/main/assets/mechanical_workspace.js';
const tick=()=>new Promise(r=>setImmediate(r));
for(const role of ['Manager','Mechanical Supervisor']){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://qa.invalid'}),w=dom.window,root=w.document.getElementById('root');let who={id:role==='Manager'?'MGR':'SUP003',role,key:'synthetic'},online=true,sequence=0;
 const calls=[],job={no:'M1',reg:'MECHANICAL-ONLY'},a={id:'A',job:'M1',emp:'E',suggested:60,allocationToken:'original-allocation'};
 const api=async body=>{calls.push(structuredClone(body));if(body.action==='mechanical_time_management')return body.operation==='READ'?{ok:true,jobs:[job],users:[{id:'E',name:'Mechanic',role:'Employee'}],assign:body.jobCard?[a]:[],sessions:[],audit:[],employeeTokens:{E:'opaque-server-token'},taskOptions:[{id:'T',title:'Inspection'}],recordsRevision:2,server_revision:3}:{ok:true,audit:{id:body.command.requestId}};return {ok:true,result:{requestId:body.command.requestId}};};
 let opens=0;let controller=await mountMechanicalWorkspace(root,{enabled:true,storage:w.localStorage,deviceId:'DEVICE',getSession:()=>who,api:async()=>({ok:true,checklists:[],mechanics:[],capabilities:[]}),openTimeManagement:()=>{opens++;}});
 assert.equal(root.querySelectorAll('[data-mc-card]').length,12);root.querySelector('[data-mc-card="time-management"]').click();await tick();assert.equal(opens,1);controller.destroy();
 controller=await mountMechanicalTimeManagement(root,{isEnabled:()=>true,getSession:()=>who,online:()=>online,storage:w.localStorage,uuid:()=>`12345678-1234-4123-8123-${String(++sequence).padStart(12,'0')}`,api});
 assert.equal(calls.length,1);assert.equal(calls[0].operation,'READ');assert.match(root.textContent,/JC M1/);assert.equal(root.textContent.includes('Bodyshop'),false);
 [...root.querySelectorAll('button')].find(b=>b.textContent.startsWith('JC M1')).click();await tick();assert.equal(calls.at(-1).jobCard,'M1');
 const assign=[...root.querySelectorAll('form')].find(f=>f.textContent.includes('Assign Mechanical technician'));assign.elements.task.value='T';assign.elements.employee.value='E';assign.elements.minutes.value='45';assign.elements.reason.value='Audited technician assignment';assign.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(calls.filter(c=>c.action==='mechanical_command').length,0,'Review never writes');
 [...root.querySelectorAll('button')].find(b=>b.textContent==='Confirm and record').click();await tick();
 const saved=calls.find(c=>c.action==='mechanical_command');assert.equal(saved.command.operation,'TASK_ASSIGN');assert.equal(saved.command.payload.reason,'Audited technician assignment');assert.equal(saved.command.expectedRevision,2);assert.equal(saved.command.expectedWorkshopRevision,3);
 assert.equal(w.localStorage.getItem('zukait_mechanical_time_pending_v1:'+who.id),null);
 [...root.querySelectorAll('button')].find(b=>b.textContent==='Review time / corrections').click();
 const correction=[...root.querySelectorAll('form')].find(f=>f.elements.operation);correction.elements.operation.value='SET_ALLOCATION';correction.elements.operation.dispatchEvent(new w.Event('change'));correction.elements.minutes.value='80';correction.elements.reason.value='Correct allocation with record';correction.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(calls.filter(c=>c.operation==='CHANGE').length,0);[...root.querySelectorAll('button')].find(b=>b.textContent==='Confirm and record').click();await tick();assert.equal(calls.find(c=>c.operation==='CHANGE').command.expectedSessions,'opaque-server-token');
 online=false;w.dispatchEvent(new w.Event('offline'));assert.match(root.textContent,/Reconnect/);assert.equal(root.textContent.includes('MECHANICAL-ONLY'),false);
 who={id:'OTHER',role:'Employee',key:'changed'};w.dispatchEvent(new w.StorageEvent('storage',{key:'zukait_secure_session_v42'}));assert.equal(root.textContent,'');controller.destroy();dom.window.close();
}
console.log('PASS Manager/SUP003 card12 dedicated screen, Mechanical search, assignment/correction review before write, assignment reason/revisions, opaque token, offline privacy and account-switch clearing.');
