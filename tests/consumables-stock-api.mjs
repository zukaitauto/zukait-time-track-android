import assert from 'node:assert/strict';
import { consumablesStockApi } from '../supabase/functions/workshop-api/extensions/consumables_stock_api.js';

let requests=[];
const admin={
 from(table){
   requests.push({type:'read',table});
   const q={
     select(cols){q.columns=cols;return q},order(){return q},eq(){return q},lt(){return q},
     range(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:{material_id:'oil5w30',brand_id:'brandA',unit:'Liter',physical:10,reserved:2},error:null})},
     then(resolve,reject){return Promise.resolve({data:table==='zukait_stock_balances'?
       (q.columns?.includes('material:zukait_stock_material_keys')?[
         {material_id:'oil',brand_id:'a',unit:'Liter',physical:20,reserved:1,
           material:{display_name:'Engine Oil 5W-30',department:'Mechanical',active:true},
           brand:{display_name:'Brand A',active:true}},
         {material_id:'primer',brand_id:'b',unit:'Liter',physical:3,reserved:0,
           material:{display_name:'Primer',department:'Painting',active:true},
           brand:{display_name:'Brand B',active:true}},
         {material_id:'inactive',brand_id:'c',unit:'Piece',physical:3,reserved:0,
           material:{display_name:'WD-40',department:'Mechanical',active:false},
           brand:{display_name:'Brand C',active:true}}
       ]:Array.from({length:101},(_,i)=>({material_id:'m'+i,brand_id:'b'}))):
       table==='zukait_stock_movements'?Array.from({length:51},(_,i)=>({id:300-i})):
       [],error:null}).then(resolve,reject)}
   };return q;
 },
 async rpc(fn,args){requests.push({type:'write',fn,args});return {data:{ok:true},error:null}}
};
const M={role:'Manager',id:'m'},S={role:'Supervisor',id:'s'},E={role:'Employee',id:'e'};
let r=await consumablesStockApi(admin,E,{operation:'LIST'},{enabled:true});
assert.equal(r.status,403);assert.equal(requests.length,0);
r=await consumablesStockApi(admin,M,{operation:'LIST'},{enabled:false});
assert.equal(r.status,503);assert.equal(requests.length,0);
r=await consumablesStockApi(admin,S,{operation:'LIST'},{enabled:true});
assert.equal(r.body.items.length,100);assert.equal(r.body.hasMore,true);
r=await consumablesStockApi(admin,S,{operation:'HISTORY'},{enabled:true});
assert.equal(r.body.history.length,50);assert.equal(r.body.hasMore,true);
r=await consumablesStockApi(admin,S,{operation:'WRITE',command:'PURCHASE',
 requestId:'one',data:{materialId:'m',brandId:'b',quantity:1,price:2,priceMethod:'unit'}},{enabled:true});
assert.equal(r.status,423);
r=await consumablesStockApi(admin,S,{operation:'WRITE',command:'ADJUST',requestId:'two',data:{}},
 {enabled:true,writesEnabled:true,sessionHash:'hash'});
assert.equal(r.status,403);
r=await consumablesStockApi(admin,M,{operation:'WRITE',command:'PURCHASE',
 requestId:'idem-1',data:{materialId:'m',brandId:'b',quantity:1,price:2,priceMethod:'total'}},
 {enabled:true,writesEnabled:true,sessionHash:'test-session-hash'});
assert.equal(r.status,200);
const write=requests.filter(x=>x.type==='write').at(-1);
assert.equal(write.fn,'zukait_stock_command');
assert.equal(write.args.p_session_hash,'test-session-hash');
assert.equal(write.args.p_request_id,'idem-1');
r=await consumablesStockApi(admin,M,{operation:'LIST',actorRole:'Manager'},{enabled:true});
assert.equal(r.status,400,'client cannot provide arbitrary actor role');
r=await consumablesStockApi(admin,M,{operation:'HISTORY',cursor:'not-valid'},{enabled:true});
assert.equal(r.status,400);
const MS={role:'Mechanical Supervisor',id:'ms'};
r=await consumablesStockApi(admin,MS,{operation:'CATALOG',page:0},{enabled:true});
assert.equal(r.status,200);
assert.equal(r.body.items.length,1,'Mechanical catalog excludes Painting and inactive materials');
assert.equal(r.body.items[0].name,'Engine Oil 5W-30');
assert.equal(r.body.items[0].brand,'Brand A');
assert.equal(r.body.items[0].physical-r.body.items[0].reserved,19);
assert.equal(requests.filter(x=>x.type==='read'&&x.table==='workshop_state').length,0,
 'Mechanical catalog must not fetch workshop-state snapshots');

// A submitted Master name/price must NEVER be trusted by Stock.
const previewReq={operation:'LEGACY_PREVIEW',page:0};
r=await consumablesStockApi(admin,S,previewReq,{enabled:true,masterLinkEnabled:true,sessionHash:'staff'});
assert.equal(r.status,403,'only Manager can preview older master pairs');
r=await consumablesStockApi(admin,M,previewReq,{enabled:true,sessionHash:'manager'});
assert.equal(r.status,423,'legacy preview remains disabled until stock master link is enabled');
r=await consumablesStockApi(admin,M,{...previewReq,page:50},
 {enabled:true,masterLinkEnabled:true,sessionHash:'manager'});
assert.equal(r.status,400,'only bounded legacy preview pages allowed');
r=await consumablesStockApi(admin,M,previewReq,
 {enabled:true,masterLinkEnabled:true,sessionHash:'manager'});
assert.equal(r.status,200);
const previewCall=requests.filter(x=>x.type==='write').at(-1);
assert.equal(previewCall.fn,'zukait_stock_legacy_preview');
assert.deepEqual(previewCall.args,{p_session_hash:'manager',p_page:0});
const linkReq={operation:'MASTER_LINK',materialId:'oil5w30',brandId:'brandA',origin:'Mechanical'};
const beforeLinks=requests.filter(x=>x.type==='write').length;
r=await consumablesStockApi(admin,S,linkReq,{enabled:true,masterLinkEnabled:true,sessionHash:'supervisor'});
assert.equal(r.status,403,'only Manager may link the authoritative Master');
r=await consumablesStockApi(admin,M,linkReq,{enabled:true,sessionHash:'manager'});
assert.equal(r.status,423,'new stock Master integration stays disabled by default');
r=await consumablesStockApi(admin,M,{...linkReq,unit:'Piece'},
  {enabled:true,masterLinkEnabled:true,sessionHash:'manager'});
assert.equal(r.status,400,'client cannot inject unit or purchase cost');
r=await consumablesStockApi(admin,M,linkReq,
 {enabled:true,masterLinkEnabled:true,sessionHash:'manager'});
assert.equal(r.status,200);
const linkWrite=requests.filter(x=>x.type==='write').at(-1);
assert.equal(linkWrite.fn,'zukait_stock_link_master');
assert.deepEqual(linkWrite.args,{
 p_session_hash:'manager',p_material_id:'oil5w30',p_brand_id:'brandA',p_origin:'Mechanical'
});
assert.equal(requests.filter(x=>x.type==='write').length,beforeLinks+1,
 'denied/disabled master requests cannot make a DB write');

const mechanical={operation:'WRITE',command:'MECHANICAL_ISSUE',requestId:'issue-1',
 data:{jobCard:'JC12500',lines:[{materialId:'oil5w30',brandId:'brandA',quantity:4.5}]}};
r=await consumablesStockApi(admin,MS,{operation:'LIST'},{enabled:true});
assert.equal(r.status,403,'Mechanical Supervisor cannot list Painting stock');
r=await consumablesStockApi(admin,MS,{operation:'HISTORY'},{enabled:true});
assert.equal(r.status,403,'Mechanical Supervisor cannot read general movement history');
r=await consumablesStockApi(admin,MS,{operation:'BALANCE',materialId:'oil5w30',brandId:'brandA'},{enabled:true});
assert.equal(r.status,403,'Mechanical Supervisor uses department-scoped catalog, not unrestricted balance lookup');
r=await consumablesStockApi(admin,M,{operation:'BALANCE',materialId:'oil5w30',brandId:'brandA'},{enabled:true});
assert.equal(r.status,200);
assert.equal(r.body.item.material_id,'oil5w30');
assert.equal(r.body.item.physical-r.body.item.reserved,8);
r=await consumablesStockApi(admin,M,{operation:'BALANCE',materialId:'not valid',brandId:'brandA'},{enabled:true});
assert.equal(r.status,400);
const countWrites=()=>requests.filter(x=>x.type==='write').length;
const earlier=countWrites();
r=await consumablesStockApi(admin,MS,mechanical,
 {enabled:true,writesEnabled:true,sessionHash:'mechanical-session'});
assert.equal(r.status,423,'Mechanical issue has an independent default-off flag');
assert.equal(countWrites(),earlier);
r=await consumablesStockApi(admin,S,mechanical,
 {enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'bodyshop-session'});
assert.equal(r.status,403,'Bodyshop Supervisor cannot issue Mechanical materials');
assert.equal(countWrites(),earlier);
r=await consumablesStockApi(admin,MS,{...mechanical,command:'PURCHASE'},
 {enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'mechanical-session'});
assert.equal(r.status,403,'Mechanical Supervisor cannot change general stock purchases');
r=await consumablesStockApi(admin,MS,mechanical,
 {enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'mechanical-session'});
assert.equal(r.status,200);
const finalWrite=requests.filter(x=>x.type==='write').at(-1);
assert.equal(finalWrite.fn,'zukait_stock_mechanical_issue');
assert.equal(finalWrite.args.p_session_hash,'mechanical-session');
assert.deepEqual(finalWrite.args.p_data,mechanical.data);
assert.equal(Object.hasOwn(finalWrite.args,'p_action'),false);
r=await consumablesStockApi(admin,M,mechanical,
 {enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'manager-session'});
assert.equal(r.status,200);

// Returning Mechanical materials must never route to Painting's reservation RETURN.
const returnable={operation:'MECHANICAL_RETURNABLE',jobCard:'JC12500',page:0};
const ret={operation:'WRITE',command:'MECHANICAL_RETURN',requestId:'return-1',
 data:{lineId:71,quantity:1.5,reason:'Unused oil'}};
const writesBeforeReturn=countWrites();
r=await consumablesStockApi(admin,S,returnable,{enabled:true,mechanicalWritesEnabled:true,sessionHash:'s'});
assert.equal(r.status,403,'Bodyshop Supervisor cannot inspect Mechanical issues');
r=await consumablesStockApi(admin,MS,returnable,{enabled:true,sessionHash:'ms'});
assert.equal(r.status,423,'Mechanical returns are independently disabled by default');
r=await consumablesStockApi(admin,MS,{...returnable,jobCard:'INVALID/JC'},
 {enabled:true,mechanicalWritesEnabled:true,sessionHash:'ms'});
assert.equal(r.status,400,'untrusted JC values rejected');
r=await consumablesStockApi(admin,MS,returnable,
 {enabled:true,mechanicalWritesEnabled:true,sessionHash:'ms'});
assert.equal(r.status,200);
const readReturn=requests.filter(x=>x.type==='write').at(-1);
assert.equal(readReturn.fn,'zukait_stock_mechanical_returnable');
assert.deepEqual(readReturn.args,{p_session_hash:'ms',p_job_card:'JC12500',p_page:0});
r=await consumablesStockApi(admin,MS,ret,
 {enabled:true,writesEnabled:true,sessionHash:'ms'});
assert.equal(r.status,423,'return write not enabled by general stock flag alone');
r=await consumablesStockApi(admin,S,ret,
 {enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'s'});
assert.equal(r.status,403,'Painting Supervisor cannot return Mechanical issues');
r=await consumablesStockApi(admin,MS,ret,
 {enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'ms'});
assert.equal(r.status,200);
const retWrite=requests.filter(x=>x.type==='write').at(-1);
assert.equal(retWrite.fn,'zukait_stock_mechanical_return');
assert.equal(retWrite.args.p_request_id,'return-1');
assert.equal(retWrite.args.p_session_hash,'ms');
assert.deepEqual(retWrite.args.p_data,ret.data);
assert.equal(Object.hasOwn(retWrite.args,'p_action'),false);
assert.equal(countWrites(),writesBeforeReturn+2,'only authorized read+return can reach RPC');
// Only Mechanical Supervisor or Manager may view JC-specific net cost totals.
const totals={operation:'MECHANICAL_TOTALS',jobCard:'JC12500',page:0};
const beforeTotals=requests.filter(x=>x.type==='write').length;
r=await consumablesStockApi(admin,S,totals,
 {enabled:true,mechanicalWritesEnabled:true,sessionHash:'bodyshop'});
assert.equal(r.status,403,'Bodyshop cannot view Mechanical JC costs');
r=await consumablesStockApi(admin,MS,totals,{enabled:true,sessionHash:'mechanical'});
assert.equal(r.status,423,'Mechanical totals stay gated off until stock release');
r=await consumablesStockApi(admin,MS,{...totals,page:50},
 {enabled:true,mechanicalWritesEnabled:true,sessionHash:'mechanical'});
assert.equal(r.status,400,'only bounded pages for JC totals');
r=await consumablesStockApi(admin,MS,{...totals,jobCard:'JC*'},
 {enabled:true,mechanicalWritesEnabled:true,sessionHash:'mechanical'});
assert.equal(r.status,400,'no arbitrary SQL/JC filter');
r=await consumablesStockApi(admin,MS,totals,
 {enabled:true,mechanicalWritesEnabled:true,sessionHash:'mechanical'});
assert.equal(r.status,200);
const totalRead=requests.filter(x=>x.type==='write').at(-1);
assert.equal(totalRead.fn,'zukait_stock_mechanical_job_totals');
assert.deepEqual(totalRead.args,{p_session_hash:'mechanical',p_job_card:'JC12500',p_page:0});
r=await consumablesStockApi(admin,M,totals,
 {enabled:true,mechanicalWritesEnabled:true,sessionHash:'manager'});
assert.equal(r.status,200);
assert.equal(requests.filter(x=>x.type==='write').length,beforeTotals+2,'only authorized totals RPCs can reach database');
assert.equal(requests.filter(x=>x.type==='read'&&x.table==='workshop_state').length,0,
 'Totals must never pull workshop state');

console.log('Stock API: roles, disabled-by-default, separate Mechanical issue/return RPC, bounded returnable read, and JC net totals PASS');
