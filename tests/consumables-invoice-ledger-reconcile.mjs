import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import C from '../supabase/functions/workshop-api/extensions/invoice_price_core.js';
const db=new PGlite(),actor={id:'m',role:'Manager'},token='manager';
const at=d=>Date.parse(d+'T00:00:00+04:00');
const initial={jobs:[{id:'unchanged'}],consumables:{schemaVersion:1,materials:[{id:'disc',name:'Disc 80',unit:'Piece',category:'Consumable',department:'Painting'}],brands:[{id:'brand',name:'KARUSHI'}],prices:[{id:'old',materialId:'disc',brandId:'brand',pricePerUnit:.2,effectiveFrom:at('2020-01-01')}],issues:[],actuals:[{id:'a1',jobCard:'JC1',locked:true,actualAt:at('2020-02-01'),lines:[{materialId:'disc',brandId:'brand',actualQuantity:2,priceId:'old',unitPriceSnapshot:.2,lineCost:.4}],totalCost:.4}],audit:[]}};
const json=JSON.stringify;
const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as r',args)).rows[0].r;
const snapshot=async()=>(await db.query("select revision,data from public.workshop_state where id='main'")).rows[0];
const balance=async()=>{const row=(await db.query('select physical,stock_value from public.zukait_stock_balances')).rows[0];return [Number(row.physical),Number(row.stock_value)]};
const invoiceRow=async id=>(await db.query('select * from public.zukait_purchase_invoices where id=$1',[id])).rows[0];
const line=(quantity,price)=>({materialId:'disc',brandId:'brand',unit:'Piece',quantity,priceMethod:'unit',price});
try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table public.staff_credentials(user_id text primary key,role text not null,active boolean default true,must_change boolean default false);
 create table public.staff_sessions(token_hash text primary key,user_id text references public.staff_credentials,revoked_at timestamptz);
 insert into public.staff_credentials(user_id,role) values('m','Manager');
 insert into public.staff_sessions(token_hash,user_id) values('manager','m');
 create table public.workshop_state(id text primary key,revision bigint,data jsonb not null);
 create function public.zukait_commit_workshop_state_v2(p_expected_revision bigint,p_data jsonb,p_changed_by text,p_live jsonb)
 returns jsonb language plpgsql as $f$ declare n bigint;begin
 update public.workshop_state set data=p_data,revision=revision+1 where id='main' and revision=p_expected_revision returning revision into n;
 if not found then return '{"ok":false,"code":"conflict"}';end if;
 if p_live='[]'::jsonb then return '{"ok":false,"code":"simulated_failure"}';end if;
 return jsonb_build_object('ok',true,'revision',n);end $f$;
 `);
 await db.query("insert into public.workshop_state values('main',1,$1::jsonb)",[json(initial)]);
 for(const file of ['CONSUMABLES_STOCK_COMPACT_FOUNDATION','CONSUMABLES_STOCK_COMPACT_RPC','CONSUMABLES_PURCHASE_INVOICE_ATOMIC','CONSUMABLES_PURCHASE_INVOICE_CORRECTION','CONSUMABLES_INVOICE_PRICE_APPLY','CONSUMABLES_INVOICE_PRICE_RECONCILIATION'])
  await db.exec(readFileSync('supabase/staged/'+file+'.sql','utf8'));
 await db.exec("insert into public.zukait_stock_material_keys(material_id,unit,display_name,department) values('disc','Piece','Disc 80','Painting');insert into public.zukait_stock_brand_keys(brand_id,display_name) values('brand','KARUSHI');insert into public.zukait_stock_balances(material_id,brand_id,unit) values('disc','brand','Piece')");
 const source={supplier:'Supplier',invoiceNumber:'INV1',invoiceDate:'2020-02-01',lines:[line(10,.15)]};
 const inv=await rpc('zukait_purchase_invoice_save',[token,'purchase1',json(source)]);
 assert.equal(inv.revision,1);assert.deepEqual(await balance(),[10,1.5]);
 const apply=async(invoice,rid)=>{
  const current=await snapshot(),reason='Reviewed invoice prices',review=C.invoicePriceReview(current.data,invoice,actor);
  const staged=C.prepareInvoicePriceApply(current.data,invoice,{requestId:rid,reason,review},actor);
  const result=await rpc('zukait_invoice_price_apply_commit',[token,invoice.id,invoice.revision,rid,json({reason,review}),current.revision,json(staged.consumables),json(staged.receipt),json([{}])]);
  assert.equal(result.ok,true);return staged.receipt;
 };
 const reconcile=async(invoice,app,mode,fields,rid,live=[{}])=>{
  const current=await snapshot(),correction={invoiceId:invoice.id,expectedRevision:invoice.revision,reason:'Reviewed invoice correction',...fields};
  const review=C.prepareInvoicePriceReconciliation(current.data,app,{},actor).review;
  const staged=C.prepareInvoicePriceReconciliation(current.data,app,{requestId:rid,reason:correction.reason,review},actor);
  return rpc('zukait_invoice_price_reconcile_commit',[token,invoice.id,invoice.revision,app.requestId,rid,mode,json(correction),json({mode,correction,review}),current.revision,json(staged.consumables),json(staged.receipt),json(live)]);
 };
 const app1=await apply(inv,'apply1');assert.equal((await snapshot()).data.consumables.actuals[0].totalCost,.3);
 const beforeHeader=await snapshot();
 const reference=await rpc('zukait_purchase_invoice_correct_header',[token,'reference1',json({invoiceId:inv.id,expectedRevision:1,supplier:'Corrected Supplier',invoiceNumber:'INV1A',invoiceDate:inv.invoice_date,reason:'Correct supplier and invoice reference'})]);
 assert.equal(reference.revision,2);assert.equal(reference.supplier,'Corrected Supplier');assert.deepEqual(await snapshot(),beforeHeader);
 assert.deepEqual(await balance(),[10,1.5]);
 const correction={invoiceId:inv.id,expectedRevision:2,reason:'Correct quantity and rate',lines:[line(12,.17)]};
 await assert.rejects(rpc('zukait_purchase_invoice_correct_lines',[token,'direct',json(correction)]),/INVOICE_PRICE_RECONCILIATION_REQUIRED/);
 assert.deepEqual(await balance(),[10,1.5]);
 await assert.rejects(reconcile(reference,app1,'lines',{lines:[line(12,.17)]},'reverse1',[]),/WORKSHOP_PRICE_RECONCILIATION_COMMIT_FAILED/);
 assert.deepEqual(await balance(),[10,1.5]);assert.equal((await invoiceRow(inv.id)).revision,2);
 const revised=await reconcile(reference,app1,'lines',{lines:[line(12,.17)]},'reverse1');
 assert.equal(revised.invoice.revision,3);assert.deepEqual(await balance(),[12,2.04]);assert.equal((await snapshot()).data.consumables.actuals[0].totalCost,.4);
 const app2=await apply(revised.invoice,'apply2');assert.equal((await snapshot()).data.consumables.actuals[0].totalCost,.34);
 const cancelled=await reconcile(revised.invoice,app2,'cancel',{},'reverse2');assert.equal(cancelled.invoice.status,'cancelled');assert.deepEqual(await balance(),[0,0]);assert.equal((await snapshot()).data.consumables.actuals[0].totalCost,.4);
 assert.deepEqual((await snapshot()).data.jobs,initial.jobs);
 const moves=(await db.query('select action,physical_delta from public.zukait_stock_movements order by id')).rows;
 assert.deepEqual(moves.map(x=>[x.action,Number(x.physical_delta)]),[['PURCHASE',10],['ADJUST',2],['ADJUST',-12]]);
 assert.equal(Number((await db.query('select count(*) as n from public.zukait_invoice_price_reconciliations')).rows[0].n),2);
 const timeline=await rpc('zukait_purchase_invoice_audit_list',[token,inv.id,0]);
 assert.deepEqual(timeline.map(x=>x.event_type).sort(),['INVOICE_CANCELLED','INVOICE_CORRECTED','INVOICE_CORRECTED','PRICE_APPLIED','PRICE_APPLIED','PRICE_RECONCILED','PRICE_RECONCILED','PURCHASE_CREATED'].sort());
 assert.equal(timeline.find(x=>x.event_type==='PURCHASE_CREATED').after_header.invoiceNumber,'INV1');
 console.log('Actual stock and invoice SQL: purchase, apply, rollback, correction, reapply, cancellation, stock totals and job costs PASS');
}finally{await db.close()}
