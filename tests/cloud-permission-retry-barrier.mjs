import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const prefix=source.slice(source.indexOf("  const API_URL"),source.indexOf('  let cloudRevision='));
const push=source.slice(source.indexOf('  async function push(retry=0)'),source.indexOf('  window.cloudScheduleSave='));
const storage=new Map();let calls=0,respond;
function context(user='MGR001'){
 const c={me:{id:user,role:'Manager'},state:{consumables:{actuals:[{id:'a',totalCost:11}],audit:[{id:'old'}]},jobs:[]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},cloudPushing:false,cloudDirty:true,cloudRevision:1,dirtyGeneration:1,navigator:{onLine:true},sessionToken:()=>true,status:()=>{},payloadState:()=>structuredClone(c.state),clone:structuredClone,lastSyncError:'',consecutiveSyncErrors:0,setServerConnection:()=>{},console:{error:()=>{}},pushTimer:null,clearTimeout:()=>{},setTimeout:()=>{},api:async()=>{calls++;return new Promise(r=>respond=r)}};
 vm.createContext(c);vm.runInContext(prefix+push,c);return c;
}
const c=context();const pending=c.push();c.state.jobs.push({no:'12079',cashAmount:80});respond({_status:403,code:'consumables_correction_actor_invalid'});await pending;
const saved=JSON.parse(storage.get('zukait_cloud_pending_conflict_v42'));assert.equal(saved.data.jobs[0].cashAmount,80,'in-flight local click must survive');assert.equal(saved.data.consumables.actuals[0].totalCost,11);assert.equal(c.cloudDirty,true);
for(let i=0;i<10;i++)await c.push();assert.equal(calls,1,'poll/reconnect/manual paths cannot resend identical denied data');
const restarted=context();restarted.state=structuredClone(c.state);await restarted.push();assert.equal(calls,1,'restart preserves retry barrier');
const other=context('SUP001');other.state=structuredClone(c.state);await other.push();assert.equal(calls,1,'another account must not adopt blocked queue');
restarted.state.consumables.actuals[0].correctedBy='MGR001';const retry=restarted.push();respond({_status:403,code:'consumables_correction_actor_invalid'});await retry;assert.equal(calls,2,'changed correction can be checked once');await restarted.push();assert.equal(calls,2);
assert.equal(JSON.parse(storage.get('zukait_cloud_pending_conflict_v42')).data.jobs[0].cashAmount,80);assert.equal(storage.get('zukait_cloud_dirty_v42'),'1');
const syncNow=source.slice(source.indexOf('  async function syncNow(){'),source.indexOf('  async function backupNow(){'));
restarted.confirm=()=>false;restarted.alert=()=>{};restarted.liveRole=()=>false;vm.runInContext(syncNow,restarted);await restarted.syncNow();assert.equal(calls,2,'cancelled review cannot resend');
restarted.confirm=()=>true;const manual=restarted.syncNow();respond({_status:403,code:'consumables_correction_actor_invalid'});await manual;assert.equal(calls,3,'explicit confirmed retry sends once');await restarted.push();assert.equal(calls,3,'denial restores barrier after manual retry');
console.log('PASS persistent 403 retry barrier, pending money/audit preservation, in-flight changes and account isolation');

storage.clear();const idle=context();let connection='';idle.setServerConnection=(kind)=>connection=kind;idle.state.assign=[{id:'duplicate',job:'ID001',emp:'E'}];const beforeCalls=calls;const held=idle.push();respond({_status:409,code:'id001_already_assigned',message:'ID001 already assigned'});await held;assert.equal(connection,'connected');assert.equal(idle.cloudDirty,true);assert.equal(JSON.parse(storage.get('zukait_cloud_pending_conflict_v42')).data.consumables.actuals[0].totalCost,11);for(let i=0;i<5;i++)await idle.push();assert.equal(calls,beforeCalls+1,'duplicate assignment conflict is held without hammering server or losing unrelated edits');
console.log('ID001 conflict: server reachable, preserved full pending snapshot and retry barrier passed');
