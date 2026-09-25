(function(){
'use strict';
const V2=window.zukaitV2=window.zukaitV2||{}, p=V2.spareParts=V2.spareParts||{};
const m=v=>p.money?p.money(v):Math.round((Number(v)||0)*1000)/1000;
function chargeable(x){return !!x&&!x.voided&&!['RETURNED','UNAVAILABLE','CUSTOMER_SETTLEMENT'].includes(String(x.status||''))&&x.finalPriceOMR!==null&&x.finalPriceOMR!==''&&Number.isFinite(Number(x.finalPriceOMR))}
function finalTotal(lines=[]){return m(lines.filter(chargeable).reduce((s,x)=>s+Number(x.finalPriceOMR),0))}
function splitCost(lines=[]){let initial=0,additional=0;(lines||[]).filter(chargeable).forEach(x=>{const v=Number(x.finalPriceOMR)||0;if(x.additional)additional+=v;else initial+=v});return{initial:m(initial),additional:m(additional),total:m(initial+additional)}}
function cap(capOMR,currentOMR){const c=Math.max(0,Number(capOMR)||0),v=Math.max(0,Number(currentOMR)||0);return{cap:m(c),current:m(v),balance:m(Math.max(0,c-v)),exceeded:c>0&&v>c,ratio:c>0?v/c:null}}
function period(records=[],from,to){const rows=records.filter(x=>!x.voided&&Number(x.finalPurchaseAt)>=from&&Number(x.finalPurchaseAt)<to);return{total:m(rows.reduce((s,x)=>s+(Number(x.finalPriceOMR)||0),0)),records:rows.length,jobCards:new Set(rows.map(x=>x.jobCard)).size}}
function byJobCard(records=[]){const out={};records.filter(x=>!x.voided).forEach(x=>{const k=String(x.jobCard||'');out[k]=m((out[k]||0)+(Number(x.finalPriceOMR)||0))});return out}
function priceVariance(quotedOMR,finalOMR){const q=Number(quotedOMR)||0,f=Number(finalOMR)||0;return{quoted:m(q),final:m(f),difference:m(f-q)}}
p.analytics={chargeable,finalTotal,splitCost,cap,period,byJobCard,priceVariance};
})();