import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {financialReport} from '../supabase/functions/workshop-api/accountant/finance_rules.js';
const state={jobs:[{no:'PAINT1',vehicle:'Toyota Camry'}],paintPurchasing:{orders:[{id:'PO1',jobCard:'PAINT1',poNumber:'PO-1',vendor:'Vendor',receivedAt:Date.parse('2026-09-30T19:59:59Z'),lines:[{id:'L',quantity:2,pricePerLitre:10}],returns:[{id:'R',lineId:'L',quantity:.5,value:5,returnedAt:Date.parse('2026-09-30T20:00:00Z')},{id:'VOID',lineId:'L',quantity:.2,value:2,returnedAt:Date.parse('2026-10-01T10:00:00Z'),voided:true}]}]}};
const before=JSON.stringify(state),source=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8'),start=source.indexOf('/* V145 MANAGER WORKSHOP PERFORMANCE'),end=source.indexOf('})();',start)+5;
const ctx={state,me:{role:'Manager'},Date,console,setTimeout(){},openModal(html){ctx.modal=html},closeModal(){},document:{querySelector(){return null},createElement(){return {}},head:{appendChild(){}}}};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
for(const [month,expected] of [['2026-09',20],['2026-10',-5]]){
 ctx.v145SetExpenseMonth(month);ctx.v145SetExpenseCategory('paint');
 const total=Number(ctx.modal.match(/Paint Expense<\/span><b>OMR (-?[\d.]+)/)[1]);
 assert.equal(total,expected);
 const report=financialReport({state},{month},Date.parse('2026-11-02T08:00:00Z'));
 assert.equal(report.summary.paint.amount_omr,total,'Manager and Accountant month totals agree');
 ctx.v145OpenConsumablesJobCard('PAINT1');
 assert.match(ctx.modal,new RegExp('Total Consumables Expense <b>OMR '+expected.toFixed(3).replace('.','\\.')));
 assert.equal(report.rows.paint.reduce((n,r)=>n+r.net_cost_omr,0),total,'month rows match report total');
}
const all=financialReport({state},{},Date.parse('2026-11-02T08:00:00Z'));
assert.equal(all.rows.paint.reduce((n,r)=>n+r.net_cost_omr,0),all.details[0].paint_cost_omr,'JC360 full net reconciles');
assert.equal(all.details[0].paint_cost_omr,15);assert.equal(JSON.stringify(state),before);
console.log('Manager/Accountant paint periods: cross-month receipt/return, cancelled return, Oman boundary, drilldown totals and read-only state passed');
