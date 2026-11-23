import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
function boot(values={}){
 const store=new Map(Object.entries(values));const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};
 let enabled=false;const c={window:{},localStorage};c.window=c;c.zukaitV2={authorityAdapter:{setEnabled:v=>enabled=!!v,enabled:()=>enabled}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('app/src/main/assets/v2/core/pilot_activation.js','utf8'),c);return {c,store,get enabled(){return enabled}};
}
let x=boot();assert.equal(x.c.zukaitV2.pilot.eligible(),false);assert.equal(x.c.zukaitV2.pilot.enable().ok,false);assert.equal(x.enabled,false);
x=boot({zukait_device_id:'D1'});assert.equal(x.c.zukaitV2.pilot.enable().ok,false);assert.equal(x.enabled,false);
x=boot({zukait_device_id:'D1',zukait_v2_pilot_device:'D2'});assert.equal(x.c.zukaitV2.pilot.eligible(),false);assert.equal(x.c.zukaitV2.pilot.enable().reason,'device-not-pilot');assert.equal(x.enabled,false);
x=boot({zukait_device_id:'D1',zukait_v2_pilot_device:'D1'});assert.equal(x.c.zukaitV2.pilot.eligible(),true);assert.equal(x.c.zukaitV2.pilot.enable().ok,true);assert.equal(x.enabled,true);x.c.zukaitV2.pilot.disable();assert.equal(x.enabled,false);
x=boot({zukaitDeviceId:'ALT1',zukait_v2_pilot_device:'ALT1'});assert.equal(x.c.zukaitV2.pilot.enable().ok,true);
x=boot({zukait_device_id:'D1',zukait_v2_pilot_device:'D1'});x.c.zukaitV2.pilot.setPilotDevice('D2');assert.equal(x.c.zukaitV2.pilot.enable().ok,false);assert.equal(x.enabled,false);
console.log('V2 pilot activation guard passed');
