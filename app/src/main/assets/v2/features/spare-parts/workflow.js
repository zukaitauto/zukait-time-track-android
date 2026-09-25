(function(){
'use strict';
const STATUS=['LISTED','ENQUIRY','QUOTED','ORDERED','RECEIVED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED','RETURNED','UNAVAILABLE','CUSTOMER_SETTLEMENT'];
const PRICE_ROLES=new Set(['Manager','Purchaser']);
const transitions={
LISTED:['ENQUIRY','UNAVAILABLE'],ENQUIRY:['QUOTED','UNAVAILABLE'],QUOTED:['ORDERED','ENQUIRY','UNAVAILABLE'],
ORDERED:['RECEIVED','RETURNED','UNAVAILABLE'],RECEIVED:['DENTER_CHECKED','RETURNED'],
DENTER_CHECKED:['SUPERVISOR_CONFIRMED','RETURNED'],SUPERVISOR_CONFIRMED:['FITTED','RETURNED'],
UNAVAILABLE:['CUSTOMER_SETTLEMENT'],RETURNED:['ENQUIRY','ORDERED','UNAVAILABLE']
};
function canSeePrice(role){return PRICE_ROLES.has(String(role||''))}
function allowed(from,to){return (transitions[String(from||'')]||[]).includes(String(to||''))}
function canAct(role,from,to){
 role=String(role||'');
 if(!allowed(from,to))return false;
 if(['ENQUIRY','QUOTED','ORDERED','RECEIVED'].includes(to))return role==='Purchaser'||role==='Manager';
 if(to==='DENTER_CHECKED')return role==='Denter'||role==='Manager';
 if(to==='SUPERVISOR_CONFIRMED')return role==='Supervisor'||role==='Manager';
 if(['FITTED','RETURNED'].includes(to))return ['Denter','Supervisor','Purchaser','Manager'].includes(role);
 if(['UNAVAILABLE','CUSTOMER_SETTLEMENT'].includes(to))return ['Supervisor','Purchaser','Manager'].includes(role);
 return role==='Supervisor'||role==='Manager';
}
function sanitize(item,role){
 const out=Object.assign({},item);
 if(!canSeePrice(role)){delete out.price;delete out.purchaseAmount;delete out.quoteAmount;delete out.billAmount;delete out.supplierCost}
 return out;
}
function transition(item,to,ctx={}){
 const from=String(item?.status||'LISTED');
 if(!canAct(ctx.role,from,to))return {ok:false,reason:'FORBIDDEN_OR_INVALID_TRANSITION',from,to};
 const now=ctx.serverTime||new Date().toISOString();
 const next=Object.assign({},item,{status:to,updatedAt:now,updatedBy:ctx.actorId||null});
 if(to==='UNAVAILABLE')next.cashSettlementRequired=true;
 if(to==='CUSTOMER_SETTLEMENT')next.cashSettlementRequired=false;
 if(to==='RETURNED')next.returnReason=String(ctx.reason||'').trim();
 if(to==='RECEIVED'){next.receivedAt=now;next.receivedBy=ctx.actorId||null}
 if(to==='DENTER_CHECKED'){next.denterCheckedAt=now;next.denterCheckedBy=ctx.actorId||null}
 if(to==='SUPERVISOR_CONFIRMED'){next.confirmedAt=now;next.confirmedBy=ctx.actorId||null}
 return {ok:true,item:next,audit:{type:'SPARE_PART_STATUS_CHANGED',entityId:String(item?.id||''),from,to,actorId:ctx.actorId||null,deviceId:ctx.deviceId||null,reason:ctx.reason||null}};
}
function flag(item,kind,ctx={}){
 const allowedKinds=['URGENT','DEFECT'];
 if(!allowedKinds.includes(kind)||!['Denter','Supervisor','Manager'].includes(String(ctx.role||'')))return {ok:false,reason:'FORBIDDEN_FLAG'};
 const now=ctx.serverTime||new Date().toISOString();
 return {ok:true,item:Object.assign({},item,{[kind==='URGENT'?'urgent':'defect']:true,flaggedAt:now,flaggedBy:ctx.actorId||null}),notification:{type:'SPARE_PART_'+kind,jobCard:item?.jobCard||null,partId:item?.id||null,targetRole:'Supervisor',dedupeKey:['spare',kind,item?.id||'',item?.status||''].join(':')}};
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{spareParts:{STATUS,canSeePrice,allowed,canAct,sanitize,transition,flag}});
})();