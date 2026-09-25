import fs from'node:fs';import assert from'node:assert/strict';import vm from'node:vm';
function store(){const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
const localStorage=store();const sandbox={window:{},localStorage,console};vm.createContext(sandbox);
for(const f of ['app/src/main/assets/v2/core/conflict_resolver.js','app/src/main/assets/v2/core/reconnect_authority.js','app/src/main/assets/v2/core/authority_adapter.js','app/src/main/assets/v2/core/reconcile_runtime.js','app/src/main/assets/v2/core/pilot_activation.js'])vm.runInContext(fs.readFileSync(f,'utf8'),sandbox);
const a=sandbox.window.zukaitV2.authorityAdapter,p=sandbox.window.zukaitV2.pilot;
assert.equal(a.enabled(),false,'V2 authority must default OFF');
let legacy=0,v2=0;a.apply({revision:1},{revision:2},()=>++legacy,()=>++v2);assert.equal(legacy,1);assert.equal(v2,0);
assert.equal(p.enable().ok,false,'non-pilot device must not enable V2');assert.equal(a.enabled(),false);
localStorage.setItem('zukait_device_id','DEVICE-A');p.setPilotDevice('DEVICE-B');assert.equal(p.enable().ok,false);assert.equal(a.enabled(),false);
p.setPilotDevice('DEVICE-A');assert.equal(p.enable().ok,true);assert.equal(a.enabled(),true);
p.disable();assert.equal(a.enabled(),false);
console.log('V2 authority default-off and pilot isolation: ok');