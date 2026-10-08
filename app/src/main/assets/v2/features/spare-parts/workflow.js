(function(){
'use strict';
const STATUS=['LISTED','ENQUIRY','QUOTED','ORDERED','RECEIVED','SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED','RETURNED','UNAVAILABLE','CUSTOMER_SETTLEMENT'];
const PRICE_ROLES=new Set(['Manager','Purchaser']);
const transitions={
LISTED:['ENQUIRY','UNAVAILABLE'],ENQUIRY:['QUOTED','ORDERED','LISTED','UNAVAILABLE'],QUOTED:['ORDERED','ENQUIRY','UNAVAILABLE'],
ORDERED:['RECEIVED','ENQUIRY','RETURNED','UNAVAILABLE'],RECEIVED:['RECEIVED','ORDERED','SUPERVISOR_VERIFIED','RETURNED'],
SUPERVISOR_VERIFIED:['SUPERVISOR_CONFIRMED','RETURNED'],DENTER_CHECKED:['SUPERVISOR_CONFIRMED','RETURNED'],SUPERVISOR_CONFIRMED:['FITTED','RETURNED'],FITTED:['RETURNED'],
UNAVAILABLE:['CUSTOMER_SETTLEMENT'],RETURNED:['ENQUIRY','UNAVAILABLE']
};
function canSeePrice(role){return PRICE_ROLES.has(String(role||''))}
function allowed(from,to){return (transitions[String(from||'')]||[]).includes(String(to||''))}
function canAct(role,from,to){
 role=String(role||'');
 if(!allowed(from,to))return false;
 if(from==='RECEIVED'&&to==='ORDERED')return ['Supervisor','Purchaser','Manager'].includes(role);
 if((from==='ENQUIRY'&&to==='LISTED')||(from==='ORDERED'&&to==='ENQUIRY')||(from==='RECEIVED'&&to==='ORDERED'))return role==='Purchaser'||role==='Manager';
 if(['ENQUIRY','QUOTED','ORDERED','RECEIVED'].includes(to))return role==='Purchaser'||role==='Manager';
 if(to==='SUPERVISOR_VERIFIED')return role==='Supervisor'||role==='Manager';
 if(to==='DENTER_CHECKED')return false;
 if(to==='SUPERVISOR_CONFIRMED')return role==='Supervisor'||role==='Manager';
 if(to==='FITTED')return role==='Supervisor'||role==='Manager';
 if(to==='RETURNED'){if(['SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED'].includes(String(from||'')))return role==='Manager';return ['Purchaser','Manager'].includes(role);}
 if(to==='UNAVAILABLE')return ['Supervisor','Purchaser','Manager'].includes(role);
 if(to==='CUSTOMER_SETTLEMENT')return role==='Supervisor'||role==='Manager';
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
 if(from==='RECEIVED'&&to==='ORDERED'&&['Supervisor','Manager'].includes(ctx.role)&&!String(ctx.reason||'').trim())return {ok:false,reason:'ARRIVAL_REJECTION_REASON_REQUIRED'};
 const now=ctx.serverTime||new Date().toISOString();
 const next=Object.assign({},item,{status:to,updatedAt:now,updatedBy:ctx.actorId||null});
 if(from==='RETURNED'&&to!=='RETURNED'){delete next.preReturnSnapshot;delete next.returnedAt;delete next.returnedBy;delete next.returnReason;delete next.returnedQty;if(to==='ENQUIRY')next.reEnquiredAt=now}if(to==='UNAVAILABLE')next.cashSettlementRequired=true;
 if(to==='CUSTOMER_SETTLEMENT')next.cashSettlementRequired=false;
 if(to==='RETURNED')next.returnReason=String(ctx.reason||'').trim();
 if(from==='RECEIVED'&&to==='ORDERED'){delete next.receivedQty;delete next.receivedAt;delete next.receivedBy;delete next.lastReceivedQty;delete next.partialReceipt}
 if(to==='RECEIVED'){const ordered=Number(item?.qty||0),already=from==='RECEIVED'?Number(item?.receivedQty||0):0,batch=ctx.receivedQty==null?(ordered-already):Number(ctx.receivedQty),received=already+batch;if(!Number.isFinite(ordered)||ordered<=0||!Number.isFinite(batch)||batch<=0||received>ordered)return {ok:false,reason:'INVALID_RECEIVED_QUANTITY',orderedQty:ordered,receivedQty:already};next.receivedQty=received;next.receivedAt=now;next.receivedBy=ctx.actorId||null;next.lastReceivedQty=batch;if(received<ordered)next.partialReceipt=true;else delete next.partialReceipt}
 if(to==='SUPERVISOR_VERIFIED'){if(Number(item?.receivedQty||item?.qty||0)<Number(item?.qty||0))return {ok:false,reason:'RECEIPT_INCOMPLETE'};next.supervisorVerifiedAt=now;next.supervisorVerifiedBy=ctx.actorId||null}
 if(to==='SUPERVISOR_CONFIRMED'){if(!(item?.supervisorVerifiedAt||item?.denterCheckedAt))return {ok:false,reason:'VERIFICATION_REQUIRED'};next.confirmedAt=now;next.confirmedBy=ctx.actorId||null}
 if(to==='FITTED'){if(!(item?.supervisorVerifiedAt||item?.denterCheckedAt)||!item?.confirmedAt)return {ok:false,reason:'CONFIRMATION_REQUIRED'};next.fittedAt=now;next.fittedBy=ctx.actorId||null}
 if(to==='RETURNED'){const rr=String(ctx.reason||'').trim();if(!rr)return {ok:false,reason:'RETURN_REASON_REQUIRED'};const physicallyReceived=Math.max(0,Math.min(Number(item.qty)||0,Number(item.receivedQty)||0));next.returnedQty=physicallyReceived;const snapshot={};for(const k of ['status','receivedQty','receivedAt','receivedBy','lastReceivedQty','partialReceipt','arrivalAccepted','arrivalAcceptedAt','supervisorVerifiedAt','supervisorVerifiedBy','denterCheckedAt','denterCheckedBy','confirmedAt','confirmedBy','fittedAt','fittedBy','purchaseAmount','purchaseRecordedAt','purchaseAmountRevision','billAmount','supplierCost','quoteAmount','price','supplier','quotationOffers','commercialRevision'])if(Object.prototype.hasOwnProperty.call(item,k))snapshot[k]=item[k];next.preReturnSnapshot=snapshot;next.returnReason=rr;next.returnedAt=now;next.returnedBy=ctx.actorId||null;delete next.receivedQty;delete next.receivedAt;delete next.receivedBy;delete next.lastReceivedQty;delete next.partialReceipt;delete next.arrivalAccepted;delete next.arrivalAcceptedAt;delete next.supervisorVerifiedAt;delete next.supervisorVerifiedBy;delete next.confirmedAt;delete next.confirmedBy;delete next.fittedAt;delete next.fittedBy;delete next.purchaseAmount;delete next.purchaseRecordedAt;delete next.purchaseAmountRevision;delete next.billAmount;delete next.supplierCost;delete next.quoteAmount;delete next.price;delete next.supplier;delete next.quotationOffers;delete next.commercialRevision}
 return {ok:true,item:next,audit:{type:'SPARE_PART_STATUS_CHANGED',entityId:String(item?.id||''),from,to,actorId:ctx.actorId||null,deviceId:ctx.deviceId||null,reason:ctx.reason||null}};
}
function cancelReturn(item,ctx={}){if(String(ctx.role||'')!=='Manager')return {ok:false,reason:'MANAGER_REQUIRED'};if(String(item?.status||'')!=='RETURNED')return {ok:false,reason:'PART_NOT_RETURNED'};const reason=String(ctx.reason||'').trim();if(!reason)return {ok:false,reason:'CANCEL_RETURN_REASON_REQUIRED'};const snapshot=item?.preReturnSnapshot;if(!snapshot||typeof snapshot!=='object'||String(snapshot.status||'')==='RETURNED')return {ok:false,reason:'RETURN_SNAPSHOT_UNAVAILABLE'};const now=ctx.serverTime||new Date().toISOString(),next=Object.assign({},item,snapshot,{updatedAt:now,updatedBy:ctx.actorId||null,returnCancelledAt:now,returnCancelledBy:ctx.actorId||null,returnCancelReason:reason});delete next.returnedAt;delete next.returnedBy;delete next.returnReason;delete next.returnedQty;delete next.preReturnSnapshot;return {ok:true,item:next,audit:{type:'SPARE_PART_RETURN_CANCELLED',entityId:String(item?.id||''),from:'RETURNED',to:String(next.status||snapshot.status||''),actorId:ctx.actorId||null,deviceId:ctx.deviceId||null,reason}}}
function notifySupervisor(item,ctx={}){
 if(String(ctx.role||'')!=='Denter')return {ok:false,reason:'DENTER_ONLY'};
 const now=ctx.serverTime||new Date().toISOString();
 return {ok:true,notification:{type:'SPARE_PART_DENTER_NOTICE',jobCard:item?.jobCard||null,partId:item?.id||null,targetRole:'Supervisor',title:'Spare Parts update',message:'Denter requested Supervisor attention for this Parts List.',action:'OPEN_SPARE_PART',createdAt:now,dedupeKey:['spare','DENTER_NOTICE',item?.id||'',item?.status||''].join(':')}};
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{spareParts:{STATUS,canSeePrice,allowed,canAct,sanitize,transition,cancelReturn,notifySupervisor}});
})();