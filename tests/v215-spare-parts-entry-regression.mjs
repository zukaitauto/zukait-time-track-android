import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const main = fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js', 'utf8');
const api = fs.readFileSync('supabase/functions/workshop-api/index.ts', 'utf8');
const guard = api.slice(api.indexOf('    if (action === "v2_commit_event") {'), api.indexOf('      const { data, error } = await admin.rpc("zukait_v2_commit_event"'));
// Execute the actual API authorization and payload rules against UI-generated events.
const validate = new Function('body', 'user', `const action='v2_commit_event'; const reply=(result,status)=>({...result,status}); ${guard} return {ok:true}; }`);
const LIST_KEY = 'zukait_v2_spare_parts_lists_v1';
const DRAFT_KEY = 'zukait_v2_parts_create_draft_v1';
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(userRole = 'Supervisor', userId = 'SUP002') {
  const storage = new Map(), elements = new Map(), alerts = [], commits = [];
  const listNo = 'PL001', jobCard = 'JC101', partId = 'SP-existing';
  const serverRows = [
    {event_id:'spare-list-PL001-1',entity_id:listNo,actor_id:'SUP001',event_type:'SPARE_PART_LIST_CREATED',revision:1,server_time:'2026-09-30T06:00:00Z',payload:{partId:listNo,listNo,jobCard,vehicle:'Toyota',model:'Corolla',year:'2012',registration:'101 A',customer:'Cash',targetRole:'Purchaser'}},
    {event_id:'spare-item-'+partId,entity_id:partId,actor_id:'SUP001',event_type:'SPARE_PART_LISTED',revision:1,server_time:'2026-09-30T06:00:01Z',payload:{partId,listNo,jobCard,name:'Head lamp RH',partNo:'',qty:1,targetRole:'Purchaser'}},
    {event_id:'spare-quote-'+partId,entity_id:partId,actor_id:'PUR001',event_type:'SPARE_PART_COMMERCIAL_UPDATED',revision:1,server_time:'2026-09-30T06:00:02Z',payload:{partId,listNo,jobCard,quoteAmount:2.5,purchaseAmount:null,supplier:'Vendor A'}},
    {event_id:'spare-status-'+partId+'-1',entity_id:partId,actor_id:'PUR001',event_type:'SPARE_PART_STATUS_CHANGED',revision:1,server_time:'2026-09-30T06:00:03Z',payload:{partId,listNo,jobCard,from:'ORDERED',to:'RECEIVED',receivedQty:1}},
    {event_id:'spare-status-'+partId+'-2',entity_id:partId,actor_id:'SUP001',event_type:'SPARE_PART_STATUS_CHANGED',revision:2,server_time:'2026-09-30T06:00:04Z',payload:{partId,listNo,jobCard,from:'RECEIVED',to:'SUPERVISOR_VERIFIED'}}
  ];
  const localStorage = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  let html = '', failure = null;
  const window = {
    me:{id:userId,role:userRole}, confirm:()=>true, prompt:()=>null,
    openModal:value=>{html=value},
    jd:()=>({no:jobCard,make:'Toyota',model:'Corolla',year:'2012',reg:'101 A'}),
    zukaitV2:{reports:{page:async()=>({rows:copy(serverRows),source:'server',nextCursor:null})}},
    zukaitCloud:{
      allocateSparePartList:async()=>({list_no:listNo,job_card:jobCard,status:'OPEN',created_by:'SUP001',created_at:'2026-09-30T06:00:00Z'}),
      v2CommitEvent:async event=>{
        commits.push(copy(event));
        if(failure)throw Object.assign(new Error(failure),{code:failure});
        const result=validate({event},window.me);
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
    assert.deepEqual(Object.keys(e.payload).sort(),['finalPrice','jobCard','listNo','partId']);
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
  const f=fixture();f.setItem({purchaseAmount:3,purchaseAmountRevision:4});f.fail('event_id_conflict');
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
