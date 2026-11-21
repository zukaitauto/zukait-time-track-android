import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {consumablesStockApi} from '../supabase/functions/workshop-api/extensions/consumables_stock_api.js';
import {mountMechanicalConsumablesHost} from '../app/src/main/assets/mechanical_consumables_host.js';
import {mountMechanicalConsumablesReturns} from '../app/src/main/assets/mechanical_consumables_returns_host.js';
import {mountMechanicalConsumablesTotals} from '../app/src/main/assets/mechanical_consumables_totals_host.js';

const roles={
  manager:{id:'m',role:'Manager'}, mechanical:{id:'ms',role:'Mechanical Supervisor'},
  bodyshop:{id:'bs',role:'Supervisor'},employee:{id:'e',role:'Employee'},
  reception:{id:'r',role:'Reception'},accountant:{id:'a',role:'Accountant'}
};
const requests=[];
const admin={
  async rpc(name,args){
    requests.push({name,args});
    return {data:{final:true,jobCard:'JC12500',lineCount:1,credit:1},error:null};
  },
  from(table){
    requests.push({table});
    const q={select:()=>q,eq:()=>q,order:()=>q,range:()=>q,limit:()=>q,
      then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};
    return q;
  }
};
const issue={operation:'WRITE',command:'MECHANICAL_ISSUE',requestId:'issue-1',
  data:{jobCard:'JC12500',lines:[{materialId:'oil',brandId:'a',quantity:1}]}};
const ret={operation:'WRITE',command:'MECHANICAL_RETURN',requestId:'return-1',
  data:{lineId:1,quantity:1,reason:'Unused original oil'}};
const totals={operation:'MECHANICAL_TOTALS',jobCard:'JC12500',page:0};
const master={operation:'MASTER_LINK',materialId:'oil',brandId:'a',origin:'Mechanical'};

for(const user of Object.values(roles)){
  for(const body of [issue,ret,totals,master]){
    let r=await consumablesStockApi(admin,user,body);
    assert.notEqual(r.status,200,'default flags must reject '+user.role+'/'+body.operation);
  }
}
assert.equal(requests.length,0,'disabled features may not read or write any Stock data');

for(const action of [issue,ret,totals,master]){
  for(const user of [roles.employee,roles.reception,roles.accountant]){
    const r=await consumablesStockApi(admin,user,action,{
      enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,
      masterLinkEnabled:true,sessionHash:'staff'});
    assert.equal(r.status,403,'non-stock '+user.role+' cannot '+action.operation);
  }
}
for(const action of [issue,ret,totals,master]){
  const r=await consumablesStockApi(admin,roles.bodyshop,action,{
    enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,
    masterLinkEnabled:true,sessionHash:'bodyshop'});
  assert.equal(r.status,403,'Bodyshop cannot execute Mechanical/Manager-only '+action.operation);
}
assert.equal(requests.length,0,'denied staff operations may not call Stock RPC');

for(const action of [issue,ret,totals]){
  const r=await consumablesStockApi(admin,roles.mechanical,action,{
    enabled:true,writesEnabled:true,mechanicalWritesEnabled:false,
    masterLinkEnabled:false,sessionHash:'mechanical'});
  assert.equal(r.status,423,'Mechanical stock must remain independently disabled');
}
let r=await consumablesStockApi(admin,roles.manager,master,{
  enabled:true,writesEnabled:true,masterLinkEnabled:false,sessionHash:'manager'});
assert.equal(r.status,423,'Manager master projection must be independently disabled');
assert.equal(requests.length,0);

r=await consumablesStockApi(admin,roles.manager,master,{
  enabled:true,writesEnabled:true,masterLinkEnabled:true,sessionHash:'manager'});
assert.equal(r.status,200);
assert.equal(requests.at(-1).name,'zukait_stock_link_master');
for(const [action,rpc] of [[issue,'zukait_stock_mechanical_issue'],
  [ret,'zukait_stock_mechanical_return'],[totals,'zukait_stock_mechanical_job_totals']]){
  r=await consumablesStockApi(admin,roles.mechanical,action,{
    enabled:true,writesEnabled:true,mechanicalWritesEnabled:true,sessionHash:'mechanical'});
  assert.equal(r.status,200,'authorized Mechanical action '+rpc);
  assert.equal(requests.at(-1).name,rpc);
}

const dom=new JSDOM('<main id="qa"></main>',{url:'https://qa.invalid'});
const root=dom.window.document.getElementById('qa');
let role='Mechanical Supervisor',enabled=false,sessionKey='local-qa',browserRequests=[];
const getSession=()=>({id:'MS-TEST',role,key:sessionKey});
const options={
  getSession,isEnabled:()=>true,stockEnabled:()=>enabled,
  stockRequest:async body=>{
    browserRequests.push(body);
    if(body.operation==='CATALOG')return {ok:true,items:[],hasMore:false};
    throw Error('No automatic return or total requests permitted');
  },
  storage:dom.window.localStorage,online:()=>true,onBack:()=>{}
};
for(const mount of [mountMechanicalConsumablesHost,
  mountMechanicalConsumablesReturns,mountMechanicalConsumablesTotals]){
  const c=await mount(root,options);
  assert.match(root.textContent,/not (yet )?activated/i);
  assert.equal(browserRequests.length,0,'flag OFF must cause zero browser requests');
  c.destroy();
}
enabled=true;role='Supervisor';
for(const mount of [mountMechanicalConsumablesHost,
  mountMechanicalConsumablesReturns,mountMechanicalConsumablesTotals]){
  const c=await mount(root,options);
  assert.match(root.textContent,/Mechanical Supervisor access required/);
  assert.equal(browserRequests.length,0,'wrong role must cause zero browser requests');
  c.destroy();
}
role='Mechanical Supervisor';
let c=await mountMechanicalConsumablesHost(root,options);
assert.equal(browserRequests.length,1,'activated issue page requests only catalog');
assert.equal(browserRequests[0].operation,'CATALOG');
c.destroy();
c=await mountMechanicalConsumablesReturns(root,options);
assert.equal(browserRequests.length,1,'return page does not fetch JC without search');
c.destroy();
c=await mountMechanicalConsumablesTotals(root,options);
assert.equal(browserRequests.length,1,'totals page does not fetch JC without search');
c.destroy();

// Opening the combined test app must not turn on either server feature gate.
const api=readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(api,/ZUKAIT_STOCK_ENABLED/);
assert.match(api,/ZUKAIT_MECHANICAL_STOCK_ENABLED/);
assert.match(api,/ZUKAIT_STOCK_MASTER_LINK_ENABLED/);
const server=readFileSync('supabase/functions/workshop-api/extensions/consumables_stock_api.js','utf8');
assert.match(server,/enabled=false,writesEnabled=false,mechanicalWritesEnabled=false,masterLinkEnabled=false/);
const supervisor=readFileSync('app/src/main/assets/mechanical_supervisor.js','utf8');
assert.match(supervisor,/window\.ZUKAIT_MECHANICAL_STOCK_ENABLED===true/);
assert.equal(browserRequests.length,1);
dom.window.close();
console.log('INTEGRATED RELEASE ROLE/FLAG GATE PASS: default-off zero calls; non-workshop, Bodyshop and disabled roles denied; scoped Mechanical and Manager RPCs; no implicit JC lookups');
