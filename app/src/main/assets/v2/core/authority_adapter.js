(function(){
'use strict';
const KEY='zukait_v2_reconnect_authority_enabled';
function enabled(){try{return localStorage.getItem(KEY)==='1'}catch(_){return false}}
function setEnabled(v){try{localStorage.setItem(KEY,v?'1':'0')}catch(_){}return enabled()}
function decide(local,server){
 const reconnect=window.zukaitV2?.reconnect;
 const shadow=reconnect?.decide?.(local,server)||{action:'UNAVAILABLE',reason:'v2-unavailable'};
 if(!enabled())return {mode:'LEGACY',action:'LEGACY',reason:'feature-flag-off',shadow};
 if(!reconnect?.decide)return {mode:'V2',action:'BLOCK',reason:'v2-unavailable'};
 return {mode:'V2',...shadow};
}
function apply(local,server,legacyApply,v2Apply){
 const d=decide(local,server);
 if(d.mode!=='V2'){if(typeof legacyApply==='function')return {decision:d,result:legacyApply()};return {decision:d,result:null}}
 // Once V2 authority is enabled, never silently downgrade a critical reconciliation
 // to legacy. A missing handler or exception must be visible and retried/reconciled
 // against server truth instead of mutating through a second authority path.
 if(d.action==='BLOCK'||typeof v2Apply!=='function')return {decision:{...d,action:'BLOCK',reason:d.reason==='v2-unavailable'?'v2-unavailable':'v2-apply-missing'},result:null,blocked:true};
 try{return {decision:d,result:v2Apply(d),blocked:false}}
 catch(e){console.warn('V2 authority apply failed; blocking legacy fallback',e);return {decision:{...d,action:'BLOCK',reason:'v2-apply-failed'},result:null,blocked:true,error:e}}
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{authorityAdapter:{enabled,setEnabled,decide,apply}});
})();
