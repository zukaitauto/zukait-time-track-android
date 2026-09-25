(function(){
'use strict';
const TYPES=['COMPLETION_RISK','PARTS_DELAY','DUTY_END','ADDITIONAL_TIME','REPEAT_WORK','QC_READY','MATERIAL_VARIANCE','SPARE_PART_DENTER_NOTICE'];
function key(n){return [n.type,n.entityId||n.jobCard||'',n.rule||'',n.revision||n.status||''].join(':')}
function build(type,data={}){
 if(!TYPES.includes(type))return null;
 const n={type,entityId:data.entityId||null,jobCard:data.jobCard||null,targetRole:data.targetRole||null,title:data.title||type,message:data.message||'',action:data.action||null,severity:data.severity||'normal',createdAt:data.serverTime||new Date().toISOString(),revision:data.revision||null,status:data.status||null};
 n.dedupeKey=key(n);return n;
}
function completionRisk(job,ctx={}){
 const days=Number(ctx.ageDays??job?.ageDays??0);
 if(days<Number(ctx.warningDays||25)||String(job?.workflowStage||'')==='DELIVERED')return null;
 return build('COMPLETION_RISK',{entityId:job?.id,jobCard:job?.jobCard,targetRole:'Manager',severity:days>=30?'urgent':'warning',message:'Job card is approaching or exceeding the 30-day workshop target.',action:'OPEN_JOB_CARD',status:String(days),serverTime:ctx.serverTime});
}
function partsDelay(part,ctx={}){
 const days=Number(ctx.pendingDays??part?.pendingDays??0);
 if(days<Number(ctx.thresholdDays||3)||['RECEIVED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED'].includes(String(part?.status||'')))return null;
 return build('PARTS_DELAY',{entityId:part?.id,jobCard:part?.jobCard,targetRole:'Purchaser',severity:days>=7?'urgent':'warning',message:'Part requires follow-up.',action:'OPEN_SPARE_PART',status:part?.status,serverTime:ctx.serverTime});
}
function materialVariance(row,ctx={}){
 const suggested=Number(row?.suggested||0),actual=Number(row?.actual||0),limit=Number(ctx.ratio||1.2);
 if(suggested<=0||actual<=suggested*limit)return null;
 return build('MATERIAL_VARIANCE',{entityId:row?.id,jobCard:row?.jobCard,targetRole:'Manager',severity:'warning',message:'Actual material usage exceeds the configured variance threshold.',action:'OPEN_CONSUMABLES',revision:String(actual),serverTime:ctx.serverTime});
}
function dutyEnd(row,ctx={}){
 if(!row||row.active===false||row.responded||!['13:00','19:00'].includes(String(ctx.boundary||row.boundary||'')))return null;
 return build('DUTY_END',{entityId:row.id||row.assignmentId,jobCard:row.jobCard,targetRole:'Employee',severity:'warning',message:'Duty period ended. Confirm whether work is continuing as overtime.',action:'CONFIRM_DUTY_END',revision:row.revision,status:String(ctx.boundary||row.boundary),serverTime:ctx.serverTime});
}
function additionalTime(row,ctx={}){
 if(!row||String(row.status||'PENDING')!=='PENDING')return null;
 return build('ADDITIONAL_TIME',{entityId:row.id,jobCard:row.jobCard,targetRole:'Supervisor',severity:'warning',message:'Additional work time requires review.',action:'REVIEW_ADDITIONAL_TIME',revision:row.revision,status:'PENDING',serverTime:ctx.serverTime});
}
function repeatWork(row,ctx={}){
 if(!row||row.cancelled||row.completed)return null;
 return build('REPEAT_WORK',{entityId:row.id,jobCard:row.jobCard||row.job,targetRole:'Supervisor',severity:'warning',message:'Repeat work requires workshop follow-up.',action:'OPEN_REPEAT_WORK',revision:row.revision,status:'OPEN',serverTime:ctx.serverTime});
}
function qcReady(job,ctx={}){
 const stage=String(job?.workflowStage||job?.stage||'');
 if(!['QC','READY_FOR_DELIVERY'].includes(stage))return null;
 return build('QC_READY',{entityId:job?.id,jobCard:job?.jobCard||job?.no,targetRole:stage==='QC'?'Supervisor':'Manager',severity:'normal',message:stage==='QC'?'Job card is ready for final QC.':'Job card is ready for delivery.',action:stage==='QC'?'OPEN_QC':'OPEN_READY_FOR_DELIVERY',revision:job?.revision,status:stage,serverTime:ctx.serverTime});
}
function denterNotice(part,ctx={}){
 if(!part?.id)return null;
 return build('SPARE_PART_DENTER_NOTICE',{entityId:part.id,jobCard:part.jobCard,targetRole:'Supervisor',severity:'normal',title:'Spare Parts update',message:'Denter requested Supervisor attention for this Parts List.',action:'OPEN_SPARE_PART',status:part.status||'LISTED',revision:part.revision||null,serverTime:ctx.serverTime});
}
function dedupe(list){
 const seen=new Set();return (list||[]).filter(n=>n&&(!seen.has(n.dedupeKey)&&seen.add(n.dedupeKey)));
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{notifications:{TYPES,key,build,completionRisk,partsDelay,materialVariance,dutyEnd,additionalTime,repeatWork,qcReady,denterNotice,dedupe}});
})();