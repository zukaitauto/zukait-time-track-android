import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const state={jobs:[
 {no:'NEW',vehicle:'Toyota Camry',year:2014,jobType:'CASH',createdAt:Date.parse('2026-10-12T08:00:00Z'),promiseDate:'2026-10-20',mobile:'92403420'},
 {no:'OLD',vehicle:'Nissan Altima',year:2018,jobType:'INSURANCE',insuranceCompany:'Liva Insurance',createdAt:Date.parse('2026-10-10T08:00:00Z'),receptionNo:'RC1'},
 {no:'UNASSIGNED',status:'Open',createdAt:Date.parse('2026-10-13T08:00:00Z'),receptionLocation:'VWC'},{no:'DELIVERED',delivered:true},{no:'ID001'},{no:'DONE'},{no:'CANCELLED',cancelled:true}],
 assign:[{job:'NEW',emp:'E1'},{job:'OLD',emp:'E2'},{job:'NEW',emp:'E3',completed:true},{job:'DELIVERED'},{job:'ID001'},{job:'DONE',completed:true},{job:'CANCELLED'}],sessions:[{job:'NEW',emp:'E1',start:10}],
 paintPurchasing:{orders:[{jobCard:'NEW',poNumber:'PO1',receivedAt:1,lines:[{paintType:'Base Coat',quantity:1}]}]},
 consumables:{materials:[{id:'M',name:'Masking Tape',unit:'Piece'}],actuals:[{jobCard:'NEW',locked:true,lines:[{materialId:'M',actualQuantity:2,lineCost:3}]}]}};
const before=JSON.stringify(state);let html='';const ctx={state,me:{role:'Manager'},users:[{id:'E1',name:'Afsal',department:'Denter'},{id:'E2',name:'Painter'}],Date,console,openModal:x=>html=x,document:{getElementById:()=>false,createElement:()=>({}),head:{appendChild(){}},querySelector:()=>true}};
ctx.window=ctx;ctx.zukaitJobCardMaster={costs:()=>({paint:15,materials:3})};ctx.zukaitReception={call:async()=>({record:{details:{customer:'Customer Name',contact:'72440918'}}})};ctx.zukaitV2={sparePartsMain:{reportRows:()=>[{jobCard:'NEW',name:'Bumper',qty:1,status:'ORDERED'},{jobCard:'NEW',name:'Fitted Part',qty:1,status:'FITTED'}]}};
vm.runInNewContext(fs.readFileSync('app/src/main/assets/manager_work_in_progress.js','utf8'),ctx);
assert.equal(ctx.zukaitManagerWip.count(),4);assert.deepEqual(Array.from(ctx.zukaitManagerWip.rows(),j=>j.no),['OLD','NEW','UNASSIGNED','DONE']);
await ctx.zukaitManagerWip.open();assert.ok(html.indexOf('data-jc="OLD"')<html.indexOf('data-jc="NEW"'));
assert.match(html,/<span>No\.<\/span><span>Opened<\/span>/,'The serial-number heading must precede Opened');
assert.match(html,/data-jc="OLD"[^>]*><span class="mwip-serial">1<\/span>/,'Oldest Job Card receives serial 1');
assert.match(html,/data-jc="NEW"[^>]*><span class="mwip-serial">2<\/span>/,'Next Job Card receives serial 2');assert.match(html,/Liva Insurance/);assert.match(html,/Toyota Camry 2014/);assert.match(html,/12-10-2026/);
assert.match(html,/data-jc="UNASSIGNED"/);assert.match(html,/class="mwip-vwc"[^>]*>VWC/);
await ctx.zukaitManagerWip.detail('UNASSIGNED');assert.match(html,/Awaiting Allocation/);assert.match(html,/Vehicle With Customer/);
await ctx.zukaitManagerWip.detail('NEW');
for(const text of ['Afsal','● Working','Bumper','Pending Parts · 1','Paint Details','PO1','Base Coat','OMR 15.000','Masking Tape','OMR 3.000','92403420','20-10-2026'])assert.ok(html.includes(text),text);
assert.ok(!html.includes('Fitted Part'));await ctx.zukaitManagerWip.detail('OLD');assert.match(html,/72440918/);assert.match(html,/Customer Name/);assert.match(html,/Liva Insurance/);assert.match(html,/Not set/);
assert.equal(JSON.stringify(state),before,'Dashboard must remain read-only');ctx.me.role='Supervisor';html='';await ctx.zukaitManagerWip.open();assert.match(html,/WORKSHOP · SUPERVISOR/,'Supervisor may open the same read-only WIP view');assert.equal(ctx.zukaitManagerWip.count(),4);assert.equal(JSON.stringify(state),before,'Supervisor WIP must remain read-only');ctx.me.role='Employee';html='unchanged';await ctx.zukaitManagerWip.open();assert.equal(html,'unchanged');
console.log('Manager WIP: date sorting, matching counts, scoped detail data, reception contact, role checks and read-only state passed');
