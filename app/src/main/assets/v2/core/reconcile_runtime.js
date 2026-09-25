(function(){
'use strict';
function applyDecision(decision,local,server){
 if(!decision||decision.mode!=='V2')throw new Error('V2 authority decision required');
 switch(decision.action){
  case 'ACCEPT_SERVER': return {kind:'SERVER',state:server,conflict:false};
  case 'REPLAY_LOCAL': return {kind:'LOCAL_REPLAY',state:local,conflict:false};
  case 'KEEP_LOCAL': return {kind:'LOCAL_HOLD',state:local,conflict:false};
  case 'CONFLICT': return {kind:'CONFLICT_HOLD',state:null,conflict:true,reason:decision.reason||'conflict'};
  default: throw new Error('Unsupported V2 authority action: '+String(decision.action));
 }
}
function resolve(local,server,legacyApply){
 const adapter=window.zukaitV2?.authorityAdapter;if(!adapter) return {decision:{mode:'LEGACY',action:'LEGACY',reason:'adapter-missing'},result:typeof legacyApply==='function'?legacyApply():null};
 return adapter.apply(local,server,legacyApply,d=>applyDecision(d,local,server));
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{reconcileRuntime:{applyDecision,resolve}});
})();
