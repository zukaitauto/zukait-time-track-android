(function(){
'use strict';const V2=window.zukaitV2=window.zukaitV2||{},p=V2.spareParts=V2.spareParts||{};
function lineResolved(x){if(!x||x.voided)return true;if(x.status==='CUSTOMER_SETTLEMENT')return true;const qs=p.quantity?.state(x);return x.status==='SUPERVISOR_CONFIRMED'&&(qs?qs.complete:true)&&Number.isFinite(Number(x.finalPriceOMR))}
function evaluate(list){const lines=(list?.lines||[]).filter(x=>x&&!x.voided),resolved=lines.filter(lineResolved),pricePending=lines.filter(x=>x.status==='SUPERVISOR_CONFIRMED'&&!Number.isFinite(Number(x.finalPriceOMR)));return{total:lines.length,resolved:resolved.length,pending:lines.length-resolved.length,pricePending:pricePending.map(x=>x.id),complete:lines.length>0&&resolved.length===lines.length}}
function apply(list){const e=evaluate(list);return{list:Object.assign({},list,{view:e.complete?'PURCHASE_COMPLETED':(list.deliveredPending?'DELIVERED_PENDING':'WAITING'),costingProvisional:!e.complete}),summary:e}}
p.completion={lineResolved,evaluate,apply};
})();