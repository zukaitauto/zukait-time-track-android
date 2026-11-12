import assert from 'node:assert/strict';
import {loadCloud,deferred} from './helpers/cloud-client.mjs';
import {loadApi,fixture} from './helpers/workshop-api.mjs';
const clean=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
for(const rebased of [false,true]){
 const pending=deferred();const c=loadCloud({transport:(req,n)=>n===1?pending.promise:({ok:true,revision:2})});
 c.ctx.state.sessions.push({id:'s1',emp:'E1'});c.ctx.cloudScheduleSave();const saving=c.ctx.zukaitCloud.push();
 c.ctx.state.sessions.push({id:'s2',emp:'E1'});c.ctx.cloudScheduleSave();await c.fire(100);
 pending.resolve({ok:true,revision:1,...(rebased?{data:{users:[],jobs:[{no:'REMOTE'}],assign:[],sessions:[{id:'s1',emp:'E1'}]}}:{})});await saving;
 assert.equal(c.ctx.zukaitCloud.dirty,true,'second edit stays dirty after acknowledgement');
 assert.equal(c.ctx.state.sessions.length,2,'rebased response preserves newer action');
 await c.fire(100);assert.equal(c.calls[1].data.sessions.length,2,'follow-up save includes both actions');
 assert.equal(c.ctx.zukaitCloud.dirty,false,'only follow-up acknowledgement clears dirty flag');
 if(rebased)assert.equal(c.ctx.state.jobs[0].no,'REMOTE','remote additions remain');
}
{
 const pending=deferred(),c=loadCloud({transport:()=>pending.promise});
 const pulling=c.ctx.zukaitCloud.pull(true);c.ctx.state.sessions.push({id:'during-pull'});c.ctx.cloudScheduleSave();
 pending.resolve({ok:true,revision:1,data:{users:[],jobs:[{no:'remote'}],assign:[],sessions:[]}});await pulling;
 assert.equal(c.ctx.state.sessions[0].id,'during-pull','in-flight pull retains unsaved action');
 assert.equal(c.ctx.zukaitCloud.dirty,true);assert.equal(c.ctx.state.jobs[0].no,'remote');
 const before=c.calls.length;await c.ctx.zukaitCloud.pull(true);assert.equal(c.calls.length,before,'forced pull cannot discard pending edits');
}
{
 const c=loadCloud({transport:(req,n)=>n===1?Promise.reject(Error('network')):({ok:true,revision:1})});
 c.ctx.state.sessions.push({id:'retry'});c.ctx.cloudScheduleSave();await c.ctx.zukaitCloud.push();
 assert.equal(c.ctx.zukaitCloud.dirty,true);await c.fire(5000);assert.equal(c.calls.length,2,'transient save failure retries without another user action');
 assert.equal(c.ctx.zukaitCloud.dirty,false);
}
for(const code of ['id001_update_required','forbidden_change']){
 const remote={users:[],jobs:[],assign:[],sessions:[]};
 const c=loadCloud({transport:req=>req.action==='load'?({ok:true,revision:1,data:remote}):({ok:false,code})});
 c.ctx.state.sessions.push({id:'pending-rejected',emp:'E1'});c.ctx.cloudScheduleSave();await c.ctx.zukaitCloud.push();
 assert.equal(c.ctx.state.sessions.length,1,'rejected action retained');assert.equal(c.ctx.zukaitCloud.dirty,true);
 assert.ok(c.storage.get('zukait_cloud_pending_conflict_v42').includes('pending-rejected'),'recoverable pending snapshot persisted');
 assert.ok(![...c.timers.values()].some(t=>t.delay===5000),'business rejection does not endlessly retry');
}
{
 let marked=0,synced=0;const q={pending:()=>[{eventId:'e1'}],markSynced(){synced++},markConflict(){marked++},compact(){}};
 const c=loadCloud({queue:q,transport:()=>({ok:false,code:'server_error',status:500})});
 await c.ctx.zukaitV2Transport.flush();assert.equal(marked,0,'server outage does not quarantine event');assert.equal(synced,0);
}
const {helpers}=loadApi({state:fixture()});
{
 const pending=deferred(),c=loadCloud({transport:req=>req.action==='load'?pending.promise:({ok:true,revision:2})});
 const pulling=c.ctx.zukaitCloud.pull(true);
 c.ctx.state.sessions.push({id:'saved-while-pulling'});c.ctx.cloudScheduleSave();await c.ctx.zukaitCloud.push();
 pending.resolve({ok:true,revision:1,data:{users:[],jobs:[],assign:[],sessions:[]}});await pulling;
 assert.equal(c.ctx.zukaitCloud.revision,2,'late pull cannot roll back acknowledged revision');
 assert.equal(c.ctx.state.sessions[0].id,'saved-while-pulling','late pull cannot erase acknowledged work');
}
let merged=helpers.threeWayMerge({jobs:[{no:'JC0',vehicle:'A'}]},{jobs:[{no:'JC0',vehicle:'B'},{no:'REMOTE'}]},{jobs:[{no:'JC0',vehicle:'A',reg:'NEW'},{no:'LOCAL'}]});
assert.deepEqual(clean(merged),{jobs:[{no:'JC0',vehicle:'B',reg:'NEW'},{no:'REMOTE'},{no:'LOCAL'}]},'server merges job identities and independent field edits');
merged=helpers.threeWayMerge({workshopHolidays:[]},{workshopHolidays:['2026-10-08']},{workshopHolidays:['2026-10-10']});
assert.deepEqual(clean(merged.workshopHolidays),['2026-10-08','2026-10-10'],'unkeyed concurrent additions retained');
const base={audit:[{by:'S1',at:1}]},remote={audit:[{by:'S1',at:1},{by:'S1',at:2}]},local={audit:[{by:'S1',at:1},{by:'S2',at:3}]};
assert.equal(helpers.threeWayMerge(base,remote,local).audit.length,3,'concurrent append-only audit rows retained');
console.log('Review sync safety: save/pull races, retries, retained rejections, V2 outages and concurrent merges passed');
{
 const c=loadCloud({transport:()=>({ok:true,revision:1,data:{users:[],jobs:[],assign:[],sessions:[{id:'s1'}]}})});
 c.ctx.state.sessions.push({id:'s1'});c.ctx.cloudScheduleSave();
 c.ctx.render=()=>{c.ctx.state.sessions.push({id:'render-action'});c.ctx.cloudScheduleSave()};
 await c.ctx.zukaitCloud.push();assert.equal(c.ctx.zukaitCloud.dirty,true,'post-save render mutations also remain dirty');
 assert.equal(c.ctx.state.sessions.length,2);
}
