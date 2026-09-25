(function(){
'use strict';const V2=window.zukaitV2=window.zukaitV2||{},p=V2.spareParts=V2.spareParts||{};
const OMAN_OFFSET_MS=4*60*60*1000;
function omanDate(v){const d=new Date(v);return Number.isFinite(+d)?new Date(d.getTime()+OMAN_OFFSET_MS):d}
function dayKey(v){const d=omanDate(v);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0')}
function workshopDaysBetween(from,to,{holidayKeys=[],fridayDay=5}={}){let a=omanDate(from),b=omanDate(to);if(!Number.isFinite(+a)||!Number.isFinite(+b)||b<=a)return 0;a=new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),a.getUTCDate()));b=new Date(Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate()));const h=new Set(holidayKeys);let n=0;for(let d=new Date(a.getTime()+86400000);d<=b;d=new Date(d.getTime()+86400000)){if(d.getUTCDay()!==fridayDay&&!h.has(dayKey(new Date(d.getTime()-OMAN_OFFSET_MS))))n++}return n}
function newPeriodExpired(createdAt,now,opts){return workshopDaysBetween(createdAt,now,opts)>=3}
p.calendar={dayKey,workshopDaysBetween,newPeriodExpired};
})();