import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let harness=fs.readFileSync('tests/paint-safety.mjs','utf8').split("Object.assign(el('ppJc')")[0].replace(/^import .*;\r?\n/gm,'');
const box={fs,vm,assert,console};vm.createContext(box);vm.runInContext(harness+'\nwindow.testContext=ctx;window.testState=state;window.testElement=el;',Object.assign(box,{window:box}));
const ctx=box.testContext,state=box.testState,el=box.testElement;
const oct=Date.parse('2026-09-30T20:00:00Z'),sep=oct-1,nov=Date.parse('2026-10-31T20:00:00Z');
const line=(id,paintType,quantity,lineTotal)=>({id,paintType,quantity,lineTotal,pricePerLitre:lineTotal/quantity});
const order=(id,jc,at,lines,returns=[])=>({id,poNumber:'PO-'+id,jobCard:jc,vendor:'Vendor <test>',createdAt:sep-86400000,receivedAt:at,lines,returns});
state.paintPurchasing={orders:[
 order('base','12002',oct,[line('b','Base Coat',2.5,25)],[{id:'rb',lineId:'b',paintType:'Base Coat',quantity:.5,value:5,returnedAt:oct+86400000},{lineId:'b',quantity:.5,value:5,returnedAt:nov}]),
 order('two','12010',oct,[line('k','2K Paint',2,20)]),
 order('pearl','12003',oct,[line('p','Pearl Coat',1,10)]),
 {...order('add','12002',oct,[line('a','Base Coat',.5,5)]),orderType:'ADDITIONAL'},
 order('old','11999',sep,[line('old','2k',1,8)],[{lineId:'old',quantity:.5,value:4,returnedAt:oct},{lineId:'old',quantity:.5,value:4,returnedAt:oct,voided:true}]),
 {...order('void','VOID',oct,[line('v','Base Coat',1,100)]),voided:true},
 {...order('nil','NIL',oct,[line('n','Base Coat',1,100)]),nilPaintPurchase:true},
 {...order('pending','WAITING',null,[line('w','Base Coat',1,100)]),receivedAt:null}
],audit:[]};
const snapshot=JSON.stringify(state);
ctx.openPaintModule();assert.match(ctx.modal,/openPaintReports\(\)/);
ctx.openPaintReports();
el('paintReportMonth').value='2026-10';ctx.paintReportSetMonth();
assert.equal(el('paintReportFrom').value,'2026-10-01');assert.equal(el('paintReportTo').value,'2026-10-31');
let html=el('paintReportResult').innerHTML;
assert.equal((html.match(/<details class="paint-type-report">/g)||[]).length,3);
assert.match(html,/Net Paint Cost.*51.000/s);
assert.match(html,/Returned: 0.500 L · 5.000 OMR/);assert.match(html,/Returned: 0.500 L · 4.000 OMR/);
assert.match(html,/11999/,'Current-month return from prior-month receipt must count');
assert.match(html,/Vendor &lt;test&gt;/);
assert.doesNotMatch(html,/PO-void|PO-nil|PO-pending/);
assert.equal(JSON.stringify(state),snapshot,'Reports must not change saved paint or job cost data');
el('paintReportType').value='Base Coat';ctx.paintRunReports();html=el('paintReportResult').innerHTML;
assert.equal((html.match(/<details class="paint-type-report">/g)||[]).length,1);
assert.match(html,/Net Paint Cost.*25.000/s);assert.doesNotMatch(html,/PO-two|PO-pearl/);
el('paintReportFrom').value='2026-10-02';el('paintReportTo').value='2026-10-02';ctx.paintRunReports();
assert.match(el('paintReportResult').innerHTML,/Net Paint Cost.*-5.000/s,'Return-only period can have negative net');
el('paintReportFrom').value='2026-10-03';ctx.paintRunReports();assert.match(el('paintReportResult').innerHTML,/valid From and To/);
el('paintReportType').value='';el('paintReportMonth').value='2026-02';ctx.paintReportSetMonth();assert.equal(el('paintReportTo').value,'2026-02-28');assert.match(el('paintReportResult').innerHTML,/No received paint or returns/);
el('paintReportMonth').value='2028-02';ctx.paintReportSetMonth();assert.equal(el('paintReportTo').value,'2028-02-29');
state.paintPurchasing.orders.push(order('missing','MISSING',oct,[{id:'missing',paintType:'Pearl Coat',quantity:1,lineTotal:null,pricePerLitre:null}]));
el('paintReportMonth').value='2026-10';ctx.paintReportSetMonth();assert.match(el('paintReportResult').innerHTML,/Known Net Cost/);assert.match(el('paintReportResult').innerHTML,/1 lines have missing prices/);
state.paintPurchasing.orders.pop();
vm.runInContext("me={id:'S1',role:'Supervisor'}",ctx);ctx.openPaintReports();assert.match(ctx.modal,/Paint Reports/);
vm.runInContext("me={id:'E1',role:'Employee'}",ctx);const before=el('paintReportResult').innerHTML;ctx.paintRunReports();assert.equal(el('paintReportResult').innerHTML,before);
console.log('Paint reports: Oman receipt/return dates, month/custom range, types, net totals, pending prices, roles and immutable records passed');
