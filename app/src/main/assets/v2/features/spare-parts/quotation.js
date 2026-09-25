(function(){
'use strict';
const V2=window.zukaitV2=window.zukaitV2||{}, p=V2.spareParts=V2.spareParts||{};
const slots=Object.freeze(['A','B','C']);
function empty(){return{shops:{A:'',B:'',C:''},prices:{},selected:{}}}
function setShop(q,slot,name){if(!slots.includes(slot))return{ok:false,code:'INVALID_SLOT'};const next=typeof structuredClone==='function'?structuredClone(q||empty()):JSON.parse(JSON.stringify(q||empty()));next.shops=next.shops||{};next.shops[slot]=String(name||'').trim();return{ok:true,quotation:next}}
function setPrice(q,partId,slot,amount,currency='OMR',rateToOMR=1){if(!slots.includes(slot)||!p.currencies?.includes(currency))return{ok:false,code:'INVALID_QUOTE'};const a=Number(amount),r=currency==='OMR'?1:Number(rateToOMR);if(amount===null||amount===''||!Number.isFinite(a)||a<0||!Number.isFinite(r)||r<=0)return{ok:false,code:'INVALID_AMOUNT'};const next=JSON.parse(JSON.stringify(q||empty()));next.prices=next.prices||{};next.prices[partId]=next.prices[partId]||{};next.prices[partId][slot]={amount:p.money?p.money(a):a,currency,rateToOMR:r,omrEquivalent:p.money?p.money(a*r):a*r};return{ok:true,quotation:next}}
function select(q,partId,slot){if(!q?.prices?.[partId]?.[slot])return{ok:false,code:'PRICE_NOT_ENTERED'};const next=JSON.parse(JSON.stringify(q));next.selected=next.selected||{};next.selected[partId]=slot;return{ok:true,quotation:next,expectedPrice:next.prices[partId][slot]}}
p.quotation={slots,empty,setShop,setPrice,select};
})();