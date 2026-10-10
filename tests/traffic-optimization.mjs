import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {trafficMeter} from './helpers/traffic-meter.mjs';

const baseline=process.env.TRAFFIC_BASELINE_REF||'26163d2a6f7bbcaa464ed7c2e4426ac1b31fc5d4';
const paths={cloud:'app/src/main/assets/cloud_sync.js',notifications:'app/src/main/assets/v2/features/notifications/center.js'};
const read=(path,before)=>before?(process.env.TRAFFIC_BASELINE_DIR?fs.readFileSync(`${process.env.TRAFFIC_BASELINE_DIR}/${path}`,'utf8'):execFileSync('git',['show',`${baseline}:${path}`],{encoding:'utf8'})):fs.readFileSync(path,'utf8');
const slice=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert.ok(start>=0&&end>start);return s.slice(start,end)};
const fixture={jobs:Array.from({length:1000},(_,i)=>({no:`JC${i}`,vehicle:'Synthetic vehicle',registration:`QA${i}`,status:'Active',notes:'x'.repeat(120)})),assign:[],leaves:[]};
const events=Array.from({length:1000},(_,i)=>({event_id:`E${i}`,event_type:'SPARE_PART_LISTED',sort_time:'2026-10-10T00:00:00Z',payload:{listNo:`PL${i}`,name:'Synthetic part',jobCard:`JC${i}`,targetRole:'Purchaser'}}));

function cloud(before){
  const source=read(paths.cloud,before);let clock=100000,serverRevision=1,warnings=0;
  const meter=trafficMeter(async(_url,opts)=>{
    const p=JSON.parse(opts.body);return new Response(JSON.stringify({ok:true,revision:serverRevision,...(p.action==='load'?{data:fixture}:p.action==='live_status'?{rows:[],server_time:clock}:{server_time:clock})}));
  });
  const c={cloudRevision:1,cloudDirty:false,cloudPushing:false,pullInFlight:false,revisionProbeInFlight:false,liveInFlight:false,
    lastRevisionProbeAt:0,lastProbedRevision:-1,lastVisibleSyncAt:0,initialDone:true,lastSyncedState:structuredClone(fixture),state:structuredClone(fixture),dirtyGeneration:0,
    cloudApplying:false,lastSuccessfulSyncAt:0,lastSyncError:'',consecutiveSyncErrors:0,conflictAlerted:false,
    liveStatusRows:[],liveStatusRevision:1,liveStatusLastFetchedAt:0,liveStatusServerTime:0,
    API_URL:'https://synthetic.invalid',CLOUD_KEY:'qa',REV_KEY:'revision',navigator:{onLine:true},document:{visibilityState:'visible'},
    me:{id:'QA',role:'Manager'},window:{},localStorage:{setItem(){}},sessionToken:()=> 'synthetic',status(){},setServerConnection(){},
    clone:structuredClone,normalizeRemote(data){c.state=structuredClone(data)},scheduleDashboardRender(){},publishLiveStatus(){},
    push:async()=>{c.cloudDirty=false},liveRole:()=>true,Date:{now:()=>clock},AbortController,setTimeout,clearTimeout,
    fetch:meter.fetch.bind(meter),console:{warn(){warnings++},error(){warnings++}},pollWarnings:new Map()};
  vm.createContext(c);
  const code=slice(source,'  async function api(payload){','  async function employeeTimeAction')+
    slice(source,'  async function pullLiveStatus(){','  function payloadState')+
    slice(source,'  async function pull(force){','  async function push(')+
    slice(source,'  async function refreshVisibleSharedState(){',"  document.addEventListener('visibilitychange'");
  if(!before)vm.runInContext(slice(source,'  function warnPoll(', '  function ensureServerConnectionUi'),c);
  vm.runInContext(code+';this.probe=probeRevision;this.focus=refreshVisibleSharedState;this.live=pullLiveStatus;',c);
  return {c,meter,tick(ms=1000){clock+=ms},change(){serverRevision++},warnings:()=>warnings};
}

async function cloudScenario(before,changed=false){
  const h=cloud(before);
  for(let i=0;i<60;i++){
    h.tick();if(changed&&i===30)h.change();
    if(i%10===0)await h.c.focus();
    await h.c.probe();
    if(i%15===0)await h.c.live();
  }
  assert.equal(h.c.cloudRevision,changed?2:1);
  assert.equal(JSON.stringify(h.c.state),JSON.stringify(fixture));
  return {actions:h.meter.actions,...h.meter.totals()};
}

function notifications(before,role='Purchaser'){
  let clock=100000,hydrated=[],pageGate=null;
  const meter=trafficMeter(async(_url,opts)=>{
    if(pageGate)await pageGate;
    const p=JSON.parse(opts.body),offset=Number(p.cursor||0);
    return new Response(JSON.stringify({rows:events.slice(offset,offset+500),nextCursor:offset===0?500:null,source:'server'}));
  });
  const reportPage=async(_type,opts)=> (await meter.fetch('https://synthetic.invalid',{body:JSON.stringify({action:'v2_report_page',...opts})})).json();
  const c={window:{me:{id:'QA',role},state:{},zukaitV2:{reports:{page:reportPage}},addEventListener(){},refreshManagerSparePartsSummary(){}},
    document:{visibilityState:'visible',head:{appendChild(){}},createElement:()=>({}),addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>null,documentElement:{}},
    navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){}},MutationObserver:class{observe(){}},setTimeout(){},setInterval(){},Date:{now:()=>clock,parse:Date.parse},console};
  // Run the real existing paginated hydrator with a synthetic storage sink.
  const main=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
  c.reconcileSyncMarkers=()=>{};c.read=()=>hydrated;c.hydrateFromServerRows=rows=>{hydrated=rows;return rows};
  vm.createContext(c);vm.runInContext(slice(main,'async function hydrateAuthoritativeLists(', 'async function loadAuthoritativeManagerReport('),c);
  c.window.zukaitV2.sparePartsMain={hydrateAuthoritativeLists:c.hydrateAuthoritativeLists,hydrateFromServerRows:c.hydrateFromServerRows,reportRows:()=>hydrated};
  vm.runInContext(read(paths.notifications,before),c);
  return {c,meter,api:c.window.zukaitNotificationCenter,tick(ms){clock+=ms},hydrated:()=>hydrated,gate(p){pageGate=p}};
}

async function notificationScenario(before,hidden,role){
  const h=notifications(before,role);h.c.document.visibilityState=hidden?'hidden':'visible';
  for(let i=0;i<12;i++){await h.api.refresh();h.tick(5000)}
  assert.equal(h.hydrated().length,1000);assert.equal(h.api.all().length,role==='Purchaser'?1000:0);
  const contentHash=createHash('sha256').update(JSON.stringify({rows:h.hydrated(),notifications:h.api.all()})).digest('hex');
  return {actions:h.meter.actions,...h.meter.totals(),contentHash};
}

const scenarios=[];
for(const [name,fn] of [
  ['60s foreground, 6 focus events, unchanged',b=>cloudScenario(b)],
  ['60s foreground, 6 focus events, remote revision at 30s',b=>cloudScenario(b,true)],
  ...['Purchaser','Manager','Supervisor','Employee','Receptionist'].flatMap(role=>[
    [`${role}: 60s visible notifications, 1000 events`,b=>notificationScenario(b,false,role)],
    [`${role}: 60s hidden notifications, 1000 events`,b=>notificationScenario(b,true,role)]])
]){
  const before=await fn(true),after=await fn(false);
  if(before.contentHash)assert.equal(after.contentHash,before.contentHash,'notification contents and reducer input must remain identical');
  scenarios.push({name,before,after,requestSavingsPct:+((1-after.requests/before.requests)*100).toFixed(2),responseSavingsPct:+((1-after.responseBytes/before.responseBytes)*100).toFixed(2)});
}

// Overlapping event refreshes share work; errors release the lock.
const n=notifications(false);let release;const gate=new Promise(r=>release=r);n.gate(gate);
const active=n.api.refresh();await n.api.refresh();assert.equal(n.meter.totals().requests,1);release();await active;
assert.equal(n.meter.totals().requests,2);n.gate(null);await n.api.refresh();assert.equal(n.meter.totals().requests,4);
// A failed or truncated history never overwrites the cache with a partial set.
const prior=n.hydrated();n.c.window.zukaitV2.reports.page=async()=>({rows:[events[0]],nextCursor:'more',source:'server'});
await n.api.refresh();assert.equal(n.hydrated(),prior);
n.c.window.zukaitV2.reports.page=async()=>{throw Error('QA failure')};await n.api.refresh();
n.c.window.zukaitV2.reports.page=async()=>({rows:events,nextCursor:null,source:'server'});await n.api.refresh();assert.equal(n.hydrated().length,1000);
// Same warning once per minute; different failure and recovery remain visible.
const h=cloud(false);h.c.fetch=async()=>{throw Error('failure')};
for(let i=0;i<60;i++){await h.c.probe();h.tick()};assert.equal(h.warnings(),1);
await h.c.probe();assert.equal(h.warnings(),2);
h.c.fetch=h.meter.fetch.bind(h.meter);await h.c.probe();h.tick();h.c.fetch=async()=>{throw Error('failure')};await h.c.probe();assert.equal(h.warnings(),3);
// Offline checks send nothing and do not apply server data.
const off=cloud(false);off.c.navigator.onLine=false;await off.c.focus();await off.c.probe();await off.c.live();assert.equal(off.meter.totals().requests,0);

// Execute the real scheduler with a deterministic clock, including lifecycle races.
const cloudSource=read(paths.cloud,false);
let timerNow=0,timerId=0,probes=0,lives=0;const timers=new Map();
const scheduler={pollGeneration:1,pollActive:false,pollTimer:null,livePollTimer:null,pushTimer:null,dashboardRenderTimer:null,
  document:{visibilityState:'visible'},navigator:{onLine:true},sessionToken:()=>true,liveRole:()=>true,
  probeRevision:async()=>{probes++},pullLiveStatus:()=>{lives++},
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,at:timerNow+ms});return id},clearTimeout:id=>timers.delete(id)};
vm.createContext(scheduler);vm.runInContext(slice(cloudSource,'  function beginPolling(', '  async function init(')+slice(cloudSource,'  function stop(){','  // V100')+';this.start=beginPolling;this.halt=stop;',scheduler);
async function advance(ms){const end=timerNow+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;timerNow=next[1].at;timers.delete(next[0]);await next[1].fn()}timerNow=end}
scheduler.start(1);await advance(60000);assert.equal(probes,60);assert.equal(lives,4);
scheduler.document.visibilityState='hidden';scheduler.start(++scheduler.pollGeneration);probes=0;lives=0;
await advance(60000);assert.equal(probes,2);assert.equal(lives,1);
scheduler.document.visibilityState='visible';scheduler.start(++scheduler.pollGeneration);probes=0;
await advance(1000);assert.equal(probes,1,'resume restores 1s polling immediately');
let finishProbe;scheduler.probeRevision=()=>new Promise(r=>finishProbe=r);
const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(next[0]);const oldTick=next[1].fn();
scheduler.start(++scheduler.pollGeneration);const count=timers.size;finishProbe();await oldTick;
assert.equal(timers.size,count,'obsolete async loop cannot create a second timer');
scheduler.probeRevision=async()=>{};scheduler.halt();await advance(60000);assert.equal(timers.size,0,'stop cannot resurrect polling');
const cold=cloud(false);cold.c.lastSyncedState=null;await cold.c.focus();assert.equal(cold.meter.actions.load.requests,1,'cold focus still loads full state');
const dirty=cloud(false);dirty.c.cloudDirty=true;await dirty.c.focus();assert.equal(dirty.c.cloudDirty,false,'focus commits pending changes before revision check');

const warningBaseline=cloud(true);warningBaseline.c.fetch=async()=>{throw Error('QA failure')};
for(let i=0;i<60;i++){await warningBaseline.c.probe();warningBaseline.tick()}
assert.equal(warningBaseline.warnings(),60);
const report={baseline,fixture:{jobs:1000,sparePartEvents:1000,pageSize:500},measurement:'UTF-8 JSON bodies through real client functions and synthetic fetch; excludes compression, headers, TLS and database traffic',scenarios,
  logging:{scenario:'60 revision-check failures at 1s intervals',beforeWarnings:warningBaseline.warnings(),afterWarnings:1,savingsPct:98.33},
  scheduler:{foregroundRevisionChecksPer60s:60,backgroundRevisionChecksPer60s:2,foregroundLiveRepairPer60s:4,backgroundLiveRepairPer60s:1,visibilityResumeAndStopRace:'passed'}};
if(process.env.TRAFFIC_REPORT)fs.writeFileSync(process.env.TRAFFIC_REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
console.log('Traffic regression: counts, cache parity, pagination completeness, overlap, error recovery, warning throttle and offline checks passed.');
