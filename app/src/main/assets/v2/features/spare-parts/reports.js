(function(){
'use strict';const V2=window.zukaitV2=window.zukaitV2||{},p=V2.spareParts=V2.spareParts||{};
function rows(lists=[]){const out=[];(lists||[]).forEach(l=>(l.lines||[]).filter(x=>(p.analytics?.chargeable?p.analytics.chargeable(x):x&&!x.voided)&&x.finalPurchaseAt).forEach(x=>out.push({jobCard:l.jobCard,pl:l.number,registration:l.registration,make:l.make,model:l.model,part:x.name,qty:x.qty,additional:!!x.additional,finalPriceOMR:Number(x.finalPriceOMR)||0,finalPurchaseAt:Number(x.finalPurchaseAt)||Date.parse(x.finalPurchaseAt)||0})));return out}
function report(lists,from,to){const r=rows(lists).filter(x=>x.finalPurchaseAt>=from&&x.finalPurchaseAt<to),a=p.analytics.period(r,from,to);return{...a,rows:r,byJobCard:p.analytics.byJobCard(r),initialAdditional:p.analytics.splitCost(r.map(x=>({finalPriceOMR:x.finalPriceOMR,additional:x.additional})))}}
function actions(){return Object.freeze(['PRINT','PDF','WHATSAPP_TEXT','WHATSAPP_PDF','BACK'])}
function whatsappSummary(title,r){return[String(title||'Spare Parts Report'),...r.rows.map(x=>[x.jobCard,x.part,'Qty '+x.qty,p.money(x.finalPriceOMR).toFixed(3)+' OMR'].join(' · ')),'Total: '+p.money(r.total).toFixed(3)+' OMR'].join('\n')}
p.partsReports={rows,report,actions,whatsappSummary};
})();