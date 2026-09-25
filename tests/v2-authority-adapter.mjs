import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
function boot(initial={}){
 const store=new Map(Object.entries(initial));const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};
 const c={window:{},localStorage};c.window=c;c.zukaitV2={reconnect:{decide:()=>({action:'ACCEPT_SERVER',reason:'test'})}};vm.createContext(c);
 vm.runInContext(fs.readFileSync('app/src/main/assets/v2/core/authority_adapter.js','utf8'),c);return {c,store};
}
let x=boot();assert.equal(x.c.zukaitV2.authorityAdapter.enabled(),false);assert.equal(x.c.zukaitV2.authorityAdapter.decide({},{}).mode,'LEGACY');assert.equal(x.c.zukaitV2.authorityAdapter.decide({},{}).action,'LEGACY');
x=boot({zukait_v2_reconnect_authority_enabled:'garbage'});assert.equal(x.c.zukaitV2.authorityAdapter.enabled(),false);
x=boot({zukait_v2_reconnect_authority_enabled:'true'});assert.equal(x.c.zukaitV2.authorityAdapter.enabled(),false);
x=boot({zukait_v2_reconnect_authority_enabled:'0'});assert.equal(x.c.zukaitV2.authorityAdapter.enabled(),false);
x=boot();assert.equal(x.c.zukaitV2.authorityAdapter.setEnabled(true),true);assert.equal(x.c.zukaitV2.authorityAdapter.decide({},{}).mode,'V2');assert.equal(x.c.zukaitV2.authorityAdapter.decide({},{}).action,'ACCEPT_SERVER');assert.equal(x.store.get('zukait_v2_reconnect_authority_enabled'),'1');
assert.equal(x.c.zukaitV2.authorityAdapter.setEnabled(false),false);assert.equal(x.c.zukaitV2.authorityAdapter.decide({},{}).mode,'LEGACY');
console.log('V2 authority adapter safety passed');
