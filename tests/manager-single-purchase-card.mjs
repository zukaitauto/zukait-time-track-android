import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const suite=fs.readFileSync('tests/spare-parts-expense-filters.mjs','utf8');
const prefix=suite.slice(0,suite.indexOf('const body='));
const {context,fields}=await import('data:text/javascript;base64,'+Buffer.from(prefix+'\nexport {context,fields};').toString('base64'));
const source=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
context.Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-05T08:00:00Z']))}static now(){return Date.parse('2026-10-05T08:00:00Z')}};
context.state.sublets=[{id:'s1',jobCard:'11975',date:'2026-10-05',amountMills:5000},{id:'s2',jobCard:'11975',date:'2026-10-01',amountMills:2000}];
const panel={innerHTML:''},root={querySelector:()=>panel};
context.document.getElementById=id=>id==='managerView'?root:fields.get(id);
let removed=0;
context.document.querySelectorAll=selector=>selector.includes('.v134-capacity')&&removed===0?[{remove(){removed++}}]:[];
const begin=source.indexOf('/* V134 MANAGER AVAILABLE CAPACITY TODAY'),end=source.indexOf('window.v134ManagerCapacity=true;',begin)+'window.v134ManagerCapacity=true;'.length;
vm.runInContext(source.slice(source.indexOf('(function()',begin),source.indexOf('})();',end)+5),context);
context.v134ApplyManagerCapacity();context.v134ApplyManagerCapacity();assert.equal(removed,1,'legacy duplicate is removed safely on repeated refreshes');
const snapshot=JSON.stringify(context.state);
for(const [range,amount,subtitle] of [['month','37.000','This Month'],['today','5.000','Today'],['month','37.000','This Month']]){
 context.v123ManagerPerformanceRange(range);
 assert.equal((panel.innerHTML.match(/<span>Purchase Expenses<\/span>/g)||[]).length,1,'one purchase card per render');
 assert.doesNotMatch(panel.innerHTML,/Total Purchase Amount/);
 assert.match(panel.innerHTML,new RegExp(amount.replace('.','\\.')+' OMR'));
 assert.ok(panel.innerHTML.includes(subtitle+' · Parts + Sublet'));
 let modal='';context.openModal=html=>modal=html;
 await context.v123ManagerPerformanceOpen('purchase');
 assert.ok(modal.includes('<option value="'+range+'" selected>'),'detail period matches selected dashboard period');
}
assert.equal(JSON.stringify(context.state),snapshot,'presentation changes preserve all purchase records');
// Feed the dashboard actual reportRows output: amount is already unit price × qty.
const cache=new Map(),parts={window:{zukaitV2:{}},me:{role:'Manager'},navigator:{onLine:false},localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)},document:{},console};
vm.createContext(parts);vm.runInContext(fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8'),parts);
const event=(type,time,payload,revision=1)=>({event_type:type,sort_time:time,server_time:time,entity_id:'P1',revision,payload:{listNo:'PL1',jobCard:'11975',partId:'P1',...payload}});
context.zukaitV2=parts.window.zukaitV2;
let recalculations=0;
parts.window.v123ApplyManagerPerformance=()=>{recalculations++;context.v123ApplyManagerPerformance()};
parts.window.zukaitV2.sparePartsMain.hydrateFromServerRows([
 event('SPARE_PART_LISTED','2026-09-01T00:00:00Z',{name:'Bumper',qty:3}),
 event('SPARE_PART_FINAL_PRICE_RECORDED','2026-09-30T20:00:00Z',{finalPrice:10}),
 event('SPARE_PART_STATUS_CHANGED','2026-11-01T08:00:00Z',{to:'FITTED'},2)
]);
context.zukaitV2=parts.window.zukaitV2;
assert.equal(recalculations,1,'authoritative parts hydration refreshes the already-rendered Manager card without another network request');
assert.ok(panel.innerHTML.includes('37.000 OMR'),'loaded parts replace the initial sublet-only amount automatically');
assert.equal(context.zukaitV2.sparePartsMain.reportRows()[0].amount,30);
context.state.sublets.push({id:'sublet-only',jobCard:'999',date:'2026-10-05',amountMills:1005});
const combinedSnapshot=JSON.stringify(context.state),partsSnapshot=JSON.stringify([...cache]);
for(const [range,total,sublet] of [['month','38.005','8.005'],['today','6.005','6.005']]){
 context.v123ManagerPerformanceRange(range);
 assert.ok(panel.innerHTML.includes(total+' OMR'),'card adds each parts line once plus sublet, using the purchase date');
 fields.get('v123PurchasePeriod').value=range;fields.get('v123PurchaseMonth').value='2026-10';fields.get('v123PurchaseDate').value='2026-10-05';
 context.v123ApplyPurchaseExpenseFilters();
 assert.ok(fields.get('v123PurchaseBody').innerHTML.includes(total+' OMR'),'detail equals dashboard total');
 assert.ok(fields.get('v123PurchaseBody').innerHTML.includes(sublet+' OMR'),'sublet-only jobs are included');
 const detail=fields.get('v123PurchaseBody').innerHTML;
 assert.ok(detail.includes('<span>Total Parts</span>'),'parts footer is displayed separately');
 assert.ok(detail.includes('<span>Total Sublet</span>'),'sublet footer remains');
 assert.ok(detail.includes('<span>Total Purchase Expense · Parts + Sublet</span>'),'combined footer clearly identifies its components');
 assert.ok(detail.indexOf('<span>Total Parts</span>')<detail.indexOf('<span>Total Sublet</span>')&&detail.indexOf('<span>Total Sublet</span>')<detail.indexOf('<span>Total Purchase Expense · Parts + Sublet</span>'));
 assert.ok(detail.includes((Number(total)-Number(sublet)).toFixed(3)+' OMR'),'parts equals combined purchase minus sublet');
}
assert.equal(JSON.stringify(context.state),combinedSnapshot);assert.equal(JSON.stringify([...cache]),partsSnapshot,'report does not change parts or sublet records');
console.log('Single Manager purchase card: duplicate cleanup, Today/Month parts + sublet amounts, matching detail period and read-only behavior passed.');
