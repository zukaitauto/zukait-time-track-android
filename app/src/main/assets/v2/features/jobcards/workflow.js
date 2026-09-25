(function(){
'use strict';
const stages=['CREATED','DISMANTLING','PARTS_REQUIRED','PARTS_ORDERED','PARTS_RECEIVED','DENTING','PAINTING','ASSEMBLY','QC','READY_FOR_DELIVERY','DELIVERED'];
const terminal=new Set(['DELIVERED']);
function normalize(v){return String(v||'CREATED').trim().toUpperCase().replace(/\s+/g,'_')}
function index(v){return stages.indexOf(normalize(v))}
function canTransition(from,to,{allowSkip=true}={}){
  const a=index(from),b=index(to);
  if(a<0||b<0||terminal.has(normalize(from)))return false;
  if(a===b)return true;
  return allowSkip?b>a:b===a+1;
}
function transition(job,to,ctx={}){
  const from=normalize(job?.workflowStage);
  const next=normalize(to);
  if(!canTransition(from,next,ctx))return {ok:false,reason:'INVALID_STAGE_TRANSITION',from,to:next};
  return {ok:true,job:Object.assign({},job,{workflowStage:next,workflowUpdatedAt:ctx.serverTime||new Date().toISOString(),workflowUpdatedBy:ctx.actorId||null}),audit:{entityId:String(job?.id||job?.jobCard||''),type:'JOB_STAGE_CHANGED',from,to:next,actorId:ctx.actorId||null,deviceId:ctx.deviceId||null,reason:ctx.reason||null}};
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{jobWorkflow:{stages,normalize,canTransition,transition}});
})();