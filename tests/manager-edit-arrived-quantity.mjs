import fs from 'node:fs';
import assert from 'node:assert/strict';
const suite=fs.readFileSync('tests/v215-spare-parts-entry-regression.mjs','utf8');
const prefix=suite.slice(0,suite.indexOf('\ntest('));
const {fixture,validate}=await import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {fixture,validate};').toString('base64'));
function ordered(role='Manager'){
 const f=fixture(role,'M1');
 f.serverRows.splice(3);
 f.serverRows.push({event_id:'ordered',entity_id:f.partId,actor_id:'M1',event_type:'SPARE_PART_STATUS_CHANGED',revision:2,server_time:'2026-10-23T08:00:00Z',payload:{partId:f.partId,listNo:f.listNo,jobCard:f.jobCard,from:'QUOTED',to:'ORDERED'}});
 f.parts.hydrateFromServerRows(f.serverRows);
 const select={value:'RECEIVED',disabled:false};
 f.elements.set('v2SpEditStatus',select);
 f.elements.set('v2SpEditName',{value:'Unsaved name'});
 return {f,select};
}
for(const raw of [null,'','0','2','NaN']){
 const {f,select}=ordered();f.window.prompt=()=>raw;
 await f.parts.managerEditStatusChange(f.listNo,f.partId,select);
 assert.equal(f.commits.length,0,String(raw));assert.equal(select.value,'ORDERED');assert.equal(select.disabled,false);
 assert.equal(f.elements.get('v2SpEditName').value,'Unsaved name');
}
{
 const {f,select}=ordered();let prompts=0;
 f.parts.openManagerEditItem(f.listNo,f.partId);
 assert.match(f.html(),/onchange="zukaitV2.sparePartsMain.managerEditStatusChange/);
 const editor=f.html();f.window.prompt=()=>{prompts++;return '1'};
 await f.parts.managerEditStatusChange(f.listNo,f.partId,select);
 assert.equal(prompts,1);assert.equal(f.commits.length,1);
 assert.equal(f.commits[0].type,'SPARE_PART_STATUS_CHANGED');
 assert.equal(f.commits[0].payload.receivedQty,1);assert.equal(select.value,'RECEIVED');
 assert.equal(f.html(),editor,'receipt must not replace the editor or discard unsaved fields');
 await f.parts.hydrateAuthoritativeLists();
 assert.equal(f.lists()[0].items[0].receivedQty,1);
 assert.equal(f.parts.arrivalPendingCount(f.lists()),1,'receipt must still await confirmation');
 assert.equal(f.lists()[0].items[0].name,'Head lamp RH','unsaved edits are not silently committed');
}
{
 const {f,select}=ordered('Supervisor');let prompted=false;f.window.prompt=()=>{prompted=true;return '1'};
 await f.parts.managerEditStatusChange(f.listNo,f.partId,select);
 assert.equal(prompted,false);assert.equal(f.commits.length,0);assert.equal(select.value,'ORDERED');
 assert.match(f.alerts.at(-1),/Purchaser or Manager/);
}
{
 const {f,select}=ordered();f.fail('spare_transition_forbidden');f.window.prompt=()=> '1';
 await f.parts.managerEditStatusChange(f.listNo,f.partId,select);
 assert.equal(select.value,'ORDERED');assert.equal(select.disabled,false);assert.equal(Number(f.lists()[0].items[0].receivedQty||0),0);
}
{
 const {f,select}=ordered();let release;let prompts=0;
 f.window.prompt=()=>{prompts++;return '1'};
 f.onCommit(()=>new Promise(resolve=>{release=resolve}));
 const first=f.parts.managerEditStatusChange(f.listNo,f.partId,select);
 await f.parts.managerEditStatusChange(f.listNo,f.partId,select);
 while(!release)await new Promise(resolve=>setImmediate(resolve));
 release();await first;assert.equal(prompts,1);assert.equal(f.commits.length,1);
}
for(const from of ['LISTED','ENQUIRY','QUOTED']){
 const f=fixture('Manager','M1');f.serverRows.splice(2);
 if(from!=='LISTED')f.serverRows.push({event_id:'prior',entity_id:f.partId,event_type:'SPARE_PART_STATUS_CHANGED',revision:2,server_time:'2026-10-23T08:00:00Z',payload:{partId:f.partId,listNo:f.listNo,jobCard:f.jobCard,from:'LISTED',to:from}});
 f.parts.hydrateFromServerRows(f.serverRows);const select={value:'RECEIVED',disabled:false};let n=0;f.window.prompt=()=>++n===1?'1':'Physically received without order';
 await f.parts.managerEditStatusChange(f.listNo,f.partId,select);
 assert.equal(select.value,'RECEIVED',from);assert.equal(f.commits.length,1);assert.equal(f.commits[0].payload.from,from);assert.equal(f.commits[0].payload.reason,'Physically received without order');
 await f.parts.hydrateAuthoritativeLists();assert.equal(f.lists()[0].items[0].receivedQty,1);assert.equal(f.parts.arrivalPendingCount(f.lists()),1);
 const denied=await validate({event:f.commits[0]},{id:'P1',role:'Purchaser'},{});assert.equal(denied.ok,false,'server must reject non-Manager direct arrival');
 const missing=await validate({event:{...f.commits[0],payload:{...f.commits[0].payload,reason:''}}},{id:'M1',role:'Manager'},{});assert.equal(missing.code,'spare_direct_arrival_reason_required');
}
console.log('PASS: Arrived quantity, direct Manager receipt with reason, API role guards, cancellation, failure and duplicate clicks preserve the editor.');

