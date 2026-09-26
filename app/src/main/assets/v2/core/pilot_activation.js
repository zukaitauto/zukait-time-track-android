(function(){
'use strict';
const KEY='zukait_v2_pilot_device';
function deviceId(){try{return String(localStorage.getItem('zukait_device_id')||localStorage.getItem('zukaitDeviceId')||'')}catch(_){return ''}}
function pilotId(){try{return String(localStorage.getItem(KEY)||'')}catch(_){return ''}}
function setPilotDevice(id){try{localStorage.setItem(KEY,String(id||''))}catch(_){}return pilotId()}
function eligible(){const d=deviceId(),p=pilotId();return !!d&&!!p&&d===p}
function enable(){
 const adapter=window.zukaitV2?.authorityAdapter;
 if(!adapter)return {ok:false,reason:'adapter-missing'};
 if(!eligible()){adapter.setEnabled(false);return {ok:false,reason:'device-not-pilot'}};
 adapter.setEnabled(true);return {ok:adapter.enabled(),reason:adapter.enabled()?'pilot-enabled':'enable-failed'};
}
function disable(){const adapter=window.zukaitV2?.authorityAdapter;adapter?.setEnabled(false);return {ok:true,reason:'disabled'}}
let claimInFlight=null;
async function autoClaim(){
 const u=(()=>{try{if(typeof me!=='undefined'&&me)return me}catch(_){}return window.me||window.currentUser||null})();
 const adapter=window.zukaitV2?.authorityAdapter,transport=window.zukaitV2Transport;
 if(!u||String(u.role||'')!=='Manager'){adapter?.setEnabled(false);return {ok:false,reason:'not-manager'}}
 const id=deviceId();
 if(!id){adapter?.setEnabled(false);return {ok:false,reason:'device-id-missing'}}
 if(!transport?.pilotClaim){adapter?.setEnabled(false);return {ok:false,reason:'pilot-transport-missing'}}
 if(claimInFlight)return claimInFlight;
 claimInFlight=(async()=>{
   try{
     const r=await transport.pilotClaim(id);
     if(r?.is_pilot===true){
       setPilotDevice(id);
       adapter?.setEnabled(true);
       return {ok:adapter?.enabled?.()===true,reason:'pilot-enabled',claimed_at:r.claimed_at||null};
     }
     adapter?.setEnabled(false);
     return {ok:false,reason:'another-device-is-pilot',claimed_at:r?.claimed_at||null};
   }catch(e){
     adapter?.setEnabled(false);
     return {ok:false,reason:String(e?.code||e?.message||'pilot-claim-failed')};
   }finally{claimInFlight=null}
 })();
 return claimInFlight;
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{pilot:{deviceId,pilotId,setPilotDevice,eligible,enable,disable,autoClaim}});
})();
