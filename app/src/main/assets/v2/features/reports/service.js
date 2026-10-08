(function(){
'use strict';
const MAX_PAGE=500;
function clamp(n,d=100){n=Number(n||d);return Math.max(1,Math.min(MAX_PAGE,Math.floor(n)))}
function api(){return window.zukaitServerReports||null}
const inflight=new Map(),firstPageCache=new Map();
const FIRST_PAGE_TTL_MS=5000;
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.keys(value).sort().reduce((o,k)=>(o[k]=stable(value[k]),o),{});
 return value;
}
function requestKey(report,cursor,limit,filters){return JSON.stringify([String(report||'').toUpperCase(),cursor||null,clamp(limit),stable(filters||{})])}
async function page(report,{cursor=null,limit=100,filters={}}={}){
 const a=api();if(!a||typeof a.page!=='function')return {rows:[],nextCursor:null,source:'server-required'};
 // Spare Parts reads rebuild operational state after writes: never reuse a cached or pre-write in-flight response.
 if(String(report||'').toUpperCase()==='SPARE_PARTS')return a.page({report,cursor,limit:clamp(limit),filters});
 const key=requestKey(report,cursor,limit,filters),now=Date.now();
 // Only first-page report reads get a tiny cache. Operational writes, live status,
 // pagination and job-card search are intentionally untouched.
 if(!cursor){
  const cached=firstPageCache.get(key);
  if(cached&&now-cached.at<FIRST_PAGE_TTL_MS)return {...cached.value,source:'server-short-cache'};
 }
 if(inflight.has(key))return inflight.get(key);
 const req=Promise.resolve(a.page({report,cursor,limit:clamp(limit),filters})).then(value=>{
  if(!cursor)firstPageCache.set(key,{at:Date.now(),value});
  return value;
 }).finally(()=>inflight.delete(key));
 inflight.set(key,req);
 return req;
}
const reports=['WIP','AUDIT','CYCLE_TIME','EFFICIENCY','REPEAT','ID001','OVERTIME','PARTS_DELAY','SPARE_PARTS','CONSUMABLES_VARIANCE','JOB_COST','COMPLETION_TARGET'];
function supported(name){return reports.includes(String(name||'').toUpperCase())}
async function searchJobCards(query,{cursor=null,limit=50}={}){
 const q=String(query||'').trim();if(!q)return {rows:[],nextCursor:null,source:'empty-query'};
 const a=api();if(!a||typeof a.searchJobCards!=='function')return {rows:[],nextCursor:null,source:'server-required'};
 return a.searchJobCards({query:q,cursor,limit:clamp(limit)});
}
function labourCost(hours,rate=2.5){const h=Math.max(0,Number(hours||0)),r=Math.max(0,Number(rate||0));return Math.round(h*r*1000)/1000}
function dashboardContract(){return {serverPaginated:true,maxPage:MAX_PAGE,fullHistoryScan:false,reports:[...reports]}}
window.zukaitV2=Object.assign(window.zukaitV2||{},{reports:{MAX_PAGE,clamp,page,supported,searchJobCards,labourCost,dashboardContract}});
})();