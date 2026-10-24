import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createDatabaseFetch} from '../supabase/functions/workshop-api/database_fetch.js';

// Fake time exercises an actual 8-second commit and a 10-second deadline
// without sleeping or issuing any database mutations.
const nativeSet=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;
let now=0,id=0,calls=0,commits=0;const timers=new Map();
globalThis.setTimeout=(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id};
globalThis.clearTimeout=id=>timers.delete(id);
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
async function advance(ms){const target=now+ms;while(true){const next=[...timers.entries()].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await flush()}now=target;await flush()}
const wait=(ms,signal)=>new Promise((resolve,reject)=>{const timer=setTimeout(resolve,ms);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},{once:true})});
try{
 const send=createDatabaseFetch(async(_url,{signal})=>{calls++;await wait(8000,signal);commits++;return new Response('{"ok":true,"revision":2}',{headers:{'Content-Type':'application/json'}})});
 const pending=send('https://fixture.invalid/rpc/commit',{method:'POST'});await advance(8000);const r=await pending;
 assert.equal(r.status,200);assert.equal((await r.json()).revision,2);assert.equal(calls,1);assert.equal(commits,1);assert.equal(timers.size,0,'one late acknowledgement, no aborted or replayed write');
 const stuck=createDatabaseFetch(async(_url,{signal})=>{calls++;await wait(15000,signal);return new Response('{}')});
 const timeout=stuck('https://fixture.invalid');await advance(10000);const busy=await timeout;assert.equal(busy.status,503);assert.equal((await busy.json()).code,'57014');assert.equal(busy.headers.get('Retry-After'),'5');assert.equal(timers.size,0);
 const bodyStall=createDatabaseFetch(async(_url,{signal})=>({status:200,statusText:'OK',headers:{},arrayBuffer:async()=>{await wait(15000,signal);return new ArrayBuffer(0)}}));
 const body=bodyStall('https://fixture.invalid');await flush();await advance(10000);assert.equal((await body).status,503,'response-body stalls remain bounded');
 const controller=new AbortController(),cancelled=stuck('https://fixture.invalid',{signal:controller.signal});const rejection=assert.rejects(cancelled,e=>e.name==='AbortError');controller.abort();await rejection;assert.equal(timers.size,0,'caller cancellation stays cancellation');
 for(const status of [401,403,409]){let n=0;const result=await createDatabaseFetch(async()=>{n++;return new Response('{"ok":false}',{status})})('https://fixture.invalid');assert.equal(result.status,status);assert.equal(n,1);}
}finally{globalThis.setTimeout=nativeSet;globalThis.clearTimeout=nativeClear;}

const source=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const transport=source.slice(source.indexOf('  // One transport circuit'),source.indexOf('  async function employeeTimeAction'));
let finish;const deadlines=new Map();let timer=0;
const t={Date,Math,Map,AbortController,sessionToken:()=> 'fixture',navigator:{onLine:true},API_URL:'https://fixture.invalid',CLOUD_KEY:'fixture',setTimeout:(fn,ms)=>{deadlines.set(++timer,ms);return timer},clearTimeout:i=>deadlines.delete(i),fetch:()=>new Promise(resolve=>finish=resolve)};
vm.createContext(t);vm.runInContext(transport+';globalThis.api=api',t);
for(const [action,ms] of [['save',45000],['load',45000],['revision',15000]]){const request=t.api({action});assert.deepEqual([...deadlines.values()],[ms]);finish({status:200,json:async()=>({ok:true})});await request;assert.equal(deadlines.size,0)}

const probe=source.slice(source.indexOf('  async function probeRevision()'),source.indexOf('  async function push(retry=0)'));
let clock=100000,reads=0,pulls=0,live=0,warning='';const baseline={jobs:[{no:'12001'}]};
const p={Date:{now:()=>clock},revisionProbeInFlight:false,sessionToken:()=> 'fixture',navigator:{onLine:true},cloudDirty:false,cloudPushing:false,lastProbedRevision:1,cloudRevision:1,lastRevisionProbeAt:0,lastSuccessfulSyncAt:1,lastSyncedState:baseline,pollWarnings:new Set(),setServerConnection:s=>warning=s,status(){},initialDone:true,lastSyncError:'',consecutiveSyncErrors:0,api:async()=>{reads++;return {ok:true,revision:1}},pull:async()=>{pulls++},push:async()=>{},liveRole:()=>true,pullLiveStatus:async()=>{live++},warnPoll(){}};
vm.createContext(p);vm.runInContext(probe,p);
for(let i=0;i<100;i++){clock+=1000;await p.probeRevision()}
assert.equal(reads,100);assert.equal(pulls,0,'an acknowledged unchanged revision must not reload the whole workshop');assert.equal(live,0,'independent live polling retains its own cadence');assert.equal(p.lastSuccessfulSyncAt,clock);assert.equal(p.lastSyncedState,baseline);
p.lastSyncedState=null;clock+=1000;await p.probeRevision();assert.equal(pulls,1,'cold-start cache cannot substitute for a confirmed baseline');
p.lastSyncedState=baseline;p.api=async()=>({ok:true,revision:2});clock+=1000;await p.probeRevision();assert.equal(pulls,2,'changed workshop revision still loads');
p.api=async()=>{throw Error('database_busy')};clock+=1000;await p.probeRevision();assert.equal(warning,'busy');assert.equal(p.lastSyncError,'database_busy');assert.equal(p.lastSyncedState,baseline);
console.log('PASS: late commits acknowledged once, bounded stalled reads/bodies, preserved cancellation/permissions, coordinated client deadlines, unchanged-revision read reduction and genuine-outage warning.');
