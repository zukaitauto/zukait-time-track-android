import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const transport=source.slice(source.indexOf('  // One transport circuit'),source.indexOf('  async function employeeTimeAction'));
let now=100000,calls=0,response={status:500,body:{ok:false,code:'server_error'}};
const timers=new Map();let timerId=0;
const c={Date:{now:()=>now},Math:Object.assign(Object.create(Math),{random:()=>0}),Map,AbortController,
  sessionToken:()=> 'fixture-only',navigator:{onLine:true},API_URL:'https://fixture.invalid',CLOUD_KEY:'fixture',
  setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)},
  fetch:async()=>{calls++;const r=response;if(r instanceof Error)throw r;return {status:r.status,headers:{get:()=>null},json:async()=>{if(r.body instanceof Error)throw r.body;return r.body}}}};
vm.createContext(c);vm.runInContext(transport+';globalThis.transport=api;',c);
const api=c.transport;
assert.equal((await api({action:'save'}))._status,500);
assert.equal(api.retryAfter('save'),2000);
for(let i=0;i<50;i++)await assert.rejects(()=>api({action:i%2?'revision':'save'}),e=>e.code==='SYNC_BACKOFF');
assert.equal(calls,1,'poll/focus/reconnect cannot bypass the shared transport cooldown');
now+=2000;
await api({action:'save'});assert.equal(api.retryAfter('save'),4000,'outage grows backoff');
now+=4000;response={status:200,body:{ok:true,revision:2}};
await api({action:'revision'});
assert.equal(api.retryAfter('save'),0);
response={status:500,body:{ok:false,code:'server_error'}};
await api({action:'save'});assert.equal(api.retryAfter('save'),8000,'healthy reads cannot reset failing write history');
now+=8000;response={status:200,body:{ok:true,server_revision:3}};
await api({action:'save'});assert.equal(api.retryAfter('save'),0);
response={status:403,body:{ok:false,code:'forbidden'}};
await api({action:'save'});assert.equal(api.retryAfter('save'),0,'permissions are not outage retries');
response={status:200,body:new SyntaxError('bad JSON')};
await assert.rejects(()=>api({action:'load'}),e=>e.code==='INVALID_SERVER_RESPONSE'&&e.httpStatus===502);
assert.ok(api.retryAfter('revision')>0,'malformed responses back off too');
now+=2000;response=new TypeError('network failure');
await assert.rejects(()=>api({action:'revision'}),e=>e.code==='NETWORK');
assert.ok(api.retryAfter('revision')>0);
assert.equal(timers.size,0,'transport deadline always cleaned up');

// In-flight reads may finish out of order during an outage.
now+=10000;response={status:200,body:{ok:true}};await api({action:'revision'});
let oldResolve,newResolve;
c.fetch=async()=>{calls++;return new Promise(resolve=>{if(!oldResolve)oldResolve=resolve;else newResolve=resolve})};
const oldRead=api({action:'revision'}),newRead=api({action:'load'});
newResolve({status:500,headers:{get:()=>null},json:async()=>({ok:false,code:'server_error'})});await newRead;
oldResolve({status:200,json:async()=>({ok:true,revision:1})});await oldRead;
assert.ok(api.retryAfter('revision')>0,'late success cannot erase a newer outage');

// Execute actual save handler: queue survives a server failure and a later
// acknowledgement clears the sticky banner without requiring another load.
const prefix=source.slice(source.indexOf('  const API_URL'),source.indexOf('  let cloudRevision='));
const push=source.slice(source.indexOf('  async function push(retry=0)'),source.indexOf('  window.cloudScheduleSave='));
const storage=new Map();let connection='',sendCount=0,reply={_status:500,code:'server_error'};
const p={me:{id:'QA_MANAGER',role:'Manager'},state:{jobs:[{no:'QA_JOB',cashAmount:20}]},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  cloudPushing:false,cloudDirty:true,cloudRevision:1,dirtyGeneration:1,navigator:{onLine:true},
  sessionToken:()=>true,status(){},payloadState:()=>structuredClone(p.state),clone:structuredClone,
  lastSyncError:'',consecutiveSyncErrors:0,lastSuccessfulSyncAt:0,lastSyncedState:null,
  setServerConnection:kind=>connection=kind,console:{error(){}},pushTimer:null,
  setTimeout(){},clearTimeout(){},scheduleDashboardRender(){},api:async()=>{sendCount++;return reply;}};
vm.createContext(p);vm.runInContext(prefix+push,p);
await p.push();assert.equal(connection,'busy');assert.equal(p.cloudDirty,true);
assert.equal(JSON.parse(storage.get('zukait_cloud_pending_conflict_v42')).data.jobs[0].cashAmount,20);
p.api.retryAfter=()=>2000;
for(let i=0;i<30;i++)await p.push();assert.equal(sendCount,1,'save callers respect transport deadline');
p.api.retryAfter=()=>0;reply={ok:true,server_revision:2};
await p.push();assert.equal(connection,'connected');assert.equal(p.cloudDirty,false);
assert.equal(storage.has('zukait_cloud_pending_conflict_v42'),false);
assert.ok(p.lastSuccessfulSyncAt>0);assert.equal(p.lastSyncError,'');
const ui={pill:{dataset:{}},banner:{}};
const u={serverConnectionState:'connected',serverConnectionEverConfirmed:true,serverConnectionBannerTimer:null,
  ensureServerConnectionUi:()=>ui,setTimeout(){},clearTimeout(){},window:{dispatchEvent(){}},CustomEvent:class{}};
vm.createContext(u);vm.runInContext(source.slice(source.indexOf('  function setServerConnection('),source.indexOf('  window.zukaitServerConnection=')),u);
u.setServerConnection('busy');assert.match(ui.pill.textContent,/Sync Delayed/);
assert.match(ui.banner.textContent,/sync is delayed/);assert.doesNotMatch(ui.banner.textContent,/cannot be reached/);
assert.match(ui.banner.className,/banner-busy/);
u.setServerConnection('connected');assert.match(ui.banner.textContent,/restored/);
console.log('PASS: shared outage cooldown, bounded retry load, read/write recovery isolation, queue preservation and successful-save banner recovery.');
