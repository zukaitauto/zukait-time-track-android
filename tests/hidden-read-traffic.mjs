import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=fs.readFileSync('app/src/main/assets/v2/features/notifications/center.js','utf8');
const events={},windowEvents={},timers=[];let reads=0,hydrated=0;
const document={visibilityState:'hidden',addEventListener:(n,f)=>events[n]=f,querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>({}),documentElement:{}};
const window={me:{id:'S',role:'Supervisor'},state:{},addEventListener:(n,f)=>windowEvents[n]=f,zukaitV2:{reports:{page:async()=>{reads++;return {rows:[],source:'server',nextCursor:null}}},sparePartsMain:{hydrateFromServerRows:()=>hydrated++}}};
const ctx={window,document,navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){}},MutationObserver:class{observe(){}},setTimeout:f=>timers.push(f),setInterval:f=>timers.push(f),Date,console};
vm.runInNewContext(code,ctx);
for(let i=0;i<20;i++)await window.zukaitNotificationCenter.refresh();
assert.equal(reads,0,'hidden periodic refresh must not download report history');
document.visibilityState='visible';events.visibilitychange();await new Promise(r=>setImmediate(r));
assert.equal(reads,1,'returning to the app immediately refreshes notifications');assert.equal(hydrated,1);
await window.zukaitNotificationCenter.refresh();assert.equal(reads,2,'foreground refresh still works');
ctx.navigator.onLine=false;await window.zukaitNotificationCenter.refresh();assert.equal(reads,2,'offline refresh makes no request');
ctx.navigator.onLine=true;window.me=null;await window.zukaitNotificationCenter.refresh();assert.equal(reads,2,'login screen makes no report request');
const cloud=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const start=cloud.indexOf('  function beginPolling('),end=cloud.indexOf('  async function init(',start);
let probes=0,live=0,backoff=0,changed=false;const tasks=[];
const c={document:{visibilityState:'hidden'},pollGeneration:1,pollActive:false,pollTimer:null,livePollTimer:null,revisionProbeInFlight:false,liveStatusLastFetchedAt:0,Date:{now:()=>100000},
Math:Object.assign(Object.create(Math),{random:()=>0}),api:{retryAfter:()=>backoff},clearTimeout(){},setTimeout:(fn,ms)=>(tasks.push({fn,ms}),tasks.length),
sessionToken:()=>true,navigator:{onLine:true},probeRevision:async()=>{probes++;return changed},pullLiveStatus:async()=>live++,liveRole:()=>true};
vm.createContext(c);vm.runInContext(cloud.slice(start,end)+'beginPolling(1);',c);
assert.equal(tasks[0].ms,120000);await tasks[0].fn();await tasks[1].fn();assert.equal(probes,0,'hidden periodic revision reads are paused');assert.equal(live,0,'hidden periodic live reads are paused');
c.document.visibilityState='visible';vm.runInContext('beginPolling(++pollGeneration);',c);const fresh=tasks.slice(-2);assert.equal(fresh[0].ms,5000);assert.equal(fresh[1].ms,15000);
await fresh[0].fn();assert.equal(tasks.at(-1).ms,5000);
await tasks.at(-1).fn();await tasks.at(-1).fn();assert.equal(tasks.at(-1).ms,8000,'quiet foreground adapts to slower polling');
changed=true;await tasks.at(-1).fn();assert.equal(tasks.at(-1).ms,5000,'changed revision restores faster polling');
backoff=45000;await tasks.at(-1).fn();assert.equal(tasks.at(-1).ms,45000,'server retry deadline governs next poll');
await fresh[1].fn();assert.equal(live,0,'live polling respects cooldown');assert.equal(tasks.at(-1).ms,45000);
backoff=0;c.revisionProbeInFlight=true;await tasks.at(-1).fn();assert.equal(live,0,'live refresh cannot overlap revision probe');
c.revisionProbeInFlight=false;await tasks.at(-1).fn();assert.equal(live,1);
assert.equal(tasks.at(-1).ms,15000,'normal live cadence retained');
c.liveStatusLastFetchedAt=98000;await tasks.at(-1).fn();assert.equal(live,1,'recent live status skips scheduled read');assert.equal(tasks.at(-1).ms,5000,'skipped read rescheduled at freshness expiry');
c.liveStatusLastFetchedAt=93000;await tasks.at(-1).fn();assert.equal(live,2,'expired live status fetched');assert.equal(tasks.at(-1).ms,15000,'normal cadence resumes');
const previous=probes;await tasks[0].fn();assert.equal(probes,previous,'old-generation timer cannot duplicate polling');
assert.match(cloud,/if\(cloudDirty&&!cloudPushing\)await push\(0\)/,'resume flushes queued actions');
assert.match(cloud,/if\(document.visibilityState==='visible'\)refreshVisibleSharedState\(\)/,'visibility resume retains immediate shared-state refresh');
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');assert.match(html,/cloud_sync\.js\?v=2026112501/);assert.match(html,/notifications\/center\.js\?v=20261110-server-receipts/);
console.log('Hidden read traffic: no hidden report/live requests, foreground cadence, resume, offline/login and timer generation passed.');

// Exercise the actual live reader, not only the scheduler stub.
const liveStart=cloud.indexOf('  async function pullLiveStatus('),liveEnd=cloud.indexOf('  function payloadState(',liveStart);
let now=100000,requests=0;
const lc={Date:{now:()=>now},liveStatusLastFetchedAt:now-1000,sessionEpoch:1,liveInFlight:false,sessionToken:()=>true,navigator:{onLine:true},liveRole:()=>true,api:async()=>{requests++;return {ok:true,revision:1,rows:[]}},stale:()=>false,liveStatusRevision:0,liveStatusRows:[],liveStatusServerTime:0,pollWarnings:new Set(),publishLiveStatus(){},warnPoll(){}};
vm.createContext(lc);vm.runInContext(cloud.slice(liveStart,liveEnd),lc);
await vm.runInContext('pullLiveStatus(true)',lc);assert.equal(requests,0,'scheduled read reuses recent confirmed live status');
await vm.runInContext('pullLiveStatus()',lc);assert.equal(requests,1,'explicit refresh is never suppressed');
now+=7000;await vm.runInContext('pullLiveStatus(true)',lc);assert.equal(requests,2,'expired live status is refreshed');
lc.liveStatusLastFetchedAt=0;await vm.runInContext('pullLiveStatus(true)',lc);assert.equal(requests,3,'new session must fetch');

// Conditional report reads and session isolation.
const reportStart=cloud.indexOf('  async function readLatest()'),reportEnd=cloud.indexOf('  let monthlyReadInFlight=',reportStart);
const calls=[],pending=[];
const rc={navigator:{onLine:true},sessionEpoch:1,readLatestInFlight:null,confirmedReadState:null,confirmedReadRevision:-1,clone:x=>JSON.parse(JSON.stringify(x)),api:p=>{calls.push(p);return new Promise(resolve=>pending.push(resolve))}};
rc.stale=e=>e!==rc.sessionEpoch;
vm.createContext(rc);vm.runInContext(cloud.slice(reportStart,reportEnd),rc);
const read=()=>vm.runInContext('readLatest()',rc);
let first=read(),duplicate=read();assert.equal(calls.length,1);assert.equal(calls[0].known_revision,undefined);
pending.shift()({ok:true,revision:4,data:{jobs:[{id:'A'}]}});await Promise.all([first,duplicate]);
let repeat=read();assert.equal(calls.at(-1).known_revision,4);pending.shift()({ok:true,revision:4,not_modified:true});assert.equal((await repeat).data.jobs[0].id,'A');
let changedRead=read();pending.shift()({ok:true,revision:5,data:{jobs:[{id:'B'}]}});assert.equal((await changedRead).data.jobs[0].id,'B');
let invalid=read();pending.shift()({ok:true,revision:6,not_modified:true});await assert.rejects(invalid,/INVALID_NOT_MODIFIED/);
let old=read();const oldRejected=assert.rejects(old,/STALE_SESSION/);rc.sessionEpoch++;rc.readLatestInFlight=null;rc.confirmedReadState=null;rc.confirmedReadRevision=-1;
let current=read();assert.equal(calls.at(-1).known_revision,undefined);pending.shift()({ok:true,revision:5,data:{jobs:[{id:'OLD'}]}});await oldRejected;
let currentDuplicate=read();assert.equal(pending.length,1,'old request cannot clear new single-flight');pending.shift()({ok:true,revision:6,data:{jobs:[{id:'NEW'}]}});assert.equal((await current).data.jobs[0].id,'NEW');assert.equal((await currentDuplicate).data.jobs[0].id,'NEW');
console.log('Conditional report downloads and account switching passed');
