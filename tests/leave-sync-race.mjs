import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const a=src.indexOf('  async function pull(force){'),b=src.indexOf('  async function probeRevision(){',a);
async function race(acknowledged){
 let resolve;const pending=new Promise(r=>resolve=r);
 const c={state:{leaves:[]},cloudRevision:1,cloudDirty:false,dirtyGeneration:0,pullInFlight:false,initialDone:true,
  me:{id:'S',role:'Supervisor'},navigator:{onLine:true},sessionToken:()=>true,status(){},clone:structuredClone,api:()=>pending,
  normalizeRemote(){throw Error('stale response must not replace new leave')},console};
 vm.createContext(c);vm.runInContext(src.slice(a,b)+';this.pull=pull',c);
 const pulling=c.pull(true);c.state.leaves.push({id:'new',emp:'E',date:'2026-10-06',period:'FULL'});c.dirtyGeneration++;
 c.cloudDirty=!acknowledged;if(acknowledged)c.cloudRevision=2;
 resolve({ok:true,revision:1,data:{leaves:[]}});assert.equal(await pulling,false);
 assert.equal(c.state.leaves[0].id,'new');assert.equal(c.pullInFlight,false);
}
await race(false);await race(true);
const start=src.indexOf('  function mergeById('),end=src.indexOf('  async function pull(',start);
const c={clone:x=>structuredClone(x),console,preferEmployeeSession:()=>false};vm.createContext(c);vm.runInContext(src.slice(start,end)+';this.merge=mergeEmployeeConflict',c);
const remote={leaves:[{id:'old',emp:'E',by:'E',cancelled:true,date:'2026-10-01',period:'AM',updatedBy:'M'}],leaveAudit:[{id:'audit',by:'M',action:'EDIT'}]};
const local={leaves:[{id:'old',emp:'E',by:'E',cancelled:false,date:'2026-10-01',period:'FULL'},{id:'new',emp:'E',by:'E',period:'PM',date:'2026-10-06'},{id:'foreign',emp:'OTHER',by:'OTHER'}],leaveAudit:[{id:'new-audit',by:'E',action:'ADD'}]};
const merged=c.merge(remote,local,'E');assert.equal(merged.leaves.length,2);assert.equal(merged.leaves[0].cancelled,true);assert.equal(merged.leaves[0].period,'AM');assert.equal(merged.leaves[1].id,'new');
assert.equal(merged.leaveAudit.length,2);assert.equal(remote.leaves.length,1,'merge must not mutate server snapshot');
console.log('Leave sync: in-flight pull cannot erase saves; stale Employee replay retains Manager edits/cancellations and own pending additions.');
