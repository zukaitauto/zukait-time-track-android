import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {consumablesStockApi} from '../supabase/functions/workshop-api/extensions/consumables_stock_api.js';

// Stock stays closed for missing production schema/disabled flags. This is a
// real-data activation path for the normal Android/Web app, NOT a test-only URL.
let dbReads=0;
const admin={from(table){
  assert.equal(table,'zukait_stock_balances');
  return {select(column){
    assert.equal(column,'material_id');
    return {limit(count){assert.equal(count,1);dbReads++;return Promise.resolve({data:[],error:null})}};
  }};
}};
const manager={role:'Manager'};
let reply=await consumablesStockApi(admin,manager,{operation:'STATUS'},{
  enabled:false,writesEnabled:false,masterLinkEnabled:false
});
assert.equal(reply.status,200);
assert.equal(reply.body.ready,false);
assert.equal(reply.body.writes,false);
assert.equal(dbReads,0,'Disabled stock must not query tables');
reply=await consumablesStockApi(admin,{role:'Employee'},{operation:'STATUS'},{
  enabled:true,writesEnabled:true,masterLinkEnabled:true
});
assert.equal(reply.status,403,'Unapproved employees cannot check Stock status');
assert.equal(dbReads,0);
reply=await consumablesStockApi(admin,manager,{operation:'STATUS'},{
  enabled:true,writesEnabled:true,masterLinkEnabled:true
});
assert.equal(reply.body.ready,true);
assert.equal(reply.body.writes,true);
assert.equal(reply.body.masterLink,true);
assert.equal(dbReads,1);

const source=readFileSync('app/src/main/assets/consumables_stock_ui.js','utf8');
const html=readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.ok(html.includes('window.ZUKAIT_STOCK_LIVE_CHECK_ON_OPEN=true'),
  'Normal app must use a bounded readiness check, not a test-only APK');
assert.ok(html.includes('window.ZUKAIT_STOCK_UI_PREVIEW_ONLY=true'),
  'Normal app must fail closed before readiness is confirmed');
assert.doesNotMatch(source,/get\\('stockPilot'\\)/,
  'Production Stock activation must not depend on a browser URL');

function makeFixture(status,role='Manager'){
  const requests=[]; let output=''; let screen=null; let token='session-one';
  const body={style:{overflow:''},appendChild(element){screen=element;}};
  const window={
    location:{search:''},ZUKAIT_STOCK_UI_PREVIEW_ONLY:true,
    ZUKAIT_STOCK_LIVE_CHECK_ON_OPEN:true,
    zukaitAuth:{getToken:()=>token},
    zukaitCloud:{async stockRequest(command){
      requests.push(command);
      if(command.operation==='STATUS')return status();
      if(command.operation==='LIST')return {ok:true,items:[{
        material_id:'M',brand_id:'B',unit:'Liter',physical:10,reserved:0,
        stock_value:30,minimum:1
      }],hasMore:false};
      throw Error('Unexpected Stock operation: '+command.operation);
    }},
    ZukaitConsumables:{ensureState(s){return s.consumables;}},
    openModal(value){output=value;},closeModal(){}
  };
  const doc={
    body,
    getElementById(id){return id==='zs-stock-screen'?screen:null;},
    createElement(tag){return {
      tagName:tag.toUpperCase(),dataset:{},setAttribute(){},
      focus(){},remove(){if(screen===this)screen=null;}
    };}
  };
  const ctx={window,document:doc,URLSearchParams,
    state:{consumables:{
      materials:[{id:'M',name:'Primer',unit:'Liter',active:true}],
      brands:[{id:'B',name:'Brand',active:true}],
      prices:[{materialId:'M',brandId:'B',pricePerUnit:3}]
    }},
    me:{id:'user',role},navigator:{onLine:true}};
  runInNewContext(source,ctx);
  return {window,requests,output:()=>output,screen:()=>screen,
    changeSession(value){token=value;}};
}

const denied=makeFixture(()=>({ok:true,live:false,ready:false,writes:false,masterLink:false}));
await denied.window.openStockManagement();
assert.deepEqual(denied.requests.map(x=>x.operation),['STATUS'],
  'Disabled server must not receive LIST or WRITE');
assert.match(denied.screen().innerHTML,/UI PREVIEW ONLY/);

const noWrite=makeFixture(()=>({ok:true,live:true,ready:true,writes:false,masterLink:true}));
await noWrite.window.openStockManagement();
assert.deepEqual(noWrite.requests.map(x=>x.operation),['STATUS'],
  'Read-only flag must not open a writable Stock screen');

let live=true;
const approved=makeFixture(()=>({ok:true,live,ready:live,writes:live,masterLink:live}));
await approved.window.openStockManagement();
assert.deepEqual(approved.requests.map(x=>x.operation),['STATUS'],
  'Five-card home must not fetch stock until a card is opened');
assert.match(approved.screen().innerHTML,/zs-home-grid/);
assert.match(approved.screen().innerHTML,/Consumables Stock Management/);
assert.equal(approved.output(),'','Live stock must use the full-screen page, not a modal');
await approved.window.zukStockLiveNavigate('balance');
assert.deepEqual(approved.requests.map(x=>x.operation),['STATUS','LIST']);
assert.match(approved.screen().innerHTML,/10\.00 Liter/);
assert.doesNotMatch(approved.screen().innerHTML,/UI PREVIEW ONLY/);
approved.window.zukStockLiveHome();
assert.match(approved.screen().innerHTML,/zs-home-grid/);
live=false;approved.changeSession('session-two');
await approved.window.openStockManagement();
assert.deepEqual(approved.requests.map(x=>x.operation),['STATUS','LIST','STATUS'],
  'Another staff session must require a fresh server check');
assert.match(approved.screen().innerHTML,/UI PREVIEW ONLY/);

const employee=makeFixture(()=>({ok:true,live:true,ready:true,writes:true,masterLink:true}),'Employee');
await employee.window.openStockManagement();
assert.equal(employee.requests.length,0,'Employee should never probe stock');
console.log('PASS: existing Android/Web app requires authenticated server stock readiness; no accidental stock writes.');
