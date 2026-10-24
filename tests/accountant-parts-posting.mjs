import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {billRoute} from '../supabase/functions/workshop-api/accountant/extensions/bill_route.js';
import {projectSpareParts} from '../supabase/functions/workshop-api/accountant/spare_projection.js';
export async function accountantPartsPosting({db,native,pg,config,database}) {
 const actor={id:'QA_ACCT',role:'Accountant'},hash='9a'.repeat(32),secret='synthetic-posting-key-only';
 const supplier=(await db.query('select id from zukait_suppliers.current_suppliers where active order by id limit 1')).rows[0].id;
 const today=(await db.query("select to_char(now() at time zone 'Asia/Muscat','YYYY-MM-DD') d")).rows[0].d;
 const query='select public.zukait_bill_pipeline($1,$2,$3,$4::uuid,$5,$6::jsonb) r',args=p=>[p.p_actor,p.p_hash,p.p_kind,p.p_request,p.p_fingerprint,JSON.stringify(p.p_input)];
 const admin={rpc:async(n,p)=>{await db.exec('set role service_role');try{return {data:(await db.query(query,args(p))).rows[0].r}}catch(error){return {error}}finally{await db.exec('reset role')}}};
 const route=body=>billRoute(admin,actor,body,{enabled:true,sessionHash:hash,secret});
 const preview=async id=>(await route({action:'accountant_bill_preview',supplierId:supplier,sources:[{type:'SPARE_PART_LINE',id}]})).body;
 const make=p=>({requestId:randomUUID(),entityId:randomUUID(),supplierId:supplier,deviceId:'QA',reason:'Reviewed confirmed Parts supplier invoice',expectedSupplierRevision:p.supplierRevision,expectedPayableRevision:p.payableRevision,expectedWorkshopRevision:p.workshopRevision,invoiceReference:randomUUID(),invoiceDate:'2026-10-21',transactionDate:today,invoiceTotalMills:p.receivedMaterialMills,expectedMaterialMills:p.receivedMaterialMills,sources:p.sources.map(s=>({type:s.type,id:s.id,expectedReceiptDigest:s.receiptDigest})),invoiceReviewed:true});
 const post=async c=>(await route({action:'accountant_bill_post',command:c})).body;
 let sequence=0;const events=new Map();
 async function event(id,type,revision,payload,connection=db){const e={event_id:randomUUID(),entity_id:id,event_type:type,revision,server_time:new Date(Date.parse('2026-10-20T08:00:00Z')+ ++sequence*1000).toISOString(),payload:{partId:id,listNo:'QA_PL_'+id,jobCard:'QA_JC_0',...payload}};
  await connection.query('insert into workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values($1,$2,$3,$4,$5,$6::jsonb)',[e.event_id,id,type,revision,e.server_time,JSON.stringify(e.payload)]);if(!events.has(id))events.set(id,[]);events.get(id).push(e);return e;
 }
 async function fixture(id,{price=true,confirmed=true,partial=false}={}) {
  await event(id,'SPARE_PART_LISTED',1,{name:'Synthetic lamp '+id,qty:partial?4:2});
  await event(id,'SPARE_PART_STATUS_CHANGED',2,{from:'LISTED',to:'ORDERED'});
  
  if(confirmed)await event(id,'SPARE_PART_STATUS_CHANGED',3,{from:'ORDERED',to:'RECEIVED',receivedQty:2});
  if(confirmed&&partial){await event(id,'SPARE_PART_MANAGER_CORRECTED',4,{before:{status:'RECEIVED'},after:{status:'RECEIVED',qty:4,purchaseAmount:'5.001'},reason:'Synthetic approved partial price'});}else if(confirmed){await event(id,'SPARE_PART_STATUS_CHANGED',4,{from:'RECEIVED',to:'SUPERVISOR_VERIFIED'});if(price)await event(id,'SPARE_PART_FINAL_PRICE_RECORDED',1,{finalPrice:'5.001'});}
  // Synthetic private mapping fixture only; application binding is qualified separately.
  const request=randomUUID();await db.query("insert into workshop_accountant_commands values($1,$2,$3,'{}'::jsonb,now())",[request,actor.id,'a'.repeat(64)]);await db.query('insert into zukait_suppliers.source_links values($1,$2,$3,$4)',['SPARE_PART_LINE',id,supplier,request]);
 }
 const helper=async id=>(await db.query('select zukait_bills.parts_receipt($1) r',[id])).rows[0].r;
 const unchanged=async()=>JSON.stringify({ws:(await db.query('select * from workshop_state')).rows,history:(await db.query('select * from workshop_state_history')).rows,live:(await db.query('select * from workshop_live_status')).rows,ledger:(await db.query('select * from workshop_accounting_entries')).rows});
 await fixture('QA_PART_A');assert.equal((await preview('QA_PART_A')).code,'bill_source_unsupported');await db.exec('update zukait_bills.control set parts_enabled=true');const before=await unchanged();let p=await preview('QA_PART_A');assert.equal(p.ok,true,JSON.stringify(p));assert.equal(p.receivedMaterialMills,10002);assert.equal(p.sources[0].receivedQuantity,2);assert.ok(!JSON.stringify(p).includes('PRIVATE LABEL'));
 const old=make(p),normalized=(await db.query("select revision from workshop_v2_spare_part_state where part_id='QA_PART_A'")).rows[0].revision;
 await event('QA_PART_A','SPARE_PART_FINAL_PRICE_RECORDED',2,{finalPrice:'7.125'});
 assert.equal((await db.query("select revision from workshop_v2_spare_part_state where part_id='QA_PART_A'")).rows[0].revision,normalized);
 assert.equal((await post(old)).code,'bill_receipt_changed','Price changes invalidate review without normalized/workshop revision');
 p=await preview('QA_PART_A');assert.equal(p.receivedMaterialMills,14250);
 await event('QA_PART_A','SPARE_PART_COMMERCIAL_UPDATED',2,{purchaseAmount:'7.125',supplier:'PRIVATE LABEL'});p=await preview('QA_PART_A');assert.equal(p.receivedMaterialMills,14250);
 const item=projectSpareParts(events.get('QA_PART_A'))[0].items[0];assert.equal(p.receivedMaterialMills,Math.round(Number(item.purchaseAmount)*item.receivedQty*1000),'Existing event projection parity');
 let c=make(p),r=await post(c);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.amountMills,14250);assert.equal((await post(c)).duplicate,true);assert.equal((await preview('QA_PART_A')).code,'bill_source_already_billed');assert.equal(await unchanged(),before);
 await fixture('QA_PART_PARTIAL',{partial:true});assert.equal((await preview('QA_PART_PARTIAL')).receivedMaterialMills,10002,'Only two of four physically received parts count');
 await fixture('QA_PART_UNKNOWN',{price:false});assert.equal((await preview('QA_PART_UNKNOWN')).code,'bill_receipt_review');
 await fixture('QA_PART_UNCONFIRMED',{confirmed:false});assert.equal((await preview('QA_PART_UNCONFIRMED')).code,'bill_receipt_review');
 await fixture('QA_PART_CORRECT');await event('QA_PART_CORRECT','SPARE_PART_FINAL_PRICE_RECORDED',2,{finalPrice:9});
 await event('QA_PART_CORRECT','SPARE_PART_MANAGER_CORRECTED',5,{before:{status:'SUPERVISOR_VERIFIED',purchaseAmount:9},after:{status:'SUPERVISOR_VERIFIED',qty:2,purchaseAmount:'6.250'},reason:'Synthetic correction'});
 assert.equal((await helper('QA_PART_CORRECT')).receivedCostMills,12500,'Correction supersedes older final price');
 await event('QA_PART_CORRECT','SPARE_PART_MANAGER_CORRECTED',6,{before:{status:'SUPERVISOR_VERIFIED',purchaseAmount:'6.250'},after:{status:'SUPERVISOR_VERIFIED',qty:2,purchaseAmount:null},reason:'Synthetic unknown price'});
 await assert.rejects(helper('QA_PART_CORRECT'),/bill_receipt_review/);
 await fixture('QA_PART_RETURN');await event('QA_PART_RETURN','SPARE_PART_STATUS_CHANGED',5,{from:'SUPERVISOR_VERIFIED',to:'RETURNED',returnedQty:2,preReturnSnapshot:{purchaseAmount:'5.001',receivedQty:2,purchaseAmountRevision:1}});assert.equal((await preview('QA_PART_RETURN')).code,'bill_receipt_review');
 await fixture('QA_PART_ROLLBACK');p=await preview('QA_PART_ROLLBACK');c=make(p);
 await db.exec("create function qa_parts_fail() returns trigger language plpgsql as $$begin raise exception 'QA_PARTS_FAIL';end$$;create trigger qa_parts_fail after insert on zukait_bills.audit for each row execute function qa_parts_fail()");
 assert.equal((await post(c)).code,'bill_unavailable');assert.equal((await db.query('select 1 from workshop_accountant_commands where request_id=$1',[c.requestId])).rows.length,0);await db.exec('drop trigger qa_parts_fail on zukait_bills.audit');assert.equal((await post(c)).ok,true);
 await fixture('QA_PART_LIMIT');for(let i=0;i<196;i++)await event('QA_PART_LIMIT','SPARE_PART_ARRIVAL_ACCEPTED',5,{});assert.equal((await preview('QA_PART_LIMIT')).code,'bill_scope_limit');
 await db.exec('set role service_role');await assert.rejects(db.exec('update zukait_bills.control set parts_enabled=false'),/permission denied/);await db.exec('reset role');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(helper('QA_PART_A'),/permission denied/);await db.exec('reset role')}
 assert.equal((await db.query("select prosecdef from pg_proc where oid='zukait_bills.parts_receipt(text)'::regprocedure")).rows[0].prosecdef,false);
 if(native){
  await fixture('QA_PART_RACE');p=await preview('QA_PART_RACE');c=make(p);const captured=[];await billRoute({rpc:async(n,x)=>{captured.push(x);return {error:{message:'bill_disabled'}}}},actor,{action:'accountant_bill_post',command:c},{enabled:true,sessionHash:hash,secret});
  const a=new pg.Client({...config,database}),b=new pg.Client({...config,database});await a.connect();await b.connect();
  try{
   await a.query('begin');await event('QA_PART_RACE','SPARE_PART_FINAL_PRICE_RECORDED',2,{finalPrice:11},a);
   let resolved=false;const pending=b.query(query,args(captured[0])).finally(()=>resolved=true);const rejected=assert.rejects(pending,/bill_receipt_changed/);await new Promise(r=>setTimeout(r,100));assert.equal(resolved,false);await a.query('commit');await rejected;
   p=await preview('QA_PART_RACE');c=make(p);captured.length=0;await billRoute({rpc:async(n,x)=>{captured.push(x);return {error:{message:'bill_disabled'}}}},actor,{action:'accountant_bill_post',command:c},{enabled:true,sessionHash:hash,secret});
   await a.query('begin');await a.query(query,args(captured[0]));let completed=false;const retry=b.query(query,args(captured[0])).finally(()=>completed=true);await new Promise(r=>setTimeout(r,100));assert.equal(completed,false);await a.query('commit');assert.equal((await retry).rows[0].r.duplicate,true);
  }finally{await a.end();await b.end()}
 }
 assert.equal(await unchanged(),before);console.log('PASS actual Parts bill path: confirmed partial quantities, exact OMR, event-price/correction authority, stale digest, existing projection parity, unknown/unconfirmed rejection, shared retry, rollback, private invoker and no expense/cash/work mutation'+(native?'; real concurrent price writer and same-UUID retries.':'.'));
}
