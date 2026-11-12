import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const html=fs.readFileSync('app/src/main/assets/accountant.html','utf8');
const css=fs.readFileSync('app/src/main/assets/accountant.css','utf8');
const js=fs.readFileSync('app/src/main/assets/accountant.js','utf8');

test('Accounts dashboard has precisely the eight approved options',()=>{
 assert.match(html,/id="navigation"/);
 assert.match(html,/8 options/);
 assert.doesNotMatch(html,/id="accounts-shortcuts"/);
 assert.match(js,/\['jobs','Job Card 360°'\]/);
 for(const part of ['Cash In','Insurance Invoiced','Leave Management','Profit / Loss','Consumables','Spare Parts','Paint'])assert.ok(js.includes(part));
 assert.match(html,/id="accounts-back"/);
 assert.match(html,/id="manager-back"/);
 assert.match(html,/id="account-name"/);
});

test('approved financial reports retain scoped filters and itemized source views',()=>{
 for(const id of ['category-filter','insurance-company','customer-filter','leave-status','employee','print','pdf','excel'])assert.ok(html.includes('id="'+id+'"'),id);
 for(const category of ['labour','paint','consumables','parts','sublet'])assert.ok(js.includes("'"+category+"'"),category);
 assert.match(js,/accounts_performance/);
 assert.match(js,/accounts_leave/);
 assert.match(js,/pending/);
});

test('responsive high contrast Financial 360 design and asset versions',()=>{
 assert.match(css,/#accounts-home #navigation \.module-card/);
 assert.match(css,/#accounts-workspace \.accounts-kpis/);
 assert.match(css,/#accounts-workspace \.finance-report/);
 assert.match(css,/@media\(max-width:550px\)/);
 assert.ok(css.includes('#accounts-home #navigation{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}'),'two columns remain on small phones');
 assert.ok(css.includes('#accounts-home #navigation .module-card:last-child{grid-column:auto'),'last card occupies equal-width column');
 assert.ok(js.includes('function jobCardResults(rows)'),'JC results use the approved card layout');
 assert.ok(css.includes('.financial-detail-dialog .detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'),'Financial 360 has two columns');
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(html,/accountant\.css\?v=\d{8}-[a-z0-9-]+/);
 assert.match(html,/accountant\.js\?v=\d{8}-[a-z0-9-]+/);
});

test('Insurance Invoiced mirrors Cash In design and fits all 14 financial columns',()=>{
 const shared='#accounts-workspace:is([data-report="cash"],[data-report="insurance_invoiced"])';
 assert.ok(css.includes(shared+' .finance-report table'), 'both reports share fit-to-page table styling');
 assert.ok(css.includes(shared+' .finance-report th'), 'both reports share readable modern header colors');
 assert.ok(css.includes(shared+' #accounts-kpis'), 'both reports share summary cards');
 assert.ok(css.includes(shared+' #cash-invoice-total'), 'both reports share total invoiced banner');
 assert.match(css,/\.finance-report table \{width:100%!important;min-width:0!important;/);
 assert.match(css,/#accounts-workspace:is\(\[data-report="cash"\],\[data-report="insurance_invoiced"\]\) \.finance-report \{overflow:visible/);
 const insuranceWidths=[...css.matchAll(/#accounts-workspace\[data-report="insurance_invoiced"\] \.finance-report th:nth-child\((\d+)\) \{width:(\d+)%\}/g)];
 assert.equal(insuranceWidths.length,14,'Insurance Invoiced shows 14 columns');
 assert.deepEqual(insuranceWidths.map(x=>Number(x[1])),Array.from({length:14},(_,i)=>i+1));
 assert.equal(insuranceWidths.reduce((sum,x)=>sum+Number(x[2]),0),100,'Insurance table spans exactly 100% available width');
 assert.match(css,/@media\(max-width:1100px\)/,'narrow displays use vertically stacked labelled records');
 assert.match(js,/columns\.insurance_invoiced=\[\.\.\.financialColumns\.slice\(0,4\),\['Insurance Company','insurance_company'\],\.\.\.financialColumns\.slice\(4\)\]/);
 assert.match(js,/openExpenseJob\(expense\.dataset\.job,expense\.dataset\.expense,expense\)/,'expense details use a focused category modal');
 assert.match(js,/expenseReports\.has\(report\)\?openExpenseJob\(j\.dataset\.job,report,j\):openJob\(j\.dataset\.job,'',j\)/,'expense JC opens focused list while financial JC opens 360');
});
