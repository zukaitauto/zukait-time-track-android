import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
let reads=0,patches=0;
const c=vm.createContext({navigator:{onLine:true},cloudDirty:true,cloudPushing:true,pullInFlight:true,cloudRevision:1,Date,setTimeout,clone:structuredClone,state:{jobs:[{no:'LOCAL',amount:12}]},
 async api(body){assert.equal(body.action,'load');reads++;return {ok:true,revision:2,data:{jobs:[{no:'12079',amount:80}]}}}});
vm.runInContext(slice('  let readLatestInFlight=', '  async function syncNow(){')+';globalThis.readLatest=readLatest;',c);
const result=await c.readLatest();assert.equal(reads,1);assert.equal(result.data.jobs[0].no,'12079');
assert.equal(c.state.jobs[0].no,'LOCAL');assert.equal(c.cloudDirty,true,'Pending edits must remain queued');assert.equal(c.cloudPushing,true);assert.equal(c.pullInFlight,true);
let release;const gate=new Promise(r=>release=r);c.api=async()=>{reads++;await gate;return {ok:true,revision:3,data:{jobs:[{no:'12079',amount:80}]}}};
const first=c.readLatest(),second=c.readLatest();release();await Promise.all([first,second]);assert.equal(reads,2,'Concurrent report reads share one request');
c.api=async()=>({ok:false,code:'invalid_session'});await assert.rejects(c.readLatest(),/invalid_session/);
c.navigator.onLine=false;await assert.rejects(c.readLatest(),/OFFLINE/);c.navigator.onLine=true;
const p=vm.createContext({revisionProbeInFlight:false,pullInFlight:false,cloudDirty:false,cloudPushing:false,cloudRevision:4,lastProbedRevision:-1,lastRevisionProbeAt:0,lastSuccessfulSyncAt:Date.now()-31000,pollWarnings:new Map(),navigator:{onLine:true},sessionToken:()=>true,Date,api:async()=>({ok:true,revision:4}),setServerConnection(){},liveRole:()=>false,warnPoll(){},
 async pull(force){assert.equal(force,true);patches++;p.lastSuccessfulSyncAt=Date.now();return true;}});
vm.runInContext(slice('  async function probeRevision(){','  async function push(')+';globalThis.probe=probeRevision;',p);
assert.equal(await p.probe(),true);assert.equal(patches,1,'Same revision must still repair an old mutable local snapshot');
p.lastProbedRevision=-1;assert.equal(await p.probe(),false);assert.equal(patches,1,'Fresh snapshots must not trigger a full load on every tick');
const nodes={woSearch:{value:'12079',focus(){}},woResults:{dataset:{queue:'0'},innerHTML:''}};
const w=vm.createContext({window:{openModal(){}},state:{jobs:[],assign:[]},me:{role:'Manager'},document:{getElementById:id=>nodes[id]||null,addEventListener(){},createElement(){return{}},head:{appendChild(){}},body:{}},MutationObserver:class{observe(){}},setTimeout(){},setInterval(){},openModal(){},console});
vm.runInContext(fs.readFileSync('app/src/main/assets/workshop_overview.js','utf8'),w);
w.window.zukaitCloud={async readLatest(){w.state.jobs=[{no:'12079',jobType:'CASH',amount:80,vehicle:'New Reception vehicle',reg:'ABC'}]}};
for(const role of ['Manager','Supervisor']){
 w.me.role=role;w.state.jobs=[];await w.window.zukaitWorkshopOverview.openSearch(false,'12079');
 assert.match(nodes.woResults.innerHTML,/12079/,'New Reception jobs must be searchable after the shared server read');
 assert.equal(nodes.woSearch.value,'12079');
 w.state.jobs[0].vehicle='Updated Reception vehicle';w.window.zukaitWorkshopOverview.refreshShared();assert.match(nodes.woResults.innerHTML,/Updated Reception vehicle/);assert.equal(nodes.woSearch.value,'12079');
}
w.window.zukaitCloud.confirmedState={jobs:[{no:'12079',jobType:'CASH',amount:80,vehicle:'Confirmed server vehicle',reg:'ABC'}],assign:[]};w.state.jobs=[];w.window.zukaitWorkshopOverview.refreshShared();assert.match(nodes.woResults.innerHTML,/12079/);assert.equal(w.state.jobs.length,0,'Report reads cannot replace pending local state');
console.log('Shared dashboard reads passed: confirmed server reads, pending edits retained, periodic same-revision repair and Reception JC 12079 visible for both roles');
