import assert from 'node:assert/strict';
import {availablePartsListCost} from '../supabase/functions/workshop-api/accountant/accounts_parts_cost.js';
import {financialReport} from '../supabase/functions/workshop-api/accountant/finance_rules.js';
import {managerProfitReport} from '../supabase/functions/workshop-api/accountant/profit_performance.js';
import {accountsPerformanceReport} from '../supabase/functions/workshop-api/accountant/accounts_reports.js';
import {accountantApi} from '../supabase/functions/workshop-api/accountant/api.js';
import {fixture} from './accountant-finance.mjs';

const purchased=[
 {id:'P1',list_no:'PL1',status:'RECEIVED',purchase_amount_omr:30,net_cost_omr:10,pending_quantity:2,pending_purchase_omr:20},
 {id:'P2',list_no:'PL1',status:'FITTED',purchase_amount_omr:12,net_cost_omr:12,pending_quantity:0,pending_purchase_omr:0},
 {id:'P3',list_no:'PL1',status:'RETURNED',purchase_amount_omr:100,net_cost_omr:0,pending_quantity:0}
];
const available=availablePartsListCost(purchased);
assert.equal(available.cost_omr,42,'use quantity-times-recorded Parts List purchase price');
assert.equal(available.provisional,true,'partial receipt is an estimated remaining purchase cost');
assert.equal(available.pending,false);
assert.equal(available.priced_items,2,'returned item must not be treated as retained expense');
assert.equal(availablePartsListCost([...purchased,purchased[0]]).cost_omr,42,'same list item cannot be counted twice');
const adjusted=availablePartsListCost(purchased,null,[{kind:'COST_ADJUSTMENT',category:'parts',old_value:12,new_value:14}]);
assert.equal(adjusted.cost_omr,44,'manual authorized parts adjustments are included once');
assert.equal(availablePartsListCost([],0).cost_omr,0,'absent Parts List retains verified zero');
assert.equal(availablePartsListCost([...purchased,{id:'P4',list_no:'PL1',status:'ORDERED',pending_quantity:1,purchase_amount_omr:null,net_cost_omr:null}]).cost_omr,null,'unpriced part is Pending, not assumed zero');
assert.equal(availablePartsListCost([{id:'P',list_no:'PL1',status:'QUOTED',quote_amount_omr:23,pending_quantity:1}]).cost_omr,null,'supplier quotation alone is not a recorded purchase cost');

const c=fixture();
c.events.push(
 {event_id:'pl2-list',entity_id:'EXTRA',event_type:'SPARE_PART_LISTED',revision:1,server_time:'2026-10-01T05:03:00Z',payload:{listNo:'PL2',partId:'EXTRA',jobCard:'J1',name:'Additional lamp',qty:3}},
 {event_id:'pl2-price',entity_id:'EXTRA',event_type:'SPARE_PART_COMMERCIAL_UPDATED',revision:2,server_time:'2026-10-01T05:04:00Z',payload:{listNo:'PL2',partId:'EXTRA',jobCard:'J1',purchaseAmount:4,supplier:'Sample Supplier'}},
 {event_id:'pl2-order',entity_id:'EXTRA',event_type:'SPARE_PART_STATUS_CHANGED',revision:3,server_time:'2026-10-01T05:05:00Z',payload:{listNo:'PL2',partId:'EXTRA',jobCard:'J1',from:'ENQUIRY',to:'ORDERED'}}
);
const before=JSON.stringify(c),now=Date.parse('2026-11-11T08:00:00Z');
let financial=financialReport(c,{},now),manager=managerProfitReport(c,financial,{month:'2026-10'},now);
assert.equal(manager.rows.find(r=>r.job_card==='J1').total_cost_omr,null,'Manager verified actuals remain pending for unreceived purchase');
let accounts=accountsPerformanceReport(c,financial,{month:'2026-10',kind:'CASH'},now);
let j=accounts.rows.find(r=>r.job_card==='J1');
assert.equal(j.parts_cost_omr,22,'existing received 10 + additional unreceived 3 x 4');
assert.equal(j.parts_cost_estimated,true);
assert.equal(j.total_job_cost_omr,49.5,'labour 2.5 + paint 15 + consumables 10 + Parts List 22');
assert.equal(j.net_profit_omr,100.5,'Cash invoice 150 minus all available job costs');
assert.equal(j.percentage,67);
assert.equal(accounts.summary.estimated_parts_jobs,1);
assert.equal(accounts.summary.pending_cost_records,0,'fully priced list may calculate provisional P/L');
assert.equal(accountsPerformanceReport(c,financial,{month:'2026-10',kind:'CASH',labour_mode:'without'},now).rows[0].net_profit_omr,103,'Without Labour uses same available parts amount');
const unrelated=accountsPerformanceReport(c,financial,{month:'2026-10',kind:'INSURANCE'},now);
assert.ok(unrelated.rows.every(r=>r.job_card!=='J1'),'do not allocate Parts List costs to unrelated vehicles');

const fakeAdmin={rpc:async()=>({data:c,error:null})},actor={id:'A',role:'Accountant'};
const list=await accountantApi(fakeAdmin,actor,{action:'accountant_report',report:'accounts_performance',filters:{month:'2026-10',kind:'CASH'}},'qa',now);
assert.equal(list.status,200);
assert.equal(list.body.rows[0].parts_cost_omr,22);
const detail=await accountantApi(fakeAdmin,actor,{action:'accountant_jc_detail',job_card:'J1'},'qa',now);
assert.equal(detail.status,200);
assert.equal(detail.body.detail.parts_cost_omr,22);
assert.equal(detail.body.detail.job_total_cost_omr,49.5);
assert.equal(detail.body.detail.parts_cost_estimated,true);
assert.equal(detail.body.breakdown.parts.length,2,'JC360 includes existing and additional Parts List source lines');
assert.equal(JSON.stringify(c),before,'projection cannot edit original purchase events, Job Cards or ledger');

c.events.push({event_id:'pl3-list',entity_id:'UNPRICED',event_type:'SPARE_PART_LISTED',revision:1,server_time:'2026-10-01T05:06:00Z',payload:{listNo:'PL3',partId:'UNPRICED',jobCard:'J1',name:'Unpriced washer',qty:1}});
financial=financialReport(c,{},now);
accounts=accountsPerformanceReport(c,financial,{month:'2026-10',kind:'CASH'},now);
j=accounts.rows.find(r=>r.job_card==='J1');
assert.equal(j.parts_cost_omr,null);
assert.equal(j.net_profit_omr,null,'an unpriced Parts List item must not produce false profit');
assert.equal(j.parts_price_pending,true);
assert.equal(accounts.summary.pending_cost_records,1);
console.log('Accounts Parts List P/L: recorded prices, full/partial receipt estimates, returns, source drilldown, manual adjustments, without labour, unknown-price Pending, isolation and no mutation PASS');
