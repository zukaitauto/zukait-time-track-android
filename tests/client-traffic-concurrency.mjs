import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const code=slice('  const API_URL','  let cloudRevision=')+slice('  function same(','  function reconcileConsumablesDuplicates(')+slice('  async function push(retry=0)','  window.cloudScheduleSave=');
const initial={jobs:[{no:'QA',notes:'synthetic '.repeat(20000)}],leaves:[],sessions:[]};
let server={revision:1,data:structuredClone(initial)},requests=[],bytes=0,tokens=0;
const contexts=[];
function device(){
 const storage=new Map(),timers=[];const token='qa-'+(++tokens);
 const c={me:{id:'QA_MANAGER',role:'Manager'},state:structuredClone(server.data),lastSyncedState:structuredClone(server.data),cloudRevision:server.revision,cloudDirty:true,cloudPushing:false,cloudApplying:false,dirtyGeneration:1,navigator:{onLine:true},sessionToken:()=>token,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},payloadState:()=>structuredClone(c.state),status(){},setServerConnection(){},reconcileConsumablesDuplicates:x=>x,ensureShape(){},persistLocal(){},scheduleDashboardRender(){},normalizeRemote:x=>{c.state=structuredClone(x)},lastSuccessfulSyncAt:0,lastSyncError:'',consecutiveSyncErrors:0,initialDone:true,conflictAlerted:false,pushTimer:null,window:{},console,setTimeout:f=>{timers.push(f);return timers.length},clearTimeout(){},api:payload=>{bytes+=Buffer.byteLength(JSON.stringify(payload));return new Promise(resolve=>requests.push({payload,resolve,token}))}};
 vm.createContext(c);vm.runInContext(code,c);contexts.push(c);return {c,storage,timers};
}
function answer(){const r=requests.shift();assert.ok(r);const p=r.payload;if(p.expected_revision!==server.revision)r.resolve({ok:false,code:'conflict',revision:server.revision,data:structuredClone(server.data)});else{server={revision:server.revision+1,data:structuredClone(p.data)};r.resolve({ok:true,server_revision:server.revision});}}
const a=device(),b=device();
a.c.state.leaves.push({id:'LA',emp:'A'});b.c.state.leaves.push({id:'LB',emp:'B'});
const pa=a.c.push(),pb=b.c.push();assert.equal(requests.length,2);answer();await pa;answer();
// The losing device must rebase and retry using the actual three-way merge.
await new Promise(r=>setImmediate(r));assert.equal(requests.length,1);answer();await pb;
assert.deepEqual(server.data.leaves.map(x=>x.id).sort(),['LA','LB']);
const sentBefore=bytes;for(let i=0;i<20;i++){b.c.cloudDirty=true;b.c.dirtyGeneration++;assert.equal(await b.c.push(),true);}
assert.equal(bytes,sentBefore,'20 unchanged dirty events upload zero additional bytes');assert.equal(requests.length,0);
// A changed request is never suppressed, and an edit made during its save survives.
b.c.state.sessions.push({id:'S1',start:10});b.c.cloudDirty=true;b.c.dirtyGeneration++;
const pc=b.c.push();b.c.state.leaves.push({id:'LC',emp:'C'});b.c.dirtyGeneration++;
answer();await pc;assert.equal(b.c.cloudDirty,true);assert.ok(b.storage.has('zukait_cloud_pending_conflict_v42'));assert.ok(b.c.state.leaves.some(x=>x.id==='LC'));
const follow=b.c.push();assert.equal(requests.length,1);answer();await follow;
assert.deepEqual(server.data.leaves.map(x=>x.id).sort(),['LA','LB','LC']);assert.equal(server.data.sessions[0].id,'S1');assert.equal(b.c.cloudDirty,false);
// Offline and pending snapshots cannot be acknowledged away.
b.c.cloudDirty=true;b.c.navigator.onLine=false;assert.equal(await b.c.push(),false);assert.equal(b.c.cloudDirty,true);b.c.navigator.onLine=true;
b.storage.set('zukait_cloud_pending_conflict_v42','pending');const pending=b.c.push();assert.equal(requests.length,1);answer();await pending;
console.log('PASS two-device CAS/rebase, no lost independent leave edits, in-flight newer edits, immediate follow-up, offline and pending preservation; 20 unchanged events add zero uploads (synthetic scenario, not measured production savings)');
