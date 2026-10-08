
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const begin=source.indexOf('V123 MANAGER WORKSHOP PERFORMANCE'),end=source.indexOf('V106 ID001 FINAL AUTHORITY',begin);
const block=source.slice(source.indexOf('(function()',begin),source.lastIndexOf('/*',end));
const fields=new Map();
for(const id of ['Period','Month','Date','To','JC','Body','MonthLabel','DateLabel','ToLabel'])fields.set('v123Purchase'+id,{value:'',innerHTML:'',hidden:false});
fields.get('v123PurchasePeriod').value='month';fields.get('v123PurchaseMonth').value='2026-10';fields.get('v123PurchaseDate').value='2026-10-01';fields.get('v123PurchaseTo').value='2026-10-01';
const lists=[{listNo:'PL1',jobCard:'11975',vehicle:'MG 5',createdAt:'2026-09-01',items:[
 {purchaseAmount:10,qty:2,purchaseRecordedAt:'2026-09-30T20:00:00Z',updatedAt:'2026-11-01'},
 {purchaseAmount:5,qty:1,purchaseRecordedAt:'2026-09-30T19:59:59Z'},
 {quoteAmount:999,qty:1,createdAt:'2026-10-01'}]},
 {listNo:'PL2',jobCard:'11975',items:[{purchaseAmount:3,qty:1,purchaseRecordedAt:'2026-10-03T00:00:00Z'}]},
 {listNo:'PL3',jobCard:'119750',items:[{purchaseAmount:7,qty:1,purchaseRecordedAt:'2026-10-01T00:00:00Z'}]},
 {listNo:'PL4',jobCard:'OLD',items:[{purchaseAmount:8,qty:1,createdAt:'2026-09-05T00:00:00Z',updatedAt:'2026-10-01'}]},
 {listNo:'PL5',jobCard:'UNDATED',items:[{purchaseAmount:2,qty:1}]}];
let writes=0;
const context={me:{role:'Manager'},state:{assign:[]},users:[],Intl,Date,
 localStorage:{getItem:()=>JSON.stringify(lists),setItem(){writes++}},
 document:{getElementById:id=>fields.get(id),head:{appendChild(){}},createElement:()=>({})},
 setTimeout(){},openModal(){},fmt:String};
context.window=context;vm.createContext(context);vm.runInContext(block,context);
const body=()=>fields.get('v123PurchaseBody').innerHTML;
const select=(mode,date='2026-10-01',to=date)=>{fields.get('v123PurchasePeriod').value=mode;fields.get('v123PurchaseDate').value=date;fields.get('v123PurchaseTo').value=to;context.v123PurchaseExpensePreset();};
select('month');assert.match(body(),/30\.000 OMR/);assert.doesNotMatch(body(),/OLD|UNDATED/);
select('date');assert.match(body(),/27\.000 OMR/,'Oman midnight must include the UTC previous-day purchase');
select('week');assert.match(body(),/32\.000 OMR/);assert.match(body(),/2026-09-26 to 2026-10-02/);
select('custom','2026-10-01','2026-10-03');assert.match(body(),/30\.000 OMR/);
fields.get('v123PurchaseJC').value='11975';context.v123ApplyPurchaseExpenseFilters();assert.match(body(),/23\.000 OMR/);assert.doesNotMatch(body(),/>119750</);
select('all');assert.match(body(),/28\.000 OMR/);assert.match(body(),/openList/);
fields.get('v123PurchaseJC').value='';select('all');assert.match(body(),/45\.000 OMR/,'all dates must retain older and undated costs');
select('custom','2026-10-03','2026-10-01');assert.match(body(),/Choose valid dates/);
assert.equal(writes,0,'filtering must not write parts records');
context.Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-05T08:00:00Z']))}static now(){return Date.parse('2026-10-05T08:00:00Z')}};
context.v123ManagerPerformanceRange('today');
assert.equal(context.v284MonthlyPurchaseTotal(),30,'monthly purchase card must remain monthly under Today');
let monthlyModal='';context.openModal=html=>monthlyModal=html;
await context.v284OpenMonthlyPurchases();
assert.match(monthlyModal,/<option value="month" selected>/,'monthly card opens matching monthly report');
context.me.role='Employee';const before=body();select('month');assert.equal(body(),before,'expense view is manager-only');
const main=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const cache=new Map(),app={zukaitV2:{}};
const parts={window:app,me:{role:'Manager'},navigator:{onLine:false},localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)},document:{},console};
vm.createContext(parts);vm.runInContext(main,parts);
const event=(type,time,payload,rev=1)=>({event_type:type,sort_time:time,server_time:time,entity_id:'P1',revision:rev,payload:{listNo:'PL1',jobCard:'JC1',partId:'P1',...payload}});
const events=[
 event('SPARE_PART_LISTED','2026-09-01T00:00:00Z',{name:'Bumper',qty:2}),
 event('SPARE_PART_FINAL_PRICE_RECORDED','2026-09-30T20:00:00Z',{finalPrice:10}),
 event('SPARE_PART_STATUS_CHANGED','2026-10-05T00:00:00Z',{to:'FITTED'}),
 event('SPARE_PART_FINAL_PRICE_RECORDED','2026-10-06T00:00:00Z',{finalPrice:12},2)];
const rows=app.zukaitV2.sparePartsMain.hydrateFromServerRows(events);
assert.equal(rows[0].items[0].purchaseRecordedAt,'2026-09-30T20:00:00.000Z');
assert.equal(rows[0].items[0].purchaseAmount,12);
assert.equal(rows[0].items[0].purchaseRecordedAt,'2026-09-30T20:00:00.000Z','Later final-price/status activity must not shift the original purchase transaction date');
const normalizedLater=app.zukaitV2.sparePartsMain.normalizeReportRow(event('SPARE_PART_STATUS_CHANGED','2026-11-01T00:00:00Z',{to:'FITTED',purchaseAmount:12},3));
assert.equal(normalizedLater.purchaseRecordedAt,'','A later status event carrying an amount must not invent a new purchase date');
assert.equal(app.zukaitSparePartsOmanDateKey('2026-09-30T19:59:59Z'),'2026-09-30');
assert.equal(app.zukaitSparePartsOmanDateKey('2026-09-30T20:00:00Z'),'2026-10-01','V2 expense filters must use Oman business date at UTC+4 midnight');
const correctedEvents=[
 event('SPARE_PART_LISTED','2026-09-01T00:00:00Z',{name:'Bumper',qty:1}),
 event('SPARE_PART_FINAL_PRICE_RECORDED','2026-10-01T08:00:00Z',{finalPrice:20},1),
 event('SPARE_PART_MANAGER_CORRECTED','2026-11-05T08:00:00Z',{reason:'Invoice correction',after:{name:'Bumper',qty:1,status:'RECEIVED',purchaseAmount:22,purchaseRecordedAt:'2026-10-01T08:00:00.000Z'}},2)
];
const correctedRows=app.zukaitV2.sparePartsMain.hydrateFromServerRows(correctedEvents);
assert.equal(correctedRows[0].items[0].purchaseAmount,22);
assert.equal(correctedRows[0].items[0].purchaseRecordedAt,'2026-10-01T08:00:00.000Z','Amount correction must preserve original purchase transaction date after fresh login');
assert.match(main,/purchaseRecordedAt:amount==null\?null:/,'Correction event must persist the original purchase transaction date');
console.log('Spare Parts Expense: Oman periods, exact JC, quantities, older/undated costs, permissions, read-only filters and stable server purchase date passed');
