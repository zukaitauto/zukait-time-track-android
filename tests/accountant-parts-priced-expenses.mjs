// In-memory read-only fixtures. No production requests or financial writes.
import assert from 'node:assert/strict';import {accountantApi} from '../supabase/functions/workshop-api/accountant/api.js';import {financialReport} from '../supabase/functions/workshop-api/accountant/finance_rules.js';
const now=Date.parse('2026-11-12T08:00Z'),source={revision:7,finance_revision:0,state:{jobs:[{no:'J1',jobType:'CASH',vehicle:'Toyota Camry',year:2020}],sessions:[],assign:[],consumables:{actuals:[]},paintPurchasing:{orders:[]}},events:[],entries:[]};let serial=0;
function part(id,name,{price,quote,qty=1,received=qty,status='RECEIVED',date='2026-10-04T08:00:00Z'}={}){
 const emit=(event_type,payload)=>source.events.push({event_id:'event-'+(++serial),entity_id:id,event_type,revision:serial,server_time:new Date(Date.parse(date)+serial*1000).toISOString(),payload:{partId:id,listNo:'PL1',jobCard:'J1',...payload}});
 emit('SPARE_PART_LISTED',{name,qty});
 if(price!==undefined||quote!==undefined)emit('SPARE_PART_COMMERCIAL_UPDATED',{...(price!==undefined?{purchaseAmount:price}:{}),...(quote!==undefined?{quoteAmount:quote}:{}),supplier:'QA Supplier'});
 emit('SPARE_PART_STATUS_CHANGED',{to:status==='ORDERED'?'ORDERED':'RECEIVED',receivedQty:received});
 if(status==='RETURNED')emit('SPARE_PART_STATUS_CHANGED',{from:'RECEIVED',to:'RETURNED',returnedQty:received,preReturnSnapshot:{purchaseAmount:price,qty,status:'RECEIVED',supplier:'QA Supplier'}});
}
part('priced','Priced lamp',{price:3.125,qty:2});part('unpriced','Unpriced door');part('quote','Quote only',{quote:99});part('zero','Explicit zero',{price:0});part('empty','Blank price',{price:''});part('invalid','Invalid price',{price:'invalid'});part('partial','Partial receipt',{price:2.5,qty:4,received:1});part('ordered','Not received',{price:10,status:'ORDERED'});part('returned','Returned',{price:9,status:'RETURNED'});part('november','Other month',{price:4,date:'2026-11-04T08:00:00Z'});
const original=JSON.stringify(source),admin={rpc:async name=>{assert.equal(name,'zukait_accountant_context');return {data:source,error:null}}};
const fullBefore=financialReport(source,{},now);
assert.ok(fullBefore.rows.parts.some(r=>r.part==='Unpriced door'&&r.net_cost_omr===null),'fixture must contain the reported bug');
for(const role of ['Manager','Accountant']){
 const user={id:'QA-'+role,role},read=(filters={},offset=0,limit=500)=>accountantApi(admin,user,{action:'accountant_report',report:'parts',filters,offset,limit},'QA-ONLY',now);
 const response=await read({month:'2026-10'});assert.equal(response.status,200);const r=response.body;
 assert.deepEqual(r.rows.map(x=>x.part).sort(),['Explicit zero','Partial receipt','Priced lamp']);
 assert.equal(r.total_count,3);assert.equal(r.summary.parts.records,3);assert.equal(r.summary.parts.pending_records,0);assert.equal(r.summary.parts.amount_omr,8.750);
 assert.equal(r.rows.find(x=>x.part==='Explicit zero').net_cost_omr,0,'entered zero is distinct from missing');assert.equal(r.rows.find(x=>x.part==='Partial receipt').net_cost_omr,2.5,'only received quantity is expensed');
 const first=(await read({month:'2026-10'},0,1)).body;assert.equal(first.rows.length,1);assert.equal(first.total_count,3);assert.equal(first.next_offset,1);assert.equal(first.summary.parts.amount_omr,8.750,'total is not the current page');
 const all=[];let offset=0;do{const page=(await read({month:'2026-10'},offset,1)).body;all.push(...page.rows);offset=page.next_offset}while(offset!==null);assert.equal(all.length,3);assert.equal(new Set(all.map(x=>x.id)).size,3,'grouped/export pagination has no duplicates');
 assert.equal((await read({month:'2026-11'})).body.rows.length,1,'period filters preserved');
 const focused=(await read({job_card:'J1'})).body;assert.equal(focused.rows.length,4);assert.ok(focused.rows.every(row=>row.net_cost_omr!==null),'expense popup receives only priced rows');
 const details=await accountantApi(admin,user,{action:'accountant_jc_detail',job_card:'J1'},'QA-ONLY',now);assert.equal(details.status,200);assert.ok(details.body.breakdown.parts.some(x=>x.part==='Unpriced door'&&x.net_cost_omr===null),'JC360 retains pending-price source information');
}
// Once a real purchase price is recorded, the received part appears automatically.
const corrected=structuredClone(source);corrected.revision++;
corrected.events.push({event_id:'price-corrected',entity_id:'unpriced',event_type:'SPARE_PART_FINAL_PRICE_RECORDED',revision:999,server_time:'2026-10-09T08:00:00Z',payload:{listNo:'PL1',partId:'unpriced',jobCard:'J1',finalPrice:7.25}});
const updated=await accountantApi({rpc:async()=>({data:corrected,error:null})},{id:'QA-Manager',role:'Manager'},{action:'accountant_report',report:'parts',filters:{month:'2026-10'}},'QA-ONLY',now);
assert.equal(updated.status,200);assert.equal(updated.body.rows.find(r=>r.part==='Unpriced door').net_cost_omr,7.25);assert.equal(updated.body.summary.parts.amount_omr,16);assert.equal(updated.body.total_count,4);
assert.deepEqual(financialReport(source,{},now),fullBefore,'authoritative cost projection unchanged');assert.equal(JSON.stringify(source),original,'no source mutations');
console.log('PASS both-role Parts Expenses: hide unpriced/blank/quote-only, retain entered zero and partial receipt, preserve receipt/return/date rules, totals/pagination/export inputs and pending JC360 sources.');
