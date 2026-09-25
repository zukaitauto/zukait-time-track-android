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
window.zukaitV2=Object.assign(window.zukaitV2||{},{pilot:{deviceId,pilotId,setPilotDevice,eligible,enable,disable}});
})();
