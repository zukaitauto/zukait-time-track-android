import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const workflow=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/workflow.js','utf8');
const main=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const server=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
// Execute the production payload, sequence and role guard before database work.
const start=server.indexOf('      if (eventType==="SPARE_PART_STATUS_CHANGED") {');
const end=server.indexOf('        if(to==="RETURNED"){',start);
assert.ok(start>=0&&end>start);
const authorize=new Function('event','callerRole','reply','const eventType="SPARE_PART_STATUS_CHANGED";'+server.slice(start,end)+'\n} return {ok:true};');
const key='zukait_v2_spare_parts_lists_v1',store=new Map(),events=[],alerts=[];
const initial={listNo:'PL-SUP',jobCard:'JC-SUP',items:[{id:'part',name:'Lamp',qty:2,status:'LISTED',revision:1,quoteAmount:15,purchaseAmount:20,supplier:'Existing supplier',invoiceNo:'INV-1'}]};
store.set(key,JSON.stringify([initial]));
let fail=false,queueFails=false,html='';
const box={window:{me:{id:'SUP1',role:'Supervisor'},confirm:()=>true,prompt:()=> '1',zukaitCloud:{v2CommitEvent:async e=>{const result=authorize(e,box.window.me.role,(body,status)=>({...body,status}));if(!result.ok)throw {code:result.code};if(fail)throw {code:'TIMEOUT'};events.push(e);return {ok:true}}}},navigator:{onLine:true},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(queueFails&&k==='zukait_v2_event_queue_v1')throw Error('storage full');store.set(k,v)}},alert:m=>alerts.push(m),Date,console};
box.window.openModal=value=>{html=value};
box.document={getElementById:()=>null,createElement:()=>({}),head:{appendChild:()=>{}},querySelectorAll:()=>[]};
vm.createContext(box);vm.runInContext(workflow,box);
vm.runInContext(fs.readFileSync('app/src/main/assets/v2/core/offline_queue.js','utf8'),box);
vm.runInContext(main,box);
const api=box.window.zukaitV2.sparePartsMain,wf=box.window.zukaitV2.spareParts;
const part=()=>JSON.parse(store.get(key))[0].items[0];
const click=to=>api.waitingStatusClick({dataset:{list:'PL-SUP',item:'part',to},disabled:false});
const button=to=>assert.match(html,new RegExp('data-to="'+to+'"'));
await api.openWaitingList('PL-SUP');
button('ENQUIRY');await click('ORDERED');assert.equal(events.length,0,'Supervisor cannot skip enquiry');
await click('ENQUIRY');assert.equal(part().status,'ENQUIRY');button('ORDERED');
await click('ORDERED');assert.equal(part().status,'ORDERED');button('RECEIVED');
fail=true;queueFails=true;await click('RECEIVED');assert.equal(part().status,'ORDERED');assert.equal(part().pendingSync,undefined);assert.match(alerts.at(-1),/Status not saved/);
fail=false;queueFails=false;await click('RECEIVED');assert.equal(part().receivedQty,1);button('RECEIVED');
assert.doesNotMatch(html,/data-to="SUPERVISOR_VERIFIED"/,'Partial receipt must not offer verification');
assert.equal(wf.transition(part(),'SUPERVISOR_VERIFIED',{role:'Supervisor'}).reason,'RECEIPT_INCOMPLETE');
await click('RECEIVED');assert.equal(part().receivedQty,2);button('SUPERVISOR_VERIFIED');
assert.deepEqual(events.map(e=>e.payload.to),['ENQUIRY','ORDERED','RECEIVED','RECEIVED']);
assert.ok(events.every(e=>e.actorId==='SUP1'));assert.equal(part().supervisorVerifiedAt,undefined,'Arrival must not silently verify itself');
for(const field of ['quoteAmount','purchaseAmount','supplier','invoiceNo'])assert.equal(part()[field],initial.items[0][field]);
await click('SUPERVISOR_VERIFIED');assert.ok(part().supervisorVerifiedAt);
for(const [from,to] of [['LISTED','ORDERED'],['LISTED','RECEIVED'],['ENQUIRY','RECEIVED'],['QUOTED','RECEIVED'],['ENQUIRY','QUOTED'],['ENQUIRY','LISTED'],['ORDERED','ENQUIRY']]){
 assert.equal(wf.canAct('Supervisor',from,to),false,from+' -> '+to);
 assert.equal(authorize({payload:{partId:'part',listNo:'PL-SUP',jobCard:'JC-SUP',from,to}},'Supervisor',body=>body).ok,false,'Server denies '+from+' -> '+to);
}
for(const role of ['Denter','Employee','Accountant','Receptionist',''])for(const [from,to] of [['LISTED','ENQUIRY'],['ENQUIRY','ORDERED'],['ORDERED','RECEIVED']]){
 assert.equal(wf.canAct(role,from,to),false);
 assert.equal(authorize({payload:{partId:'part',listNo:'PL-SUP',jobCard:'JC-SUP',from,to}},role,body=>body).ok,false);
}
store.set(key,JSON.stringify([initial]));fail=true;box.navigator.onLine=false;
await click('ENQUIRY');assert.equal(part().pendingSync,true);assert.equal(api.queueState(part().pendingEventId),'pending');
const pending=part().pendingEventId;await click('ORDERED');assert.equal(part().pendingEventId,pending);assert.equal(part().status,'ENQUIRY');
// Also exercise the complete API commit guard and authoritative history hydration.
const entrySuite=fs.readFileSync('tests/v215-spare-parts-entry-regression.mjs','utf8');
const prefix=entrySuite.slice(0,entrySuite.indexOf('\ntest('));
const {fixture}=await import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {fixture};').toString('base64'));
const live=fixture('Supervisor','SUP1',[{event_id:'listed',entity_id:'SP-existing',event_type:'SPARE_PART_LISTED',actor_id:'SUP1',revision:1,server_time:'2026-11-28T06:00:00Z',payload:{partId:'SP-existing',listNo:'PL001',jobCard:'JC101',name:'Lamp',qty:2}}]);
live.window.prompt=()=> '1';
for(const to of ['ENQUIRY','ORDERED','RECEIVED','RECEIVED','SUPERVISOR_VERIFIED']){
 await live.parts.openWaitingList(live.listNo);
 assert.match(live.html(),new RegExp('data-to="'+to+'"'));
 await live.parts.waitingStatusClick({dataset:{list:live.listNo,item:live.partId,to},disabled:false});
 assert.equal(live.alerts.length,0,live.alerts.join('; '));
 assert.equal(live.lists()[0].items[0].status,to);
}
assert.deepEqual(live.commits.map(e=>e.payload.to),['ENQUIRY','ORDERED','RECEIVED','RECEIVED','SUPERVISOR_VERIFIED']);
console.log('Supervisor Parts Waiting: sequential buttons, server authorization, partial receipts, verification, pricing preservation and fail-closed queue passed');
