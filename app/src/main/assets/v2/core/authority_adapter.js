(function(){
'use strict';
const KEY='zukait_v2_reconnect_authority_enabled';
function enabled(){try{return localStorage.getItem(KEY)==='1'}catch(_){return false}}
function setEnabled(v){try{localStorage.setItem(KEY,v?'1':'0')}catch(_){}return enabled()}
function decide(local,server){
 const shadow=window.zukaitV2?.reconnect?.decide?.(local,server)||{action:'LEGACY',reason:'v2-unavailable'};
 return enabled()?{mode:'V2',...shadow}:{mode:'LEGACY',action:'LEGACY',reason:'feature-flag-off',shadow};
}
function apply(local,server,legacyApply,v2Apply){
 const d=decide(local,server);
 if(d.mode!=='V2'){if(typeof legacyApply==='function')return {decision:d,result:legacyApply()};return {decision:d,result:null}}
 if(typeof v2Apply!=='function')return {decision:{...d,mode:'LEGACY',action:'LEGACY',reason:'v2-apply-missing'},result:typeof legacyApply==='function'?legacyApply():null};
 try{return {decision:d,result:v2Apply(d)}}catch(e){console.warn('V2 authority apply failed; using legacy',e);return {decision:{...d,mode:'LEGACY',action:'LEGACY',reason:'v2-apply-failed'},result:typeof legacyApply==='function'?legacyApply():null}}
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{authorityAdapter:{enabled,setEnabled,decide,apply}});
})();
