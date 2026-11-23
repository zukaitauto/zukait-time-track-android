(function(){
'use strict';
const KEY='zukait_v2_reconnect_authority_enabled';
function enabled(){try{return localStorage.getItem(KEY)==='1'}catch(_){return false}}
function setEnabled(value){try{localStorage.setItem(KEY,value?'1':'0')}catch(_){}return enabled()}
function decide(local,server){
 const api=window.zukaitV2?.reconnect;if(!api)return {action:'LEGACY',reason:'v2-unavailable'};
 if(!enabled())return {action:'LEGACY',reason:'feature-flag-off',shadow:api.decide(local,server)};
 return api.decide(local,server);
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{reconnectAuthority:{enabled,setEnabled,decide}});
})();
