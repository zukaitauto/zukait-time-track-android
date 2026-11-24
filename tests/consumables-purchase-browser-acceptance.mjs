import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {PGlite} from '@electric-sql/pglite';
import {chromium} from 'playwright';
import {consumablesStockApi} from '../supabase/functions/workshop-api/extensions/consumables_stock_api.js';
import {invoicePriceApplyApi} from '../supabase/functions/workshop-api/extensions/invoice_price_apply_api.js';
import {invoicePriceReconcileApi} from '../supabase/functions/workshop-api/extensions/invoice_price_reconcile_api.js';

const db=new PGlite(), user={id:'m',role:'Manager'}, token='isolated-manager', at=d=>Date.parse(d+'T00:00:00+04:00');
const seed={jobs:[{id:'unchanged'}],consumables:{schemaVersion:1,materials:[{id:'disc',name:'Disc 80',unit:'Piece',category:'Consumable',department:'Painting'}],brands:[{id:'brand',name:'KARUSHI'}],prices:[{id:'old',materialId:'disc',brandId:'brand',unit:'Piece',pricePerUnit:.2,effectiveFrom:at('2020-01-01')}],issues:[],actuals:[{id:'a1',jobCard:'JC1',locked:true,actualAt:at('2020-02-01'),lines:[{materialId:'disc',brandId:'brand',actualQuantity:2,priceId:'old',unitPriceSnapshot:.2,lineCost:.4}],totalCost:.4}],audit:[]}};
const snapshot=async()=>(await db.query("select revision,data from public.workshop_state where id='main'")).rows[0];
const balance=async()=>{const r=(await db.query('select physical,stock_value from public.zukait_stock_balances')).rows[0];return [Number(r.physical),Number(r.stock_value)]};
const opts={enabled:true,writesEnabled:true,invoiceEnabled:true,sessionHash:token,computeLiveStatus:()=>[{employee_id:'qa',status:'Available'}]};
const admin={
 async rpc(name,args={}){try{
  assert.match(name,/^zukait_[a-z_]+$/);
  const entries=Object.entries(args);
  const values=entries.map(([k,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v);
  const sql='select public.'+name+'('+entries.map(([k,v],i)=>k+' => $'+(i+1)+(v!==null&&typeof v==='object'?'::jsonb':'')).join(',')+') as r';
  return {data:(await db.query(sql,values)).rows[0].r,error:null};
 }catch(error){return {data:null,error}}},
 from(table){
  assert.ok(['workshop_state','zukait_purchase_invoices','zukait_invoice_price_applications','zukait_invoice_price_reconciliations'].includes(table));
  const conditions=[],values=[];let columns='*';
  const query={select(c){assert.match(c,/^[a-z_,]+$/);columns=c;return query},eq(k,v){assert.match(k,/^[a-z_]+$/);values.push(v);conditions.push(k+'=$'+values.length);return query},is(k,v){assert.equal(v,null);assert.match(k,/^[a-z_]+$/);conditions.push(k+' is null');return query},
   async maybeSingle(){try{const rows=(await db.query('select '+columns+' from public.'+table+(conditions.length?' where '+conditions.join(' and '):''),values)).rows;if(rows.length>1)throw Error('ambiguous row');return {data:rows[0]||null,error:null}}catch(error){return {data:null,error}}},
   async single(){return query.maybeSingle()}};
  return query;
 }
};
let browser,server;
try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table public.staff_credentials(user_id text primary key,role text not null,active boolean default true,must_change boolean default false);
 create table public.staff_sessions(token_hash text primary key,user_id text references public.staff_credentials,revoked_at timestamptz);
 insert into public.staff_credentials(user_id,role) values('m','Manager'),('s','Supervisor');
 insert into public.staff_sessions(token_hash,user_id) values('isolated-manager','m'),('isolated-supervisor','s');
 create table public.workshop_state(id text primary key,revision bigint,data jsonb not null);
 create function public.zukait_commit_workshop_state_v2(p_expected_revision bigint,p_data jsonb,p_changed_by text,p_live jsonb)
 returns jsonb language plpgsql as $f$ declare n bigint;begin
 update public.workshop_state set data=p_data,revision=revision+1 where id='main' and revision=p_expected_revision returning revision into n;
 if not found then return '{"ok":false,"code":"conflict"}';end if;
 return jsonb_build_object('ok',true,'revision',n);end $f$;
 `);
 await db.query("insert into public.workshop_state values('main',1,$1::jsonb)",[JSON.stringify(seed)]);
 for(const name of ['CONSUMABLES_STOCK_COMPACT_FOUNDATION','CONSUMABLES_STOCK_COMPACT_RPC','CONSUMABLES_PURCHASE_INVOICE_ATOMIC','CONSUMABLES_PURCHASE_INVOICE_CORRECTION','CONSUMABLES_INVOICE_PRICE_APPLY','CONSUMABLES_INVOICE_PRICE_RECONCILIATION'])
  await db.exec(readFileSync('supabase/staged/'+name+'.sql','utf8'));
 await db.exec("insert into public.zukait_stock_material_keys(material_id,unit,display_name,department) values('disc','Piece','Disc 80','Painting');insert into public.zukait_stock_brand_keys(brand_id,display_name) values('brand','KARUSHI');insert into public.zukait_stock_balances(material_id,brand_id,unit) values('disc','brand','Piece')");
 const source=readFileSync('app/src/main/assets/consumables_ui.js','utf8');
 const end=source.indexOf('window.openConsumablesPlaceholder=function');
 assert.ok(end>0);
 const ui=source.slice(0,end)+'\n})();';
 const assets={'/consumables.js':readFileSync('app/src/main/assets/consumables.js','utf8'),'/stock.js':readFileSync('app/src/main/assets/consumables_stock_core.js','utf8'),'/ui.js':ui};
 server=createServer((req,res)=>{
  if(assets[req.url]){res.setHeader('Content-Type','application/javascript; charset=utf-8');return res.end(assets[req.url])}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:16px Arial}#modal{width:min(780px,100%);padding:8px;margin:auto}button{cursor:pointer}</style><main id="modal"></main>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[],dialogs=[];page.on('pageerror',e=>{errors.push(String(e));console.error('Browser error:',String(e))});page.on('dialog',d=>{dialogs.push(d.message());console.log('Browser dialog:',d.message());return d.accept()});
 await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 let dropResponse=false,saveIds=[],currentUser=user;
 await page.exposeFunction('qaCall',async(kind,body)=>{
  const options={...opts,sessionHash:currentUser.role==='Manager'?token:'isolated-supervisor'};
  const r=kind==='stock'?await consumablesStockApi(admin,currentUser,body,options):kind==='apply'?await invoicePriceApplyApi(admin,currentUser,{data:body},options):await invoicePriceReconcileApi(admin,currentUser,body,options);
  if(!r.body?.ok)console.log('QA API rejection:',kind,body.operation,r.body.code);
  if(kind==='stock'&&body.operation==='INVOICE_SAVE'){saveIds.push(body.requestId);if(dropResponse){dropResponse=false;return {drop:true}}}
  return {body:r.body,state:(await snapshot()).data};
 });
 const open=async()=>{
  await page.goto(base+'/');
  await page.evaluate(({s,u})=>{
   window.state=s;window.me=u;window.openModal=html=>document.querySelector('#modal').innerHTML=html;window.closeModal=()=>document.querySelector('#modal').innerHTML='';
   const request=async(k,b)=>{const result=await window.qaCall(k,b);if(result.drop)throw Error('NETWORK_INTERRUPTED');if(result.body?.ok)window.state=result.state;return result.body};
   window.zukaitCloud={ready:true,dirty:false,stockRequest:b=>request('stock',b),invoicePriceApply:b=>request('apply',b),invoicePriceReconcile:(operation,data)=>request('reconcile',{operation,data})};
  },{s:(await snapshot()).data,u:currentUser});
  for(const url of ['/consumables.js','/stock.js','/ui.js'])await page.addScriptTag({url:base+url});
  await page.evaluate(()=>consOpenPurchaseEntry());
  await page.waitForFunction(()=>!document.querySelector('#cpFinish').disabled);
 };
 const waitText=async(selector,value)=>{try{await page.waitForFunction(({selector,value})=>document.querySelector(selector)?.textContent.includes(value),{selector,value},{timeout:8000})}catch(e){console.error('Expected:',selector,value,'Actual:',await page.locator('#modal').textContent(),'Dialogs:',dialogs,'Page errors:',errors);throw e}};
 await open();
 await page.locator('#cpInvoice').fill('QA-001');await page.locator('#cpSupplier').fill('QA Supplier');await page.locator('#cpDate').fill('2020-02-01');
 await page.locator('#cpSearch').fill('KARUSHI Disc');await page.locator('#cpResults button').click();
 await page.locator('#cpQty').fill('10');await page.locator('#cpMethod').selectOption('total');await page.locator('#cpAmount').fill('1.500');
 assert.equal(await page.locator('#cpUnit').inputValue(),'0.150');
 await page.locator('#cpLineEditor button.cp-add').click();
 await waitText('#cpTotal','1.500');
 dropResponse=true;await page.locator('#cpFinish').click();await waitText('#cpSaveStatus','NETWORK_INTERRUPTED');
 assert.deepEqual(await balance(),[10,1.5]);assert.equal((await snapshot()).data.consumables.actuals[0].totalCost,.4);
 await open();await waitText('#cpSaveStatus','Previous save is unconfirmed');await page.locator('#cpFinish').click();
 await waitText('#cpHistory','QA-001');assert.equal(saveIds[0],saveIds[1]);assert.deepEqual(await balance(),[10,1.5]);
 const reviewFixture=(await db.query('select id,revision,status,invoice_date::text,lines from public.zukait_purchase_invoices')).rows[0];
 const reviewed=await page.evaluate(i=>ZukaitConsumables.invoicePriceReview(state,i,me),reviewFixture);
 assert.equal(reviewed[0].oldCost,.4);assert.equal(reviewed[0].newCost,.3);
 await page.locator('#cpHistory details summary').click();await page.getByRole('button',{name:'Review Brands & Price'}).click();
 await waitText('#modal','JC1');await waitText('#modal','0.400 → 0.300');
 await page.locator('#cpPriceReason').fill('QA approved rate');await page.locator('#cpPriceApply').click();await waitText('#cpPriceStatus','Prices saved');
 assert.equal((await snapshot()).data.consumables.actuals[0].totalCost,.3);assert.deepEqual(await balance(),[10,1.5]);
 await page.evaluate(()=>consOpenPurchaseInvoices());await waitText('#cpHistory','QA-001');await page.locator('#cpHistory details summary').click();
 await page.getByRole('button',{name:'Edit Invoice Details'}).click();await page.locator('#cpEditNumber').fill('QA-002');await page.locator('#cpEditReason').fill('QA invoice reference correction');await page.locator('#cpEditSave').click();
 await waitText('#cpHistory','QA-002');assert.equal((await snapshot()).data.consumables.actuals[0].totalCost,.3);
 await page.locator('#cpHistory details summary').click();await page.getByRole('button',{name:'Cancel Invoice'}).click();await page.locator('#cpEditReason').fill('QA reviewed cancellation');await page.locator('#cpEditSave').click();
 await page.waitForSelector('#cpReconcileSave');await waitText('#modal','0.300 → 0.400');await page.locator('#cpReconcileSave').click();await waitText('#cpHistory','CANCELLED');
 assert.deepEqual(await balance(),[0,0]);assert.equal((await snapshot()).data.consumables.actuals[0].totalCost,.4);
 await page.locator('#cpHistory details summary').click();await page.getByRole('button',{name:'Audit History'}).click();await waitText('#cpAudit','PRICE RECONCILED');
 assert.match(await page.locator('#cpAudit').textContent(),/PURCHASE CREATED/);
 assert.match(await page.locator('#cpAudit').textContent(),/PRICE APPLIED/);
 assert.match(await page.locator('#cpAudit').textContent(),/INVOICE CANCELLED/);
 assert.deepEqual((await snapshot()).data.jobs,seed.jobs);
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>consOpenPurchaseEntry(true));
  await page.waitForFunction(()=>!document.querySelector('#cpFinish').disabled);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'outer horizontal overflow at '+width);
 }
 currentUser={id:'s',role:'Supervisor'};await open();await page.evaluate(()=>consOpenPurchaseInvoices());await waitText('#cpHistory','CANCELLED');await page.locator('#cpHistory details summary').click();
 assert.equal(await page.getByRole('button',{name:'Audit History'}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('Browser purchase acceptance PASS: search, total-mode calculation, lost response and reload, price approval, reference-only correction, cancellation, audit, supervisor guard and responsive widths');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await db.close()}
