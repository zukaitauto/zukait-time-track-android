import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const store=new Map();
const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
let uuid=0;
const context={window:{},localStorage,console,Date,JSON,Math,Set,Object,String,Number,Array,crypto:{randomUUID:()=>`uuid-${++uuid}`}};
context.window=context;
vm.createContext(context);
for(const file of ['app/src/main/assets/v2/core/event_contract.js','app/src/main/assets/v2/core/offline_queue.js','app/src/main/assets/v2/features/time/work_events.js','app/src/main/assets/v2/core/event_parity.js']){
  vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
}
const {event,queue,work,parity}=context.zukaitV2;
const assignment={id:'A-1',job:'JC-100',emp:'EMP001'};
const at=Date.now();

const start=work.record(work.TYPES.START,assignment,{actorId:'EMP001',clientTime:new Date(at).toISOString(),syncState:'shadow'});
assert.equal(queue.pending().length,1);
queue.enqueue(start);
assert.equal(queue.read().length,1,'duplicate event replay must not duplicate queue row');
assert.equal(parity.compare({type:'START',job:'JC-100',emp:'EMP001',assignmentId:'A-1',at},start).ok,true);

const pause=work.record(work.TYPES.PAUSE,assignment,{actorId:'EMP001',clientTime:new Date(at+60000).toISOString(),syncState:'shadow'});
assert.equal(parity.compare({type:'PAUSE',job:'JC-100',emp:'EMP001',assignmentId:'A-1',at:at+60000},pause).ok,true);

const finish=work.record(work.TYPES.FINISH,assignment,{actorId:'EMP001',clientTime:new Date(at+120000).toISOString(),syncState:'shadow'});
assert.equal(parity.compare({type:'FINISH',job:'JC-100',emp:'EMP001',assignmentId:'A-1',at:at+120000},finish).ok,true);

const hold={id:'H-1',job:'ID001',emp:'EMP002'};
const hs=work.record(work.TYPES.ID001_START,hold,{actorId:'EMP002',clientTime:new Date(at).toISOString(),syncState:'shadow'});
const he=work.record(work.TYPES.ID001_STOP,hold,{actorId:'EMP002',clientTime:new Date(at+30000).toISOString(),syncState:'shadow'});
assert.equal(parity.compare({type:'START',job:'ID001',emp:'EMP002',assignmentId:'H-1',at},hs).ok,true);
assert.equal(parity.compare({type:'STOP_ID001',job:'ID001',emp:'EMP002',assignmentId:'H-1',at:at+30000},he).ok,true);

const persisted=queue.read().length;
const secondContext={window:{},localStorage,console,Date,JSON,Math,Set,Object,String,Number,Array,crypto:{randomUUID:()=>`reload-${++uuid}`}};secondContext.window=secondContext;vm.createContext(secondContext);
vm.runInContext(fs.readFileSync('app/src/main/assets/v2/core/offline_queue.js','utf8'),secondContext);
assert.equal(secondContext.zukaitV2.queue.read().length,persisted,'queue must survive app/page reload');

queue.markSynced(start.eventId,{serverRevision:7,serverTime:new Date(at+5000).toISOString()});
const ack=queue.read().find(x=>x.eventId===start.eventId);
assert.equal(ack.syncState,'synced');
assert.equal(ack.serverRevision,7);

const bad=event.envelope('WORK_START','WRONG',{job:'JC-X',employeeId:'EMP999'});
assert.equal(parity.compare({type:'START',job:'JC-100',emp:'EMP001',assignmentId:'A-1',at},bad).ok,false);

console.log('V2 work event scenarios passed');
