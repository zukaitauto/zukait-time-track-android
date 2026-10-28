import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {mountMechanicalWorkspace} from '../app/src/main/assets/mechanical_workspace.js';
const id=n=>'76000000-0000-4000-8000-'+String(n).padStart(12,'0');let serial=100;
const session={id:'QA_SUP',role:'Supervisor',key:'QA_SESSION'};
const fixture=()=>({ok:true,recordsRevision:4,workshopRevision:10,capabilities:['MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER'],departmentConfigured:true,nextAfter:null,
 checklists:[{id:id(1),number:'MC001',jobCard:'QA_JC',manualDate:'2026-10-22'}],mechanics:[{id:'QA_A',name:'Mechanic <script>unsafe</script>'},{id:'QA_B',name:'Mechanic B'}],detail:null});
const detail={checklist:{id:id(1),number:'MC001',jobCard:'QA_JC',manualDate:'2026-10-22'},tasks:[{id:id(2),title:'Inspect <img src=x onerror=alert(1)>'}],assignments:[{id:id(3),taskId:id(2),employeeId:'QA_A',employeeName:'Mechanic A',suggestedMinutes:60,completed:false,running:false}]};
const settle=()=>new Promise(r=>setTimeout(r,0));
async function setup({enabled=true,user=session,caps,stored,apiOverride}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.invalid'}),root=dom.window.document.getElementById('root'),calls=[],storage=new Map(stored||[]),receipts=new Map();let model=fixture(),lost=false,current=user,network=true;
 if(caps)model.capabilities=caps;
 const adapter=async body=>{calls.push(structuredClone(body));if(apiOverride)return apiOverride(body);
  if(body.action==='mechanical_dashboard')return {...structuredClone(model),detail:body.checklistId?structuredClone(detail):null};
  const c=body.command;if(receipts.has(c.requestId))return {ok:true,duplicate:true,result:receipts.get(c.requestId)};
  const result={entityId:c.entityId,recordsRevision:++model.recordsRevision,workshopRevision:model.workshopRevision};receipts.set(c.requestId,result);
  if(lost){lost=false;throw Error('QA_LOST_ACK')}return {ok:true,result};
 };
 const storageApi={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const controller=await mountMechanicalWorkspace(root,{enabled,api:adapter,getSession:()=>current,online:()=>network,storage:storageApi,uuid:()=>id(serial++)});
 return {root,dom,calls,storage,storageApi,controller,loseAck:()=>{lost=true},switchUser:u=>{current=u},offline:()=>{network=false}};
}
const click=async(root,text)=>{const b=[...root.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,'Missing button '+text);b.click();await settle();return b};
let x=await setup({enabled:false});assert.equal(x.calls.length,0);assert.match(x.root.textContent,/unavailable/);
for(const role of ['Employee','Receptionist','Accountant']){x=await setup({user:{...session,role}});assert.equal(x.calls.length,0)}
x=await setup();assert.equal(x.calls.length,1);assert.equal(x.calls[0].action,'mechanical_dashboard');assert.equal(x.root.querySelectorAll('form[data-operation=MC_CREATE]').length,1);
await click(x.root,'MC001 · JC QA_JC · 2026-10-22');assert.equal(x.root.querySelectorAll('script,img').length,0,'Dynamic labels must be text only');assert.match(x.root.textContent,/Inspect <img/);
let form=x.root.querySelector('[data-operation=TASK_ASSIGN]');form.querySelector('[name=employee]').value='QA_B';form.querySelector('[name=minutes]').value='75';
x.loseAck();form.dispatchEvent(new x.dom.window.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.match(x.root.textContent,/Response not confirmed/);
const writes=()=>x.calls.filter(c=>c.action==='mechanical_command');assert.equal(writes().length,1);const original=writes()[0].command;
assert.equal(original.payload.suggestedMinutes,75);assert.ok(!('actorId' in original));assert.ok(!JSON.stringify(original).includes('QA_SESSION'));assert.ok(x.storage.has('zukait_mechanical_pending_v1:QA_SUP'));
await click(x.root,'Retry same change');assert.equal(writes().length,2);assert.deepEqual(writes()[1].command,original,'Lost-ack retry must reuse exact command/UUID');assert.equal(x.storage.has('zukait_mechanical_pending_v1:QA_SUP'),false);
// A loaded pending command is not automatically posted; a reload permits only
// an explicit same-command retry, using the durable device identifier.
const pending={owner:'QA_SUP',checklistId:id(1),command:original};const saved=[['zukait_mechanical_pending_v1:QA_SUP',JSON.stringify(pending)],['zukait_mechanical_device_v1','QA_DEVICE']];
// Dedicated host throws explicit API rejections. An inactive old card must
// not permanently block registration; uncertain transport failures stay saved.
for(const code of ['task_inactive','checklist_inactive','existing_active_jc_required'])for(const thrown of [true,false]){
 x=await setup({stored:saved,apiOverride:async b=>{if(b.action==='mechanical_dashboard')return {...fixture(),detail:b.checklistId?structuredClone(detail):null};if(thrown)throw Error(code);return {ok:false,code}}});
 await click(x.root,'Retry same change');assert.ok(x.storage.has('zukait_mechanical_pending_v1:QA_SUP'));
 assert.equal(x.root.querySelector('[data-operation=MC_CREATE] button').disabled,true);
 const sent=x.calls.filter(c=>c.action==='mechanical_command').length;await click(x.root,'Dismiss rejected change');
 assert.equal(x.storage.has('zukait_mechanical_pending_v1:QA_SUP'),false);assert.equal(x.root.querySelector('[data-operation=MC_CREATE] button').disabled,false);
 assert.equal(x.calls.filter(c=>c.action==='mechanical_command').length,sent,'Dismissing a rejected journal never writes server records');
}
for(const code of ['NETWORK','TIMEOUT','database_busy','mechanical_unavailable','invalid_session']){
 x=await setup({stored:saved,apiOverride:async b=>{if(b.action==='mechanical_dashboard')return {...fixture(),detail:structuredClone(detail)};throw Error(code)}});
 await click(x.root,'Retry same change');assert.ok(x.storage.has('zukait_mechanical_pending_v1:QA_SUP'));
 assert.ok(![...x.root.querySelectorAll('button')].some(b=>b.textContent==='Dismiss rejected change'),'Uncertain/unauthenticated result cannot be discarded');
}
x=await setup({stored:saved});assert.equal(x.calls.filter(c=>c.action==='mechanical_command').length,0);await click(x.root,'Retry same change');assert.deepEqual(x.calls.find(c=>c.action==='mechanical_command').command,original);
// A different login cannot load or submit another owner's pending request.
x=await setup({stored:saved,user:{id:'OTHER',role:'Supervisor',key:'OTHER_SESSION'}});assert.equal(x.root.textContent.includes('Pending confirmation'),false);
x=await setup({stored:[['zukait_mechanical_pending_v1:QA_SUP',JSON.stringify({...pending,owner:'OTHER'})]]});assert.equal(x.root.textContent.includes('75'),false);assert.equal(x.calls.filter(c=>c.action==='mechanical_command').length,0);
// Offline submission does not enqueue a new write or start automatic retry.
x=await setup();await click(x.root,'MC001 · JC QA_JC · 2026-10-22');x.offline();form=x.root.querySelector('[data-operation=TASK_CREATE]');form.querySelector('[name=title]').value='Offline task';form.dispatchEvent(new x.dom.window.Event('submit',{cancelable:true}));await settle();assert.equal(x.calls.filter(c=>c.action==='mechanical_command').length,0);assert.match(x.root.textContent,/Reconnect before saving/);
// Only operation capabilities expose controls; unconfirmed QC/finance/hold
// operations are absent. No interval or background request is created.
x=await setup({caps:['TASK_CREATE']});await click(x.root,'MC001 · JC QA_JC · 2026-10-22');assert.equal(x.root.querySelector('[data-operation=MC_CREATE]'),null);assert.equal(x.root.querySelector('[data-operation=TASK_ASSIGN]'),null);assert.ok(x.root.querySelector('[data-operation=TASK_CREATE]'));assert.equal(x.root.querySelector('[data-mechanical-qc]'),null);assert.equal(x.root.querySelector('[data-mc-card=qc]').dataset.restricted,'true');
// Every initial form emits the agreed API contract, without time history or
// a guessed MC number. The server remains the allocator/time authority.
for(const operation of ['MC_CREATE','TASK_CREATE','TASK_HANDOVER']){
 x=await setup();if(operation!=='MC_CREATE')await click(x.root,'MC001 · JC QA_JC · 2026-10-22');form=x.root.querySelector('[data-operation='+operation+']');
 const fill=(name,value)=>{form.querySelector('[name='+name+']').value=value};
 if(operation==='MC_CREATE'){fill('job',' QA_NEW_JC ');fill('date','2026-10-20')}
 if(operation==='TASK_CREATE')fill('title',' Inspect brakes ');
 if(operation==='TASK_HANDOVER'){fill('source',id(3));fill('target','QA_B');fill('minutes','30');fill('reason',' Shift handover ')}
 form.dispatchEvent(new x.dom.window.Event('submit',{cancelable:true}));await settle();const c=x.calls.find(c=>c.action==='mechanical_command').command;assert.equal(c.operation,operation);assert.equal(c.expectedRevision,4);assert.equal(c.expectedWorkshopRevision,10);
 if(operation==='MC_CREATE'){assert.deepEqual(c.payload,{manualJobCard:{number:'QA_NEW_JC',date:'2026-10-20'}});assert.equal('number' in c,false)}
 if(operation==='TASK_CREATE')assert.deepEqual(c.payload,{checklistId:id(1),title:'Inspect brakes'});
 if(operation==='TASK_HANDOVER'){assert.equal(c.payload.sourceAssignmentId,id(3));assert.notEqual(c.payload.successorAssignmentId,id(3));assert.equal(c.payload.reason,'Shift handover');assert.equal('expectedEmployeeSessions' in c.payload,false)}
}
x=await setup();form=x.root.querySelector('[data-operation=MC_CREATE]');form.querySelector('[name=job]').value='   ';form.querySelector('[name=date]').value='2026-10-20';form.dispatchEvent(new x.dom.window.Event('submit',{cancelable:true}));await settle();assert.equal(x.calls.filter(c=>c.action==='mechanical_command').length,0,'Whitespace is not a JC');
// Storage must succeed before a write. Rapid duplicate submission is ignored.
x=await setup();await click(x.root,'MC001 · JC QA_JC · 2026-10-22');x.storageApi.setItem=()=>{throw Error('QA disk full')};form=x.root.querySelector('[data-operation=TASK_CREATE]');form.querySelector('[name=title]').value='Safe retry required';form.dispatchEvent(new x.dom.window.Event('submit',{cancelable:true}));await settle();assert.equal(x.calls.filter(c=>c.action==='mechanical_command').length,0);
let commandResolve;const responses=[];x=await setup({apiOverride:async body=>{if(body.action==='mechanical_dashboard')return {...fixture(),detail:body.checklistId?structuredClone(detail):null};responses.push(body.command);return new Promise(r=>commandResolve=r)}});await click(x.root,'MC001 · JC QA_JC · 2026-10-22');form=x.root.querySelector('[data-operation=TASK_CREATE]');form.querySelector('[name=title]').value='One submission';form.dispatchEvent(new x.dom.window.Event('submit',{cancelable:true}));form.dispatchEvent(new x.dom.window.Event('submit',{cancelable:true}));assert.equal(responses.length,1);commandResolve({ok:true,result:{entityId:id(9)}});await settle();
// A known revision rejection needs refresh + explicit reviewed confirmation;
// the reviewed request gets a new UUID and the fresh revisions.
let revision=4;const reviewed=[];x=await setup({apiOverride:async body=>{if(body.action==='mechanical_dashboard')return {...fixture(),recordsRevision:revision,detail:body.checklistId?structuredClone(detail):null};reviewed.push(structuredClone(body.command));return {ok:false,code:'mechanical_revision_conflict'}}});await click(x.root,'MC001 · JC QA_JC · 2026-10-22');form=x.root.querySelector('[data-operation=TASK_CREATE]');form.querySelector('[name=title]').value='Review me';form.dispatchEvent(new x.dom.window.Event('submit',{cancelable:true}));await settle();revision=7;await click(x.root,'Refresh for review');await click(x.root,'Confirm reviewed change');assert.equal(reviewed.length,2);assert.notEqual(reviewed[0].requestId,reviewed[1].requestId);assert.equal(reviewed[1].expectedRevision,7);assert.deepEqual(reviewed[0].payload,reviewed[1].payload);
// An in-flight read cannot replace content after an account switch.
let resolve;x=await setup();x.controller.destroy();assert.equal(x.root.childNodes.length,0);
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.invalid'}),root=dom.window.document.getElementById('root');let who=session;
const promise=mountMechanicalWorkspace(root,{enabled:true,getSession:()=>who,api:()=>new Promise(r=>resolve=r),storage:dom.window.localStorage,uuid:()=>id(serial++)});who={...session,key:'ROTATED'};resolve(fixture());await promise;assert.match(root.textContent,/login changed/);assert.equal(root.querySelectorAll('form').length,0);
// QC is foreground-only, opaque-token bound and SUP003-only. It shares the
// same durable request/review lifecycle; an acknowledgement is not delivery.
const qcUser={id:'SUP003',role:'Supervisor',key:'QA_QC_SESSION'},qcStatus=()=>({ok:true,checklistId:id(1),workComplete:true,mechanicalPassed:false,mechanicalRequired:true,delivered:false,workToken:'a'.repeat(64),recordsRevision:8,workshopRevision:12});
let qcWrites=[],qcLost=true,qcReads=0;
const qcApi=async body=>{
 if(body.action==='mechanical_dashboard')return {...fixture(),qcAvailable:true,capabilities:['MECHANICAL_QC'],detail:body.checklistId?structuredClone(detail):null};
 if(body.action==='mechanical_qc_readiness'){qcReads++;return {ok:true,status:qcStatus()}}
 qcWrites.push(structuredClone(body.command));if(qcLost){qcLost=false;throw Error('QA_LOST_QC_ACK')}return {ok:true,duplicate:true,requiresReadinessRefresh:true};
};
x=await setup({user:qcUser,apiOverride:qcApi});await click(x.root,'MC001 · JC QA_JC · 2026-10-22');assert.equal(qcReads,0);assert.equal(x.root.querySelector('[data-operation=MECHANICAL_QC]'),null);
await click(x.root,'Check QC status');form=x.root.querySelector('[data-operation=MECHANICAL_QC]');assert.ok(form);form.querySelector('[name=result]').value='FAIL';form.dispatchEvent(new x.dom.window.Event('submit',{cancelable:true}));await settle();assert.equal(qcWrites.length,0,'Fail needs a reason before posting');
form.querySelector('[name=reason]').value=' Brake noise <script>unsafe</script> ';form.dispatchEvent(new x.dom.window.Event('submit',{cancelable:true}));await settle();assert.equal(qcWrites.length,1);assert.equal(qcWrites[0].expectedRevision,8);assert.equal(qcWrites[0].expectedWorkshopRevision,12);assert.equal(qcWrites[0].payload.expectedFingerprint,'a'.repeat(64));assert.equal(qcWrites[0].payload.reason,'Brake noise <script>unsafe</script>');assert.equal(x.root.querySelectorAll('script,img').length,0);assert.ok(!x.root.textContent.includes('a'.repeat(64)),'No digest in product copy');
await click(x.root,'Retry same change');assert.deepEqual(qcWrites[0],qcWrites[1]);assert.equal(x.storage.has('zukait_mechanical_pending_v1:SUP003'),false);assert.equal(x.root.querySelector('[data-operation=MECHANICAL_QC]'),null,'Acknowledgement requires a new QC read');
x=await setup({user:session,apiOverride:qcApi});await click(x.root,'MC001 · JC QA_JC · 2026-10-22');await click(x.root,'Check QC status');assert.equal(x.root.querySelector('[data-operation=MECHANICAL_QC]'),null,'Another Supervisor cannot approve even with a displayed capability');
let qcRevision=8,qcToken='a'.repeat(64);qcWrites=[];
x=await setup({user:qcUser,apiOverride:async body=>{
 if(body.action==='mechanical_dashboard')return {...fixture(),qcAvailable:true,capabilities:['MECHANICAL_QC'],detail:body.checklistId?structuredClone(detail):null};
 if(body.action==='mechanical_qc_readiness')return {ok:true,status:{...qcStatus(),recordsRevision:qcRevision,workToken:qcToken}};
 qcWrites.push(structuredClone(body.command));return {ok:false,code:'mechanical_qc_work_changed'};
}});
await click(x.root,'MC001 · JC QA_JC · 2026-10-22');await click(x.root,'Check QC status');form=x.root.querySelector('[data-operation=MECHANICAL_QC]');form.querySelector('[name=result]').value='PASS';form.dispatchEvent(new x.dom.window.Event('submit',{cancelable:true}));await settle();
qcRevision=9;qcToken='b'.repeat(64);await click(x.root,'Refresh for review');assert.equal(qcWrites.length,1,'Refresh must never post QC');await click(x.root,'Confirm reviewed change');assert.equal(qcWrites.length,2);assert.notEqual(qcWrites[0].requestId,qcWrites[1].requestId);assert.equal(qcWrites[1].payload.expectedFingerprint,qcToken);assert.equal(qcWrites[1].expectedRevision,9);
console.log('PASS Mechanical screens: existing forms/retries/account guards, explicit QC read, SUP003-only result controls, Fail reason, opaque revisions, lost-ack/reviewed-token retry and no automatic writes/delivery.');
