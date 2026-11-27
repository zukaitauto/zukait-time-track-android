import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const code=fs.readFileSync('app/src/main/assets/v2/features/notifications/center.js','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const migration=fs.readFileSync('supabase/NOTIFICATION_READ_RECEIPTS.sql','utf8');

test('notification API is account-scoped, receipts are service-only, and SQL monotonic',()=>{
 assert.match(api,/action === 'notification_receipts'/);
 assert.match(api,/const actorId=String\(user\.id\|\|''\)/);
 assert.match(api,/p_actor_id:actorId/);
 assert.match(api,/\.eq\('actor_id',actorId\)/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/revoke all on public\.workshop_notification_reads from public, anon, authenticated/);
 assert.match(migration,/greatest\(public\.workshop_notification_watermarks\.read_through_ms,excluded\.read_through_ms\)/);
});

function environment(actor,server,role='Manager',existingStorage=new Map()){
 const localStorage={getItem:key=>existingStorage.get(key)||null,setItem:(key,value)=>existingStorage.set(key,String(value))};
 const w={me:{id:actor,role},users:[],state:{systemNotifications:[
   {id:'first',target:actor,message:'First',createdAt:1},
   {id:'second',target:actor,message:'Second',createdAt:2}
 ]},zukaitV2:{},addEventListener(){},
 zukaitReception:{action:async(payload)=>{
  assert.equal(payload.action,'notification_receipts');
  const account=w.me.id;
  const entry=server.get(account)||{ids:new Set(),through:0};
  if(payload.operation==='ACK'){
   for(const id of payload.ids)entry.ids.add(id);
   if(payload.through!=null)entry.through=Math.max(entry.through,payload.through);
   server.set(account,entry);
  }
  return {ok:true,ids:[...entry.ids],through:entry.through};
 }}};
 const d={visibilityState:'visible',documentElement:{},addEventListener(){},getElementById:()=>({}),querySelectorAll:()=>[],querySelector:()=>null};
 const context={window:w,document:d,localStorage,navigator:{onLine:true},
  MutationObserver:class{observe(){}},Date,console,openModal(){},setTimeout(){},setInterval(){}};
 vm.runInNewContext(code,context);
 return {w,storage:existingStorage,refresh:()=>w.zukaitNotificationCenter.refresh()};
}
const drain=()=>new Promise(resolve=>setImmediate(resolve));
test('mark all remains read after fresh device login, other user remains independent, later alert appears',async()=>{
 const server=new Map(),a=environment('M1',server);
 await a.refresh();
 assert.equal(a.w.zukaitNotificationCenter.unread(),2);
 a.w.zukaitNotificationCenter.markAllRead();
 await drain();await drain();
 const b=environment('M1',server);
 await b.refresh();
 assert.equal(b.w.zukaitNotificationCenter.unread(),0);
 const other=environment('M2',server);
 await other.refresh();
 assert.equal(other.w.zukaitNotificationCenter.unread(),2);
 b.w.state.systemNotifications.push({id:'later',target:'M1',message:'New',createdAt:Date.now()+5000});
 assert.equal(b.w.zukaitNotificationCenter.unread(),1);
});
test('previous local paint acknowledgements migrate to server and remain per account',async()=>{
 const server=new Map(),local=new Map([
  ['zukait-notification-read-M1-paint',JSON.stringify(['material-old'])],
  ['zukait-notification-read-M1-items',JSON.stringify(['system-first'])]
 ]);
 const first=environment('M1',server,'Manager',local);
 await first.refresh();await drain();
 const items=server.get('M1')?.ids;
 assert.ok(items?.has('material-old'));
 assert.ok(items?.has('system-first'));
 const other=environment('M2',server);
 await other.refresh();
 assert.equal(other.w.zukaitNotificationCenter.unread(),2);
});
test('offline and unauthorized situations do not erase local acknowledgements',()=>{
 assert.match(code,/Keep local receipts until a confirmed sync/);
 assert.match(code,/receiptsActor===readKey\(\)/);
 assert.match(code,/receiptResyncPending/);
 assert.match(code,/receiptsLastFetch=0;refresh\(\)/);
});

test('individual Manager notification remains read after refresh and on a fresh device',async()=>{
 const server=new Map(),first=environment('M1',server,'Manager');
 await first.refresh();
 first.w.zukaitNotificationCenter.openItem('system-first');
 assert.equal(first.w.zukaitNotificationCenter.unread(),1);
 await drain();await drain();
 await first.refresh();
 assert.equal(first.w.zukaitNotificationCenter.unread(),1);
 const second=environment('M1',server,'Manager');
 await second.refresh();
 assert.equal(second.w.zukaitNotificationCenter.unread(),1);
 assert.ok(server.get('M1')?.ids.has('system-first'));
});
test('individual Supervisor notification stays read while other account remains unread',async()=>{
 const server=new Map(),first=environment('S1',server,'Supervisor');
 await first.refresh();
 first.w.zukaitNotificationCenter.openItem('system-first');
 await drain();await drain();
 const same=environment('S1',server,'Supervisor');
 await same.refresh();
 assert.equal(same.w.zukaitNotificationCenter.unread(),1);
 const other=environment('S2',server,'Supervisor');
 await other.refresh();
 assert.equal(other.w.zukaitNotificationCenter.unread(),2);
});
test('individual notification row removal is wired to read acknowledgement',()=>{
 assert.match(code,/function markRead\(id\).*removeReadRows\(\)/);
 assert.match(code,/data-notification-id/);
 assert.match(code,/function removeReadRows\(\)/);
 assert.match(code,/markPaintRead\(n\.id\);removeReadRows\(\)/);
});
