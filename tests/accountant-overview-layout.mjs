import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const html=fs.readFileSync('app/src/main/assets/accountant.html','utf8');
const css=fs.readFileSync('app/src/main/assets/accountant.css','utf8');
const js=fs.readFileSync('app/src/main/assets/accountant.js','utf8');

test('Accounts dashboard has precisely the five approved options',()=>{
 assert.match(html,/id="navigation"/);
 assert.match(html,/5 options/);
 assert.doesNotMatch(html,/id="accounts-shortcuts"/);
 assert.match(js,/\['jobs','Job Card 360°'\]/);
 for(const part of ['Cash In','Insurance Invoiced','Leave Management','Profit \/ Loss'])assert.ok(js.includes(part));
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
 assert.match(css,/#accounts-home #navigation\{grid-template-columns:1fr/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(html,/accountant\.css\?v=20261111-[a-z0-9-]+/);
 assert.match(html,/accountant\.js\?v=20261111-[a-z0-9-]+/);
});
