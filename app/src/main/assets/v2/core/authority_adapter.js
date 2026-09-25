(function(){
'use strict';
const KEY='zukait_v2_reconnect_authority_enabled';
function enabled(){try{return localStorage.getItem(KEY)==='1'}catch(_){return false}}
function setEnabled(v){try{localStorage.setItem(KEY,v?'1':'0')}catch(_){}return enabled()}
function decide(local,server){
 const shadow=window.zukaitV2?.reconnect?.decide?.(local,server)||{action:'LEGACY',reason:'v2-unavailable'};
 return enabled()?{mode:'V2',...shadow}:{mode:'LEGACY',action:'LEGACY',reason:'feature-flag-off',shadow};
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{authorityAdapter:{enabled,setEnabled,decide}});
})();
