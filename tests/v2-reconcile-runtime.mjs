import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
function boot(action='ACCEPT_SERVER'){
 const store=new Map([['zukait_v2_reconnect_authority_enabled','1']]);const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};
 const c={window:{},localStorage,console};c.window=c;c.zukaitV2={reconnect:{decide:()=>({action,reason:'test'})}};vm.createContext(c);
 for(const f of ['app/src/main/assets/v2/core/authority_adapter.js','app/src/main/assets/v2/core/reconcile_runtime.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
 return c;
}
const local={id:'L'},server={id:'S'};
let c=boot('ACCEPT_SERVER'),r=c.zukaitV2.reconcileRuntime.resolve(local,server,()=>({legacy:true}));assert.equal(r.result.kind,'SERVER');assert.equal(r.result.state.id,'S');
c=boot('REPLAY_LOCAL');r=c.zukaitV2.reconcileRuntime.resolve(local,server,()=>({legacy:true}));assert.equal(r.result.kind,'LOCAL_REPLAY');assert.equal(r.result.state.id,'L');
c=boot('KEEP_LOCAL');r=c.zukaitV2.reconcileRuntime.resolve(local,server,()=>({legacy:true}));assert.equal(r.result.kind,'LOCAL_HOLD');assert.equal(r.result.state.id,'L');
c=boot('CONFLICT');r=c.zukaitV2.reconcileRuntime.resolve(local,server,()=>({legacy:true}));assert.equal(r.result.kind,'CONFLICT_HOLD');assert.equal(r.result.state,null);assert.equal(r.result.conflict,true);
c=boot('BOGUS');r=c.zukaitV2.reconcileRuntime.resolve(local,server,()=>({legacy:true}));assert.equal(r.decision.mode,'LEGACY');assert.equal(r.decision.reason,'v2-apply-failed');assert.equal(r.result.legacy,true);
c=boot('ACCEPT_SERVER');c.zukaitV2.authorityAdapter.setEnabled(false);r=c.zukaitV2.reconcileRuntime.resolve(local,server,()=>({legacy:true}));assert.equal(r.decision.mode,'LEGACY');assert.equal(r.result.legacy,true);
console.log('V2 reconcile runtime passed');
