(function(){
'use strict';
const MAX_PAGE=500;
function clamp(n,d=100){n=Number(n||d);return Math.max(1,Math.min(MAX_PAGE,Math.floor(n)))}
function api(){return window.zukaitServerReports||null}
async function page(report,{cursor=null,limit=100,filters={}}={}){
 const a=api();if(!a||typeof a.page!=='function')return {rows:[],nextCursor:null,source:'server-required'};
 return a.page({report,cursor,limit:clamp(limit),filters});
}
const reports=['WIP','AUDIT','CYCLE_TIME','EFFICIENCY','REPEAT','ID001','OVERTIME','PARTS_DELAY','CONSUMABLES_VARIANCE','JOB_COST','COMPLETION_TARGET'];
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