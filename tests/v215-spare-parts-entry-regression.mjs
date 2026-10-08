import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';

const main = fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js', 'utf8');
const api = fs.readFileSync('supabase/functions/workshop-api/index.ts', 'utf8');
const guard = api.slice(api.indexOf('    if (action === "v2_commit_event") {'), api.indexOf('      const { data, error } = await admin.rpc("zukait_v2_commit_event"'));
// Execute the actual API authorization and payload rules against UI-generated events.
const validate = new Function(stripTypeScriptTypes(`async function validate(body,user,admin){const action='v2_commit_event'; const reply=(result,status)=>({...result,status}); ${guard} return {ok:true}; }}`)+';return validate;')();
const LIST_KEY = 'zukait_v2_spare_parts_lists_v1';
const DRAFT_KEY = 'zukait_v2_parts_create_draft_v1';
const copy = value => JSON.parse(JSON.stringify(value));

function serverProjection(rows){
 const storage=new Map(),window={zukaitV2:{}};
 const ctx={window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},navigator:{onLine:true},Date,console};
 vm.createContext(ctx);vm.runInContext(main,ctx);
 return window.zukaitV2.sparePartsMain.hydrateFromServerRows(copy(rows));
}

function fixture(userRole = 'Supervisor', userId = 'SUP002', sharedRows = null) {
  const storage = new Map(), elements = new Map(), alerts = [], commits = [];
  const listNo = 'PL001', jobCard = 'JC101', partId = 'SP-existing';
  const serverRows = sharedRows || [
    {event_id:'spare-list-PL001-1',entity_id:listNo,actor_id:'SUP001',event_type:'SPARE_PART_LIST_CREATED',revision:1,server_time:'2026-09-30T06:00:00Z',payload:{partId:listNo,listNo,jobCard,vehicle:'Toyota',model:'Corolla',year:'2012',registration:'101 A',customer:'Cash',targetRole:'Purchaser'}},
    {event_id:'spare-item-'+partId,entity_id:partId,actor_id:'SUP001',event_type:'SPARE_PART_LISTED',revision:1,server_time:'2026-09-30T06:00:01Z',payload:{partId,listNo,jobCard,name:'Head lamp RH',partNo:'',qty:1,targetRole:'Purchaser'}},
    {event_id:'spare-quote-'+partId,entity_id:partId,actor_id:'PUR001',event_type:'SPARE_PART_COMMERCIAL_UPDATED',revision:1,server_time:'2026-09-30T06:00:02Z',payload:{partId,listNo,jobCard,quoteAmount:2.5,purchaseAmount:null,supplier:'Vendor A'}},
    {event_id:'spare-status-'+partId+'-1',entity_id:partId,actor_id:'PUR001',event_type:'SPARE_PART_STATUS_CHANGED',revision:1,server_time:'2026-09-30T06:00:03Z',payload:{partId,listNo,jobCard,from:'ORDERED',to:'RECEIVED',receivedQty:1}},
    {event_id:'spare-status-'+partId+'-2',entity_id:partId,actor_id:'SUP001',event_type:'SPARE_PART_STATUS_CHANGED',revision:2,server_time:'2026-09-30T06:00:04Z',payload:{partId,listNo,jobCard,from:'RECEIVED',to:'SUPERVISOR_VERIFIED'}}
  ];
  const localStorage = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  let html = '', failure = null, beforeCommit = null;
  const window = {
    me:{id:userId,role:userRole}, confirm:()=>true, prompt:()=>null,
    openModal:value=>{html=value},
    jd:()=>({no:jobCard,make:'Toyota',model:'Corolla',year:'2012',reg:'101 A'}),
    zukaitV2:{reports:{page:async()=>({rows:copy(serverRows),source:'server',nextCursor:null})}},
    zukaitCloud:{
      allocateSparePartList:async()=>({list_no:listNo,job_card:jobCard,status:'OPEN',created_by:'SUP001',created_at:'2026-09-30T06:00:00Z'}),
      v2CommitEvent:async event=>{
        commits.push(copy(event));
        if(beforeCommit)await beforeCommit(event);
        if(failure)throw Object.assign(new Error(failure),{code:failure});
        const admin={from:table=>{const filters={};const query={select:()=>query,eq:(k,v)=>{filters[k]=v;return query},order:()=>query,limit:()=>query,maybeSingle:async()=>{
          if(table==='workshop_v2_spare_part_state'){
            const item=serverProjection(serverRows).flatMap(l=>(l.items||[]).map(i=>({...i,list_no:l.listNo,job_card:l.jobCard}))).find(i=>i.id===filters.part_id);
            return {data:item?{part_id:item.id,list_no:item.list_no,job_card:item.job_card,status:item.status}:null,error:null};
          }
          if(table==='workshop_v2_events'){
            const rows=serverRows.filter(r=>r.entity_id===filters.entity_id&&r.event_type===filters.event_type);
            return {data:copy(rows.at(-1)||null),error:null};
          }
          throw Error('Unexpected authority query: '+table);
        }};return query}};
        const result=await validate({event},window.me,admin);
        if(!result.ok)throw Object.assign(new Error(result.code),{code:result.code});
        const prior=serverRows.find(row=>row.event_id===event.eventId);
        if(prior && (prior.actor_id!==event.actorId || JSON.stringify(prior.payload)!==JSON.stringify(event.payload)))throw Object.assign(new Error('event_id_conflict'),{code:'event_id_conflict'});
        if(!prior)serverRows.push({event_id:event.eventId,entity_id:event.entityId,actor_id:event.actorId,event_type:event.type,revision:event.serverRevision,server_time:new Date().toISOString(),payload:copy(event.payload)});
        return {ok:true};
      }
    }
  };
  const document = {
    getElementById:id=>elements.get(id)||null, querySelectorAll:()=>[],
    createElement:()=>({}), head:{appendChild:el=>elements.set(el.id,el)}
  };
  const context={window,document,localStorage,navigator:{onLine:true},crypto:{randomUUID},Date,console,alert:message=>alerts.push(message)};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('app/src/main/assets/v2/core/offline_queue.js','utf8'),context);
  vm.runInContext(fs.readFileSync('app/src/main/assets/v2/features/spare-parts/workflow.js','utf8'),context);
  vm.runInContext(main,context);
  const parts=window.zukaitV2.sparePartsMain;
  parts.hydrateFromServerRows(copy(serverRows));
  elements.set('v2SpDraftCreate',{disabled:false});
  elements.set('v2SpDraftMessage',{textContent:''});
  elements.set('invoicePrice',{value:'2.440'});
  elements.set('v2PartName',{value:'Front bumper'});
  elements.set('v2PartQty',{value:'2'});
  return {
    parts,context,window,storage,elements,alerts,commits,serverRows,listNo,jobCard,partId,
    lists:()=>JSON.parse(storage.get(LIST_KEY)||'[]'), html:()=>html,
    fail:code=>{failure=code},
    onCommit:fn=>{beforeCommit=fn},
    draft:items=>localStorage.setItem(DRAFT_KEY,JSON.stringify({jobCard,customer:'Cash',items})),
    invoice:()=>parts.invoiceEntryClick({dataset:{list:listNo,item:partId,input:'invoicePrice'}}),
    setItem:patch=>{const lists=JSON.parse(storage.get(LIST_KEY));Object.assign(lists[0].items[0],patch);localStorage.setItem(LIST_KEY,JSON.stringify(lists));}
  };
}

test('Supervisor and Manager invoice saves satisfy the live API contract and hydrate on another device',async()=>{
  for(const role of ['Supervisor','Manager']){
    const f=fixture(role);
    await f.invoice();
    assert.deepEqual(f.alerts,[],role+' invoice save should not be rejected');
    assert.equal(f.lists()[0].items[0].purchaseAmount,2.44);
    assert.equal(f.lists()[0].items[0].quoteAmount,2.5,'invoice must preserve agreed quotation');
    assert.equal(f.lists()[0].items[0].status,'SUPERVISOR_VERIFIED','invoice must not change arrival status');
    const e=f.commits.find(e=>e.type==='SPARE_PART_FINAL_PRICE_RECORDED');
    assert.deepEqual(Object.keys(e.payload).sort(),['expectedPurchaseAmount','finalPrice','jobCard','listNo','partId']);
    const other=fixture('Purchaser');
    other.parts.hydrateFromServerRows(copy(f.serverRows));
    assert.equal(other.lists()[0].items[0].purchaseAmount,2.44);
    assert.match(f.html(),/All eligible parts on this Job Card have invoice amounts/);
  }
});

test('invoice validation and permissions reject bad inputs without committing',async()=>{
  for(const value of ['', '-1','NaN','1000001']){
    const f=fixture();f.elements.get('invoicePrice').value=value;
    await f.invoice();assert.equal(f.commits.length,0,value);
    assert.equal(f.lists()[0].items[0].purchaseAmount,null);
  }
  for(const role of ['Purchaser','Denter','Employee']){
    const f=fixture(role);await f.invoice();assert.equal(f.commits.length,0,role);
  }
  const f=fixture();f.setItem({status:'LISTED'});await f.invoice();assert.equal(f.commits.length,0);
});

test('a rejected invoice retains its prior price and unrelated part fields',async()=>{
  const f=fixture();f.setItem({purchaseAmount:3,purchaseAmountRevision:4});f.fail('spare_final_price_forbidden_or_invalid');
  await f.invoice();
  const item=f.lists()[0].items[0];
  assert.equal(item.purchaseAmount,3);assert.equal(item.purchaseAmountRevision,4);
  assert.equal(item.quoteAmount,2.5);assert.equal(item.supplier,'Vendor A');
});

test('a queued invoice is preserved during authoritative hydration',async()=>{
  const f=fixture();f.fail('NETWORK');await f.invoice();
  assert.equal(f.window.zukaitV2.queue.pending().length,1);
  await f.parts.hydrateAuthoritativeLists();
  assert.equal(f.lists()[0].items[0].purchaseAmount,2.44);
  assert.equal(f.lists()[0].items[0].pendingSync,true);
  f.fail(null);const event=f.window.zukaitV2.queue.pending()[0];
  await f.window.zukaitCloud.v2CommitEvent(event);f.window.zukaitV2.queue.markSynced(event.eventId);
  await f.parts.hydrateAuthoritativeLists();
  assert.equal(f.lists()[0].items[0].purchaseAmount,2.44);
  assert.equal(f.lists()[0].items[0].pendingSync,undefined);
});

test('another Supervisor can submit additional parts through Create Parts List without recreating the list',async()=>{
  const f=fixture();f.draft([{name:'Front bumper',qty:2}]);
  await f.parts.createFromUI();
  assert.equal(f.lists().length,1);
  assert.equal(f.lists()[0].items.length,2,'additional part must be saved to original list');
  assert.equal(f.lists()[0].listNo,f.listNo);
  assert.equal(f.commits.filter(e=>e.type==='SPARE_PART_LIST_CREATED').length,0,'existing list creation must not be replayed with a different actor');
  assert.equal(f.commits.filter(e=>e.type==='SPARE_PART_LISTED').length,1);
  assert.equal(f.commits[0].payload.targetRole,'Purchaser');
  assert.equal(f.storage.has(DRAFT_KEY),false);
});

test('first-list creation still creates its header and parts, and a fresh device appends to it',async()=>{
  const f=fixture();f.serverRows.length=0;f.storage.set(LIST_KEY,'[]');
  f.draft([{name:'Front bumper',qty:2}]);await f.parts.createFromUI();
  assert.equal(f.commits.filter(e=>e.type==='SPARE_PART_LIST_CREATED').length,1);
  assert.equal(f.commits.filter(e=>e.type==='SPARE_PART_LISTED').length,1);
  assert.equal(f.lists()[0].items[0].qty,2);
  const other=fixture('Supervisor','SUP003');
  other.serverRows.splice(0,other.serverRows.length,...copy(f.serverRows));other.storage.set(LIST_KEY,'[]');
  other.draft([{name:'Bonnet',qty:1}]);await other.parts.createFromUI();
  assert.equal(other.lists().length,1);assert.equal(other.lists()[0].items.length,2);
  assert.equal(other.commits.filter(e=>e.type==='SPARE_PART_LIST_CREATED').length,0);
});

test('a failed additional-parts submission retains the saved draft for retry',async()=>{
  const f=fixture();f.draft([{name:'Bonnet',qty:1}]);f.fail('spare_list_edit_forbidden');
  await f.parts.createFromUI();
  assert.equal(f.lists()[0].items.length,1);
  assert.equal(JSON.parse(f.storage.get(DRAFT_KEY)).items[0].name,'Bonnet');
  assert.equal(f.elements.get('v2SpDraftCreate').disabled,false);
  f.fail(null);await f.parts.createFromUI();
  assert.equal(f.lists()[0].items.length,2);assert.equal(f.storage.has(DRAFT_KEY),false);
});

test('Add Part keeps earlier work intact, detects duplicates, and rejects invalid quantity',async()=>{
  const f=fixture();const prior=copy(f.lists()[0].items[0]);
  await f.parts.openList(f.listNo);assert.match(f.html(),/openAddPart/);
  await f.parts.addFromUI(f.listNo);
  assert.equal(f.lists().length,1);assert.equal(f.lists()[0].items.length,2);
  assert.deepEqual(f.lists()[0].items[0],prior);
  assert.equal(f.commits[0].payload.qty,2);
  await f.parts.hydrateAuthoritativeLists();
  await f.parts.addFromUI(f.listNo);assert.equal(f.commits.length,1,'duplicate part must not be committed');
  const invalid=fixture();invalid.elements.get('v2PartQty').value='0';
  await invalid.parts.addFromUI(invalid.listNo);assert.equal(invalid.commits.length,0);
});

test('Add Part rolls back a rejected write and preserves a queued write through hydration',async()=>{
  const rejected=fixture();rejected.fail('spare_list_edit_forbidden');
  await rejected.parts.addFromUI(rejected.listNo);
  assert.equal(rejected.lists()[0].items.length,1,'rejected part must not look saved');
  assert.equal(rejected.elements.get('v2PartName').value,'Front bumper');
  assert.ok(rejected.alerts.some(a=>String(a).includes('Could not save')));
  const queued=fixture();queued.fail('NETWORK');await queued.parts.addFromUI(queued.listNo);
  await queued.parts.hydrateAuthoritativeLists();
  assert.equal(queued.lists()[0].items.length,2,'pending part must survive server refresh');
  assert.equal(queued.lists()[0].items[1].pendingSync,true);
});

test('parts module script has a new cache version so browsers receive Add Part and invoice fixes',()=>{
  const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
  const version=Number(html.match(/v2\/features\/spare-parts\/main_module\.js\?v=(\d+)/)?.[1]);
  assert.ok(version>=215,'parts module cache version must move beyond v202');
});

test('Manager and Supervisor corrections validate before-state without a declaration error',async()=>{
  for(const role of ['Manager','Supervisor']){
    const event={eventId:'correction-'+role,entityId:'SP1',actorId:'USER1',type:role==='Manager'?'SPARE_PART_MANAGER_CORRECTED':'SPARE_PART_SUPERVISOR_CORRECTED',payload:{partId:'SP1',listNo:'PL1',jobCard:'12029',reason:'Correct part name',before:{name:'Bumper',qty:1,status:'LISTED'},after:{name:'Front bumper',qty:1,status:'LISTED'}}};
    assert.deepEqual(await validate({event},{id:'USER1',role},{}),{ok:true});
    const injected=copy(event);injected.payload.before.unapprovedField=true;
    assert.equal((await validate({event:injected},{id:'USER1',role},{})).code,'spare_manager_correction_forbidden_or_invalid');
  }
});

test('only Manager may return verified, confirmed, or fitted parts through the API',async()=>{
  for(const from of ['SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED']){
    for(const role of ['Manager','Supervisor','Purchaser']){
      const event={eventId:'return-'+from+'-'+role,entityId:'SP1',actorId:'USER1',type:'SPARE_PART_STATUS_CHANGED',payload:{partId:'SP1',listNo:'PL1',jobCard:'12029',from,to:'RETURNED',reason:'Wrong supplied part'}};
      const result=await validate({event},{id:'USER1',role},{});
      if(role==='Manager')assert.deepEqual(result,{ok:true},from);
      else {assert.equal(result.code,'spare_return_manager_required');assert.equal(result.status,403)}
    }
  }
});


test('two client caches converge when Manager Return wins an in-flight invoice save',async()=>{
 const supervisor=fixture(),manager=fixture('Manager','M1',supervisor.serverRows);
 const pendingId='SP-offline-other',pendingEventId='spare-item-'+pendingId;
 const pendingLists=supervisor.lists();
 pendingLists[0].items.push({id:pendingId,name:'Offline clip',qty:1,status:'LISTED',pendingSync:true,pendingEventId});
 supervisor.storage.set(LIST_KEY,JSON.stringify(pendingLists));
 supervisor.window.zukaitV2.queue.enqueue({eventId:pendingEventId,entityId:pendingId,type:'SPARE_PART_LISTED',payload:{partId:pendingId,listNo:supervisor.listNo,jobCard:supervisor.jobCard,name:'Offline clip',qty:1,targetRole:'Purchaser'}});
 let release,started;
 const held=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 supervisor.onCommit(async event=>{if(event.type==='SPARE_PART_FINAL_PRICE_RECORDED'){started();await held}});
 const saving=supervisor.invoice();await entered;
 const returned=await manager.parts.transitionItem(manager.listNo,manager.partId,'RETURNED','Wrong supplied part');
 assert.equal(returned.ok,true);release();await saving;
 for(const device of [supervisor,manager]){
   await device.parts.hydrateAuthoritativeLists();
   const returnedItem=device.lists()[0].items.find(i=>i.id===device.partId);
   assert.equal(returnedItem.status,'RETURNED');
   assert.equal(returnedItem.purchaseAmount,undefined);
   assert.equal(returnedItem.pendingSync,undefined);
 }
 assert.equal(supervisor.lists()[0].items.find(i=>i.id===pendingId).pendingSync,true,'Unrelated offline part must survive conflict refresh');
 assert.equal(supervisor.window.zukaitV2.queue.pending().length,1,'Unrelated queued event must remain queued');
 assert.equal(supervisor.serverRows.filter(r=>r.event_type==='SPARE_PART_FINAL_PRICE_RECORDED').length,0);
 assert.ok(supervisor.alerts.some(s=>s.includes('Latest Parts data has been refreshed')));
});

test('invoice first then Manager Return and Cancel Return restores amount and date on both clients',async()=>{
 const supervisor=fixture(),manager=fixture('Manager','M1',supervisor.serverRows);
 await supervisor.invoice();await manager.parts.hydrateAuthoritativeLists();
 const paid=copy(manager.lists()[0].items[0]);
 assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'RETURNED','Mistaken return')).ok,true);
 manager.window.prompt=()=> 'Cancel mistaken return';
 await manager.parts.cancelReturn(manager.listNo,manager.partId);
 assert.deepEqual(manager.alerts,[]);
 for(const device of [supervisor,manager]){
   await device.parts.hydrateAuthoritativeLists();
   const item=device.lists()[0].items[0];
   assert.equal(item.status,paid.status);
   assert.equal(item.purchaseAmount,paid.purchaseAmount);
   assert.equal(item.purchaseRecordedAt,paid.purchaseRecordedAt);
   assert.equal(device.parts.reportRows().reduce((n,r)=>n+r.amount,0),2.44);
 }
});

test('stale Manager Return refreshes a winning invoice before retry and cancellation',async()=>{
 const supervisor=fixture(),manager=fixture('Manager','M1',supervisor.serverRows);
 manager.onCommit(async event=>{
   if(event.type==='SPARE_PART_STATUS_CHANGED'&&event.payload.to==='RETURNED'){
     await supervisor.invoice();
     const paid=serverProjection(supervisor.serverRows)[0].items[0];
     assert.notEqual(event.payload.preReturnSnapshot.purchaseAmountRevision,paid.purchaseAmountRevision);
     throw Object.assign(new Error('stale_spare_return_financial_snapshot'),{code:'stale_spare_return_financial_snapshot'});
   }
 });
 const lost=await manager.parts.transitionItem(manager.listNo,manager.partId,'RETURNED','Wrong supplied part');
 assert.equal(lost.ok,false);assert.equal(lost.detail,'stale_spare_return_financial_snapshot');
 assert.equal(manager.lists()[0].items[0].status,'SUPERVISOR_VERIFIED');
 assert.equal(manager.lists()[0].items[0].purchaseAmount,2.44);
 assert.equal(supervisor.serverRows.filter(r=>r.payload.to==='RETURNED').length,0);
 manager.onCommit(null);
 assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'RETURNED','Reviewed return')).ok,true);
 manager.window.prompt=()=> 'Return was mistaken';await manager.parts.cancelReturn(manager.listNo,manager.partId);
 assert.deepEqual(manager.alerts,[]);
 assert.equal(manager.lists()[0].items[0].purchaseAmount,2.44);
});


test('replacement invoice uses a new event identity after return and re-enquiry',async()=>{
 const manager=fixture('Manager','M1');await manager.invoice();
 const first=manager.commits.find(e=>e.type==='SPARE_PART_FINAL_PRICE_RECORDED');
 assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'RETURNED','Wrong part')).ok,true);
 assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'ENQUIRY')).ok,true);
 assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'ORDERED')).ok,true);
 assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'RECEIVED','',{receivedQty:1})).ok,true);
 assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'SUPERVISOR_VERIFIED')).ok,true);
 await manager.parts.hydrateAuthoritativeLists();
 assert.equal(manager.lists()[0].items[0].purchaseAmount,undefined);
 manager.elements.get('invoicePrice').value='3.500';await manager.invoice();
 assert.deepEqual(manager.alerts,[]);
 const last=manager.commits.filter(e=>e.type==='SPARE_PART_FINAL_PRICE_RECORDED').at(-1);
 assert.equal(last.serverRevision,first.serverRevision+1);
 assert.notEqual(last.eventId,first.eventId);
 const other=fixture('Supervisor','SUP003',manager.serverRows);
 assert.equal(other.lists()[0].items[0].purchaseAmount,3.5);
 assert.equal(other.parts.reportRows().reduce((n,r)=>n+r.amount,0),3.5);
 assert.equal(other.lists()[0].items[0].purchaseAmountLastRevision,2);
});

test('Manager deletion wins an in-flight invoice and both client totals discard the deleted part',async()=>{
 const supervisor=fixture(),manager=fixture('Manager','M1',supervisor.serverRows);
 let release,started;
 const held=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 supervisor.onCommit(async event=>{if(event.type==='SPARE_PART_FINAL_PRICE_RECORDED'){started();await held}});
 const saving=supervisor.invoice();await entered;
 try {
   assert.equal((await manager.parts.deleteItem(manager.listNo,manager.partId)).ok,true);
 } finally {release()}
 await saving;
 for(const device of [supervisor,manager]){
   await device.parts.hydrateAuthoritativeLists();
   assert.equal(device.lists().flatMap(l=>l.items).some(i=>i.id===device.partId),false);
   assert.equal(device.parts.reportRows().reduce((n,r)=>n+r.amount,0),0);
 }
 assert.equal(supervisor.serverRows.filter(r=>r.event_type==='SPARE_PART_FINAL_PRICE_RECORDED').length,0);
 assert.ok(supervisor.alerts.some(s=>s.includes('Latest Parts data has been refreshed')));
});

test('invoice followed by Manager deletion removes its amount on a fresh client',async()=>{
 const supervisor=fixture(),manager=fixture('Manager','M1',supervisor.serverRows);
 await supervisor.invoice();await manager.parts.hydrateAuthoritativeLists();
 assert.equal(manager.parts.reportRows().reduce((n,r)=>n+r.amount,0),2.44);
 assert.equal((await manager.parts.deleteItem(manager.listNo,manager.partId)).ok,true);
 const fresh=fixture('Supervisor','SUP003',manager.serverRows);
 assert.equal(fresh.lists().flatMap(l=>l.items).some(i=>i.id===fresh.partId),false);
 assert.equal(fresh.parts.reportRows().reduce((n,r)=>n+r.amount,0),0);
});

test('simultaneous invoice event identity conflict refreshes the winning amount before retry',async()=>{
 const supervisor=fixture(),manager=fixture('Manager','M1',supervisor.serverRows);
 supervisor.elements.get('invoicePrice').value='7.500';
 supervisor.onCommit(async event=>{
   if(event.type==='SPARE_PART_FINAL_PRICE_RECORDED')await manager.invoice();
 });
 await supervisor.invoice();
 assert.equal(supervisor.serverRows.filter(r=>r.event_type==='SPARE_PART_FINAL_PRICE_RECORDED').length,1);
 assert.equal(supervisor.lists()[0].items[0].purchaseAmount,2.44);
 assert.ok(supervisor.alerts.some(s=>s.includes('Latest Parts data has been refreshed')));
 supervisor.onCommit(null);await supervisor.invoice();
 assert.equal(supervisor.serverRows.filter(r=>r.event_type==='SPARE_PART_FINAL_PRICE_RECORDED').length,2);
 const fresh=fixture('Supervisor','SUP003',supervisor.serverRows);
 assert.equal(fresh.lists()[0].items[0].purchaseAmount,7.5);
 assert.equal(fresh.parts.reportRows().reduce((n,r)=>n+r.amount,0),7.5);
});

function queueFlusher(f){
 const cloud=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
 const source=cloud.slice(cloud.indexOf('  async function flushV2EventQueue(){'),cloud.indexOf('  window.zukaitV2Transport='));
 vm.runInContext("function sessionToken(){return 'fixture-session'};async function v2CommitEvent(event){return window.zukaitCloud.v2CommitEvent(event)};"+source,f.context);
 return ()=>vm.runInContext('flushV2EventQueue()',f.context);
}

test('queued offline invoice conflict is quarantined and replaced by the winning server amount',async()=>{
 const offline=fixture(),manager=fixture('Manager','M1',offline.serverRows);
 offline.elements.get('invoicePrice').value='8.000';offline.fail('NETWORK');await offline.invoice();
 const eventId=offline.window.zukaitV2.queue.pending()[0].eventId;
 await manager.invoice();offline.fail(null);
 const flushed=await queueFlusher(offline)();
 assert.equal(flushed.pending,0);assert.equal(flushed.synced,0);
 assert.equal(offline.window.zukaitV2.queue.conflicts()[0].eventId,eventId);
 assert.equal(offline.lists()[0].items[0].purchaseAmount,2.44);
 assert.equal(offline.lists()[0].items[0].pendingSync,undefined);
 assert.equal(offline.parts.reportRows().reduce((n,r)=>n+r.amount,0),2.44);
 assert.equal((await queueFlusher(offline)()).synced,0,'Quarantined invoice must not retry automatically');
 assert.equal(offline.serverRows.filter(r=>r.event_type==='SPARE_PART_FINAL_PRICE_RECORDED').length,1);
});

test('queued offline invoice cannot restore a part deleted before reconnection',async()=>{
 const offline=fixture(),manager=fixture('Manager','M1',offline.serverRows);
 offline.fail('NETWORK');await offline.invoice();
 assert.equal((await manager.parts.deleteItem(manager.listNo,manager.partId)).ok,true);
 offline.fail(null);await queueFlusher(offline)();
 assert.equal(offline.window.zukaitV2.queue.pending().length,0);
 assert.equal(offline.window.zukaitV2.queue.conflicts()[0].syncError,'spare_final_price_not_eligible');
 assert.equal(offline.lists().flatMap(l=>l.items).some(i=>i.id===offline.partId),false);
 assert.equal(offline.parts.reportRows().reduce((n,r)=>n+r.amount,0),0);
 assert.equal(offline.serverRows.filter(r=>r.event_type==='SPARE_PART_FINAL_PRICE_RECORDED').length,0);
});

test('queued invoice after Manager Return is quarantined while an unrelated offline part still syncs',async()=>{
 const offline=fixture(),manager=fixture('Manager','M1',offline.serverRows);
 offline.fail('NETWORK');await offline.invoice();
 await offline.parts.addFromUI(offline.listNo);
 assert.equal(offline.window.zukaitV2.queue.pending().length,2);
 const additional=offline.lists()[0].items.find(i=>i.id!==offline.partId);
 assert.ok(additional.pendingSync);
 assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'RETURNED','Wrong supplied part')).ok,true);
 offline.fail(null);
 const result=await queueFlusher(offline)();
 assert.equal(result.synced,1);assert.equal(result.pending,0);
 assert.equal(offline.window.zukaitV2.queue.conflicts().length,1);
 assert.equal(offline.window.zukaitV2.queue.conflicts()[0].syncError,'spare_final_price_not_eligible');
 const returned=offline.lists()[0].items.find(i=>i.id===offline.partId);
 assert.equal(returned.status,'RETURNED');assert.equal(returned.purchaseAmount,undefined);
 assert.equal(returned.pendingSync,undefined);
 const saved=offline.lists()[0].items.find(i=>i.id===additional.id);
 assert.ok(saved);assert.equal(saved.pendingSync,undefined);
 const fresh=fixture('Supervisor','SUP003',offline.serverRows);
 assert.equal(fresh.lists()[0].items.find(i=>i.id===additional.id).name,additional.name);
 assert.equal(fresh.parts.reportRows().reduce((n,r)=>n+r.amount,0),0);
 assert.equal(offline.serverRows.filter(r=>r.event_type==='SPARE_PART_FINAL_PRICE_RECORDED').length,0);
});

test('late Cancel Return refreshes to a newer invoice instead of restoring the old snapshot',async()=>{
 const first=fixture('Manager','M1');await first.invoice();
 assert.equal((await first.parts.transitionItem(first.listNo,first.partId,'RETURNED','Wrong supplied part')).ok,true);
 const stale=fixture('Manager','M2',first.serverRows);
 first.window.prompt=()=> 'Restore part';await first.parts.cancelReturn(first.listNo,first.partId);
 first.elements.get('invoicePrice').value='9.500';await first.invoice();
 stale.window.prompt=()=> 'Stale restoration';
 stale.onCommit(async event=>{
   if(event.type==='SPARE_PART_RETURN_CANCELLED'){
     const current=serverProjection(stale.serverRows)[0].items[0];
     assert.equal(current.purchaseAmount,9.5);
     assert.notEqual(current.status,'RETURNED');
     throw Object.assign(new Error('stale_spare_part_status'),{code:'stale_spare_part_status'});
   }
 });
 await stale.parts.cancelReturn(stale.listNo,stale.partId);
 const item=stale.lists()[0].items[0];
 assert.equal(item.status,'SUPERVISOR_VERIFIED');
 assert.equal(item.purchaseAmount,9.5);
 assert.equal(item.pendingSync,undefined);
 assert.equal(stale.parts.reportRows().reduce((n,r)=>n+r.amount,0),9.5);
 assert.ok(stale.alerts.some(s=>s.includes('Latest Parts data has been refreshed')));
 assert.equal(stale.serverRows.filter(r=>r.event_type==='SPARE_PART_RETURN_CANCELLED').length,1);
});

test('queued Cancel Return conflict refreshes a newer invoice and stops automatic replay',async()=>{
 const first=fixture('Manager','M1');await first.invoice();
 assert.equal((await first.parts.transitionItem(first.listNo,first.partId,'RETURNED','Wrong supplied part')).ok,true);
 const offline=fixture('Manager','M2',first.serverRows);
 offline.window.prompt=()=> 'Restore offline';offline.fail('NETWORK');
 await offline.parts.cancelReturn(offline.listNo,offline.partId);
 assert.equal(offline.window.zukaitV2.queue.pending().length,1);
 first.window.prompt=()=> 'Restore online';await first.parts.cancelReturn(first.listNo,first.partId);
 first.elements.get('invoicePrice').value='6.000';await first.invoice();
 offline.fail(null);
 offline.onCommit(async event=>{
   if(event.type==='SPARE_PART_RETURN_CANCELLED'){
     assert.notEqual(serverProjection(offline.serverRows)[0].items[0].status,'RETURNED');
     throw Object.assign(new Error('stale_spare_part_status'),{code:'stale_spare_part_status'});
   }
 });
 const result=await queueFlusher(offline)();
 assert.equal(result.pending,0);assert.equal(result.synced,0);
 assert.equal(offline.window.zukaitV2.queue.conflicts()[0].syncError,'stale_spare_part_status');
 assert.equal(offline.lists()[0].items[0].purchaseAmount,6);
 assert.equal(offline.lists()[0].items[0].pendingSync,undefined);
 assert.equal(offline.parts.reportRows().reduce((n,r)=>n+r.amount,0),6);
 assert.equal((await queueFlusher(offline)()).pending,0);
});

test('two Managers cancelling the same Return converge after an actual event-ID collision',async()=>{
 const first=fixture('Manager','M1');await first.invoice();
 assert.equal((await first.parts.transitionItem(first.listNo,first.partId,'RETURNED','Wrong supplied part')).ok,true);
 const second=fixture('Manager','M2',first.serverRows);
 first.window.prompt=()=> 'Restore first';await first.parts.cancelReturn(first.listNo,first.partId);
 first.elements.get('invoicePrice').value='4.000';await first.invoice();
 second.window.prompt=()=> 'Restore second';await second.parts.cancelReturn(second.listNo,second.partId);
 assert.equal(second.lists()[0].items[0].status,'SUPERVISOR_VERIFIED');
 assert.equal(second.lists()[0].items[0].purchaseAmount,4);
 assert.equal(second.parts.reportRows().reduce((n,r)=>n+r.amount,0),4);
 assert.ok(second.alerts.some(s=>s.includes('Latest Parts data has been refreshed')));
 assert.equal(second.serverRows.filter(r=>r.event_type==='SPARE_PART_RETURN_CANCELLED').length,1);
});

test('Manager and Supervisor corrections refresh a concurrent winning invoice after rejection',async()=>{
 for(const role of ['Manager','Supervisor']){
   const editor=fixture(role,role==='Manager'?'M1':'SUP002');
   const other=fixture('Supervisor','SUP003',editor.serverRows);
   for(const [id,value] of Object.entries({
     v2SpEditName:'Head lamp RH',v2SpEditPartNo:'',v2SpEditQty:'1',
     v2SpEditSupplier:'Vendor A',v2SpEditAmount:'3.000',
     v2SpEditStatus:'SUPERVISOR_VERIFIED',v2SpEditReason:'Correct invoice amount'
   }))editor.elements.set(id,{value});
   editor.onCommit(async event=>{
     if(event.type==='SPARE_PART_MANAGER_CORRECTED'||event.type==='SPARE_PART_SUPERVISOR_CORRECTED'){
       await other.invoice();
       assert.notEqual(event.payload.before.purchaseAmount,serverProjection(editor.serverRows)[0].items[0].purchaseAmount);
       throw Object.assign(new Error('stale_spare_manager_correction'),{code:'stale_spare_manager_correction'});
     }
   });
   await editor.parts.saveManagerItemEdit(editor.listNo,editor.partId);
   const item=editor.lists()[0].items[0];
   assert.equal(item.purchaseAmount,2.44,role);
   assert.equal(item.status,'SUPERVISOR_VERIFIED',role);
   assert.equal(item.pendingSync,undefined);
   assert.equal(editor.parts.reportRows().reduce((n,r)=>n+r.amount,0),2.44);
   assert.ok(editor.alerts.some(s=>s.includes('Latest Parts data has been refreshed')));
   assert.equal(editor.serverRows.filter(r=>r.event_type.endsWith('_CORRECTED')).length,0);
 }
});

test('invoice expected amount refreshes a winning correction and permits a reviewed retry',async()=>{
 const invoice=fixture(),manager=fixture('Manager','M1',invoice.serverRows);
 invoice.onCommit(async event=>{
   if(event.type==='SPARE_PART_FINAL_PRICE_RECORDED'){
     assert.equal(event.payload.expectedPurchaseAmount,null);
     invoice.serverRows.push({
       event_id:'winning-correction',entity_id:invoice.partId,actor_id:'M1',
       event_type:'SPARE_PART_MANAGER_CORRECTED',revision:1,server_time:new Date().toISOString(),
       payload:{partId:invoice.partId,listNo:invoice.listNo,jobCard:invoice.jobCard,
         before:{status:'SUPERVISOR_VERIFIED',purchaseAmount:null},
         after:{status:'SUPERVISOR_VERIFIED',purchaseAmount:5,purchaseRecordedAt:new Date().toISOString()}}
     });
     throw Object.assign(new Error('stale_spare_final_price'),{code:'stale_spare_final_price'});
   }
 });
 await invoice.invoice();
 assert.equal(invoice.lists()[0].items[0].purchaseAmount,5);
 assert.ok(invoice.alerts.some(s=>s.includes('Latest Parts data has been refreshed')));
 assert.equal(invoice.serverRows.filter(r=>r.event_type==='SPARE_PART_FINAL_PRICE_RECORDED').length,0);
 invoice.onCommit(null);await invoice.invoice();
 assert.equal(invoice.commits.at(-1).payload.expectedPurchaseAmount,5);
 await manager.parts.hydrateAuthoritativeLists();
 assert.equal(manager.lists()[0].items[0].purchaseAmount,2.44);
 assert.equal(manager.parts.reportRows().reduce((n,r)=>n+r.amount,0),2.44);
});

test('invoice expected amount is optional for legacy clients and rejects invalid values',async()=>{
 const f=fixture();
 const admin={from:()=>{const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{part_id:f.partId,list_no:f.listNo,job_card:f.jobCard,status:'SUPERVISOR_VERIFIED'},error:null})};return query}};
 const event={eventId:'invoice-contract',entityId:f.partId,actorId:'SUP002',type:'SPARE_PART_FINAL_PRICE_RECORDED',serverRevision:1,
   payload:{partId:f.partId,listNo:f.listNo,jobCard:f.jobCard,finalPrice:2.44}};
 assert.deepEqual(await validate({event},f.window.me,admin),{ok:true},'Legacy invoice contract remains supported');
 for(const amount of [null,0,2.44,1000000]){
   const updated=copy(event);updated.payload.expectedPurchaseAmount=amount;
   assert.deepEqual(await validate({event:updated},f.window.me,admin),{ok:true});
 }
 for(const amount of [-1,'bad',1000001]){
   const invalid=copy(event);invalid.payload.expectedPurchaseAmount=amount;
   assert.equal((await validate({event:invalid},f.window.me,admin)).code,'spare_final_price_forbidden_or_invalid');
 }
 const injected=copy(event);injected.payload.unapprovedField=true;
 assert.equal((await validate({event:injected},f.window.me,admin)).code,'spare_final_price_forbidden_or_invalid');
});

test('competing receipt batches refresh the losing Purchaser to the accepted quantity',async()=>{
 const first=fixture('Purchaser','PUR001');
 first.serverRows.find(r=>r.event_type==='SPARE_PART_LISTED').payload.qty=3;
 first.serverRows.splice(first.serverRows.findIndex(r=>r.payload.to==='SUPERVISOR_VERIFIED'),1);
 first.parts.hydrateFromServerRows(copy(first.serverRows));
 const second=fixture('Purchaser','PUR002',first.serverRows);
 assert.equal((await first.parts.transitionItem(first.listNo,first.partId,'RECEIVED','',{receivedQty:1})).ok,true);
 await second.parts.transitionItem(second.listNo,second.partId,'RECEIVED','',{receivedQty:1});
 const item=second.lists()[0].items[0];
 assert.equal(item.receivedQty,2);
 assert.equal(item.pendingSync,undefined);
 assert.equal(second.serverRows.filter(r=>r.payload.to==='RECEIVED').length,2);
 assert.equal(item.revision,2);
});

test('receipt collision refresh allows the remaining batch and full Supervisor verification',async()=>{
 const first=fixture('Purchaser','PUR001');
 first.serverRows.find(r=>r.event_type==='SPARE_PART_LISTED').payload.qty=3;
 first.serverRows.splice(first.serverRows.findIndex(r=>r.payload.to==='SUPERVISOR_VERIFIED'),1);
 first.parts.hydrateFromServerRows(copy(first.serverRows));
 const second=fixture('Purchaser','PUR002',first.serverRows);
 assert.equal((await first.parts.transitionItem(first.listNo,first.partId,'RECEIVED','',{receivedQty:1})).ok,true);
 assert.equal((await second.parts.transitionItem(second.listNo,second.partId,'RECEIVED','',{receivedQty:1})).ok,false);
 assert.equal(second.lists()[0].items[0].receivedQty,2);
 assert.equal((await second.parts.transitionItem(second.listNo,second.partId,'RECEIVED','',{receivedQty:1})).ok,true);
 assert.equal(second.lists()[0].items[0].receivedQty,3);
 const supervisor=fixture('Supervisor','SUP003',first.serverRows);
 assert.equal((await supervisor.parts.transitionItem(supervisor.listNo,supervisor.partId,'SUPERVISOR_VERIFIED')).ok,true);
 const fresh=fixture('Purchaser','PUR003',first.serverRows);
 assert.equal(fresh.lists()[0].items[0].receivedQty,3);
 assert.equal(fresh.lists()[0].items[0].status,'SUPERVISOR_VERIFIED');
 assert.equal(first.serverRows.filter(r=>r.payload.to==='RECEIVED').length,3);
});

test('offline receipt replay after competing batch refreshes quantity and permits only the remaining batch',async()=>{
 const online=fixture('Purchaser','PUR001');
 online.serverRows.find(r=>r.event_type==='SPARE_PART_LISTED').payload.qty=3;
 online.serverRows.splice(online.serverRows.findIndex(r=>r.payload.to==='SUPERVISOR_VERIFIED'),1);
 online.parts.hydrateFromServerRows(copy(online.serverRows));
 const offline=fixture('Purchaser','PUR002',online.serverRows);
 offline.fail('NETWORK');
 const queued=await offline.parts.transitionItem(offline.listNo,offline.partId,'RECEIVED','',{receivedQty:1});
 assert.equal(queued.ok,true);
 assert.equal(offline.lists()[0].items[0].pendingSync,true);
 assert.equal(offline.window.zukaitV2.queue.pending().length,1);
 assert.equal((await online.parts.transitionItem(online.listNo,online.partId,'RECEIVED','',{receivedQty:1})).ok,true);
 offline.fail(null);await queueFlusher(offline)();
 assert.equal(offline.window.zukaitV2.queue.conflicts().length,1);
 assert.equal(offline.window.zukaitV2.queue.pending().length,0);
 assert.equal(offline.lists()[0].items[0].receivedQty,2);
 assert.equal(offline.lists()[0].items[0].pendingSync,undefined);
 assert.equal((await offline.parts.transitionItem(offline.listNo,offline.partId,'RECEIVED','',{receivedQty:1})).ok,true);
 assert.equal(offline.lists()[0].items[0].receivedQty,3);
 const attempts=offline.commits.length;
 await queueFlusher(offline)();
 assert.equal(offline.commits.length,attempts,'Rejected batch must not retry automatically');
 assert.equal(online.serverRows.filter(r=>r.payload.to==='RECEIVED').length,3);
});

test('queued receipt keeps its pending quantity through hydration and clears it after successful reconnect',async()=>{
 const purchaser=fixture('Purchaser','PUR001');
 purchaser.serverRows.find(r=>r.event_type==='SPARE_PART_LISTED').payload.qty=3;
 purchaser.serverRows.splice(purchaser.serverRows.findIndex(r=>r.payload.to==='SUPERVISOR_VERIFIED'),1);
 purchaser.parts.hydrateFromServerRows(copy(purchaser.serverRows));
 purchaser.fail('NETWORK');
 assert.equal((await purchaser.parts.transitionItem(purchaser.listNo,purchaser.partId,'RECEIVED','',{receivedQty:1})).ok,true);
 await purchaser.parts.hydrateAuthoritativeLists();
 assert.equal(purchaser.lists()[0].items[0].receivedQty,2);
 assert.equal(purchaser.lists()[0].items[0].pendingSync,true);
 assert.equal((await purchaser.parts.transitionItem(purchaser.listNo,purchaser.partId,'RECEIVED','',{receivedQty:1})).reason,'PENDING_SYNC');
 purchaser.fail(null);
 assert.equal((await queueFlusher(purchaser)()).synced,1);
 await purchaser.parts.hydrateAuthoritativeLists();
 assert.equal(purchaser.lists()[0].items[0].receivedQty,2);
 assert.equal(purchaser.lists()[0].items[0].pendingSync,undefined);
 assert.equal(purchaser.lists()[0].items[0].pendingEventId,undefined);
 const fresh=fixture('Supervisor','SUP003',purchaser.serverRows);
 assert.equal(fresh.lists()[0].items[0].receivedQty,2);
 assert.equal((await fresh.parts.transitionItem(fresh.listNo,fresh.partId,'SUPERVISOR_VERIFIED')).reason,'RECEIPT_INCOMPLETE');
});

test('stale quantity correction refreshes the newer part identity and ordered quantity',async()=>{
 const editor=fixture('Supervisor','SUP002');
 editor.serverRows.find(r=>r.event_type==='SPARE_PART_LISTED').payload.qty=3;
 editor.serverRows.splice(editor.serverRows.findIndex(r=>r.payload.to==='SUPERVISOR_VERIFIED'),1);
 editor.parts.hydrateFromServerRows(copy(editor.serverRows));
 for(const [id,value] of Object.entries({
   v2SpEditName:'Head lamp RH',v2SpEditPartNo:'',v2SpEditQty:'3',
   v2SpEditSupplier:'Vendor A',v2SpEditAmount:'',v2SpEditStatus:'RECEIVED',
   v2SpEditReason:'Correct part identity'
 }))editor.elements.set(id,{value});
 editor.onCommit(async event=>{
   if(event.type==='SPARE_PART_SUPERVISOR_CORRECTED'){
     editor.serverRows.push({event_id:'winning-identity',entity_id:editor.partId,actor_id:'M1',
       event_type:'SPARE_PART_MANAGER_CORRECTED',revision:1,server_time:new Date().toISOString(),
       payload:{partId:editor.partId,listNo:editor.listNo,jobCard:editor.jobCard,
         before:{name:'Head lamp RH',qty:3,status:'RECEIVED'},
         after:{name:'Corrected head lamp',qty:4,status:'RECEIVED'}}});
     throw Object.assign(new Error('stale_spare_manager_correction'),{code:'stale_spare_manager_correction'});
   }
 });
 await editor.parts.saveManagerItemEdit(editor.listNo,editor.partId);
 const item=editor.lists()[0].items[0];
 assert.equal(item.name,'Corrected head lamp');assert.equal(item.qty,4);
 assert.equal(item.status,'RECEIVED');assert.equal(item.pendingSync,undefined);
 assert.ok(editor.alerts.some(s=>s.includes('Latest Parts data has been refreshed')));
});

test('stale quotation conflict refreshes the accepted invoice and leaves quotation unchanged',async()=>{
 const purchaser=fixture('Purchaser','PUR001'),supervisor=fixture('Supervisor','SUP003',purchaser.serverRows);
 purchaser.elements.set('v2SpQuote_0',{value:'3.000'});
 purchaser.elements.set('v2SpVendor_0',{value:'Vendor B'});
 purchaser.elements.set('v2SpQuoteMessage',{textContent:''});
 purchaser.onCommit(async event=>{
   if(event.type==='SPARE_PART_COMMERCIAL_UPDATED'){
     assert.equal(event.payload.purchaseAmount,null);
     await supervisor.invoice();
     throw Object.assign(new Error('stale_spare_final_price'),{code:'stale_spare_final_price'});
   }
 });
 const button={dataset:{list:purchaser.listNo,item:purchaser.partId,index:'0'},disabled:false};
 await purchaser.parts.saveQuotationPrice(button);
 assert.equal(button.disabled,false);
 assert.match(purchaser.elements.get('v2SpQuoteMessage').textContent,/Latest Parts data has been refreshed/);
 const item=purchaser.lists()[0].items[0];
 assert.equal(item.purchaseAmount,2.44);assert.equal(item.quoteAmount,2.5);
 assert.equal(item.supplier,'Vendor A');
 purchaser.onCommit(null);await purchaser.parts.saveQuotationPrice(button);
 assert.equal(purchaser.commits.at(-1).payload.purchaseAmount,2.44);
 await supervisor.parts.hydrateAuthoritativeLists();
 assert.equal(supervisor.lists()[0].items[0].purchaseAmount,2.44);
 assert.equal(supervisor.lists()[0].items[0].quoteAmount,3);
 assert.equal(supervisor.parts.reportRows().reduce((n,r)=>n+r.amount,0),2.44);
});

test('queued quotation replay cannot clear an invoice saved before reconnection',async()=>{
 const purchaser=fixture('Purchaser','PUR001'),supervisor=fixture('Supervisor','SUP003',purchaser.serverRows);
 purchaser.elements.set('v2SpQuote_0',{value:'3.000'});
 purchaser.elements.set('v2SpVendor_0',{value:'Vendor B'});
 purchaser.elements.set('v2SpQuoteMessage',{textContent:''});
 const button={dataset:{list:purchaser.listNo,item:purchaser.partId,index:'0'},disabled:false};
 purchaser.fail('NETWORK');await purchaser.parts.saveQuotationPrice(button);
 assert.equal(purchaser.window.zukaitV2.queue.pending().length,1);
 await supervisor.invoice();purchaser.fail(null);
 purchaser.onCommit(async event=>{
   if(event.type==='SPARE_PART_COMMERCIAL_UPDATED'){
     const amount=serverProjection(purchaser.serverRows)[0].items[0].purchaseAmount;
     assert.notEqual(event.payload.purchaseAmount,amount);
     throw Object.assign(new Error('stale_spare_final_price'),{code:'stale_spare_final_price'});
   }
 });
 await queueFlusher(purchaser)();
 assert.equal(purchaser.window.zukaitV2.queue.pending().length,0);
 assert.equal(purchaser.window.zukaitV2.queue.conflicts()[0].syncError,'stale_spare_final_price');
 assert.equal(purchaser.lists()[0].items[0].purchaseAmount,2.44);
 assert.equal(purchaser.lists()[0].items[0].quoteAmount,2.5);
 assert.equal(purchaser.parts.reportRows().reduce((n,r)=>n+r.amount,0),2.44);
});

test('competing quotation saves refresh the losing Purchaser before reviewed retry',async()=>{
 const first=fixture('Purchaser','PUR001'),second=fixture('Purchaser','PUR002',first.serverRows);
 for(const [f,amount,vendor] of [[first,'3.000','Vendor B'],[second,'4.000','Vendor C']]){
   f.elements.set('v2SpQuote_0',{value:amount});f.elements.set('v2SpVendor_0',{value:vendor});
   f.elements.set('v2SpQuoteMessage',{textContent:''});
 }
 const button=f=>({dataset:{list:f.listNo,item:f.partId,index:'0'},disabled:false});
 await first.parts.saveQuotationPrice(button(first));
 await second.parts.saveQuotationPrice(button(second));
 assert.equal(second.lists()[0].items[0].quoteAmount,3);
 assert.equal(second.lists()[0].items[0].supplier,'Vendor B');
 assert.match(second.elements.get('v2SpQuoteMessage').textContent,/Latest Parts data has been refreshed/);
 await second.parts.saveQuotationPrice(button(second));
 const fresh=fixture('Purchaser','PUR003',first.serverRows);
 assert.equal(fresh.lists()[0].items[0].quoteAmount,4);
 assert.equal(fresh.lists()[0].items[0].supplier,'Vendor C');
});

test('quotation rejection after Return or deletion refreshes the Purchaser to final server state',async()=>{
 for(const action of ['return','delete']){
   const purchaser=fixture('Purchaser','PUR001'),manager=fixture('Manager','M1',purchaser.serverRows);
   purchaser.elements.set('v2SpQuote_0',{value:'3.000'});
   purchaser.elements.set('v2SpVendor_0',{value:'Vendor B'});
   purchaser.elements.set('v2SpQuoteMessage',{textContent:''});
   purchaser.onCommit(async event=>{
     if(event.type==='SPARE_PART_COMMERCIAL_UPDATED'){
       if(action==='return')assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'RETURNED','Wrong supplied part')).ok,true);
       else assert.equal((await manager.parts.deleteItem(manager.listNo,manager.partId)).ok,true);
       throw Object.assign(new Error('stale_spare_part_status'),{code:'stale_spare_part_status'});
     }
   });
   const button={dataset:{list:purchaser.listNo,item:purchaser.partId,index:'0'},disabled:false};
   await purchaser.parts.saveQuotationPrice(button);
   assert.equal(button.disabled,false);
   assert.match(purchaser.elements.get('v2SpQuoteMessage').textContent,/Latest Parts data has been refreshed/);
   const item=purchaser.lists().flatMap(l=>l.items).find(i=>i.id===purchaser.partId);
   if(action==='return'){assert.equal(item.status,'RETURNED');assert.equal(item.quoteAmount,undefined);assert.equal(item.purchaseAmount,undefined)}
   else assert.equal(item,undefined);
   assert.equal(purchaser.serverRows.filter(r=>r.event_type==='SPARE_PART_COMMERCIAL_UPDATED').length,1,'Only the original quotation remains in history');
   assert.equal(purchaser.parts.reportRows().reduce((n,r)=>n+r.amount,0),0);
 }
});

test('competing Manager corrections refresh accepted identity after event-ID collision',async()=>{
 const first=fixture('Manager','M1'),second=fixture('Manager','M2',first.serverRows);
 for(const [f,name] of [[first,'First corrected lamp'],[second,'Second corrected lamp']]){
   for(const [id,value] of Object.entries({v2SpEditName:name,v2SpEditPartNo:'',v2SpEditQty:'1',
     v2SpEditSupplier:'Vendor A',v2SpEditAmount:'',v2SpEditStatus:'SUPERVISOR_VERIFIED',v2SpEditReason:'Correct name'}))f.elements.set(id,{value});
 }
 second.onCommit(async event=>{
   if(event.type==='SPARE_PART_MANAGER_CORRECTED')await first.parts.saveManagerItemEdit(first.listNo,first.partId);
 });
 await second.parts.saveManagerItemEdit(second.listNo,second.partId);
 assert.equal(second.lists()[0].items[0].name,'First corrected lamp');
 assert.ok(second.alerts.some(s=>s.includes('Latest Parts data has been refreshed')));
 second.onCommit(null);await second.parts.saveManagerItemEdit(second.listNo,second.partId);
 const fresh=fixture('Manager','M3',first.serverRows);
 assert.equal(fresh.lists()[0].items[0].name,'Second corrected lamp');
});

test('late Manager and Supervisor corrections cannot restore a concurrently deleted part',async()=>{
 for(const role of ['Manager','Supervisor']){
   const editor=fixture(role,role==='Manager'?'M2':'SUP002');
   const manager=fixture('Manager','M1',editor.serverRows);
   for(const [id,value] of Object.entries({v2SpEditName:'Corrected lamp',v2SpEditPartNo:'',v2SpEditQty:'1',
     v2SpEditSupplier:'Vendor A',v2SpEditAmount:'',v2SpEditStatus:'SUPERVISOR_VERIFIED',v2SpEditReason:'Correct name'}))editor.elements.set(id,{value});
   editor.onCommit(async event=>{
     if(event.type.endsWith('_CORRECTED')){
       assert.equal((await manager.parts.deleteItem(manager.listNo,manager.partId)).ok,true);
       throw Object.assign(new Error('stale_spare_manager_correction'),{code:'stale_spare_manager_correction'});
     }
   });
   await editor.parts.saveManagerItemEdit(editor.listNo,editor.partId);
   assert.equal(editor.lists().flatMap(l=>l.items).some(i=>i.id===editor.partId),false,role);
   assert.ok(editor.alerts.some(s=>s.includes('Latest Parts data has been refreshed')));
   assert.equal(editor.serverRows.filter(r=>r.event_type.endsWith('_CORRECTED')).length,0);
   assert.equal(editor.parts.reportRows().reduce((n,r)=>n+r.amount,0),0);
 }
});

test('quantity totals agree across Spare Parts report and monthly dashboard through Return and cancellation',async()=>{
 const manager=fixture('Manager','M1');
 manager.serverRows.find(r=>r.event_type==='SPARE_PART_LISTED').payload.qty=3;
 manager.serverRows.find(r=>r.payload.to==='RECEIVED').payload.receivedQty=3;
 manager.parts.hydrateFromServerRows(copy(manager.serverRows));
 await manager.invoice();
 assert.equal(manager.lists()[0].items[0].purchaseAmount,2.44,'Invoice unit value must remain unchanged');
 assert.equal(manager.parts.reportRows().reduce((n,r)=>n+r.amount,0),7.32);
 assert.equal(manager.parts.managerDashboardSummary().monthSpend,7.32);
 assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'RETURNED','Wrong part')).ok,true);
 assert.equal(manager.parts.reportRows().reduce((n,r)=>n+r.amount,0),0);
 manager.window.prompt=()=> 'Restore mistaken return';await manager.parts.cancelReturn(manager.listNo,manager.partId);
 assert.equal(manager.parts.reportRows().reduce((n,r)=>n+r.amount,0),7.32);
 const fresh=fixture('Manager','M2',manager.serverRows);
 assert.equal(fresh.parts.reportRows().reduce((n,r)=>n+r.amount,0),7.32);
});

test('server timestamps preserve Oman purchase month through Return and cancellation',async()=>{
 const manager=fixture('Manager','M1');
 manager.serverRows.find(r=>r.event_type==='SPARE_PART_LISTED').payload.qty=3;
 manager.serverRows.find(r=>r.payload.to==='RECEIVED').payload.receivedQty=3;
 manager.serverRows.push({event_id:'invoice-month-boundary',entity_id:manager.partId,actor_id:'SUP002',
   event_type:'SPARE_PART_FINAL_PRICE_RECORDED',revision:1,server_time:'2026-09-30T20:00:00Z',
   payload:{partId:manager.partId,listNo:manager.listNo,jobCard:manager.jobCard,finalPrice:2.44}});
 manager.parts.hydrateFromServerRows(copy(manager.serverRows));
 const original=manager.lists()[0].items[0].purchaseRecordedAt;
 assert.equal(original,'2026-09-30T20:00:00.000Z');
 assert.equal(manager.window.zukaitSparePartsOmanDateKey(original),'2026-10-01');
 assert.equal((await manager.parts.transitionItem(manager.listNo,manager.partId,'RETURNED','Wrong part')).ok,true);
 assert.equal(manager.parts.reportRows().reduce((n,r)=>n+r.amount,0),0);
 manager.window.prompt=()=> 'Restore mistaken return';await manager.parts.cancelReturn(manager.listNo,manager.partId);
 const fresh=fixture('Manager','M2',manager.serverRows);
 assert.equal(fresh.lists()[0].items[0].purchaseRecordedAt,original);
 assert.equal(fresh.parts.reportRows().reduce((n,r)=>n+r.amount,0),7.32);
});
