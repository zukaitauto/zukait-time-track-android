import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const html=fs.readFileSync('app/src/main/assets/accountant.html','utf8');
const css=fs.readFileSync('app/src/main/assets/accountant.css','utf8');
const js=fs.readFileSync('app/src/main/assets/accountant.js','utf8');

test('accounts overview keeps the financial and module contracts intact',()=>{
 assert.match(html,/id="summary"/);
 assert.match(html,/id="navigation"/);
 assert.match(html,/id="accounts-workspace"/);
 assert.match(html,/id="accounts-back"/);
 assert.match(html,/id="manager-back"/);
 assert.match(html,/id="accountant?/i);
 assert.match(js,/function renderSummary\(summary\)/);
 assert.match(js,/Estimated Gross Profit/);
 assert.match(js,/moduleDesign/);
 assert.match(js,/modules\.map\(\(\[name,title\]\)/);
 assert.match(js,/data-report/);
});

test('read status is honest about pending and missing financial data',()=>{
 assert.match(js,/Number\(s\?\.pending_records\|\|0\)/);
 assert.match(js,/source record/);
 assert.match(js,/Amount not yet verified/);
 assert.match(html,/Estimated gross profit excludes overheads/);
 assert.match(js,/account-kpi-pending/);
});

test('dense accessible responsive layout is scoped to Accounts home only',()=>{
 assert.match(css,/#accounts-home \.summary button\.account-kpi/);
 assert.match(css,/#accounts-home #navigation \.module-card/);
 assert.match(css,/min-height:99px/);
 assert.match(css,/@media\(max-width:550px\)/);
 assert.match(css,/#accounts-home #navigation\{grid-template-columns:1fr/);
 assert.match(css,/:focus-visible/);
 assert.match(css, /prefers-reduced-motion:reduce/);
 assert.match(html,/accountant\.css\?v=20261110-compact-accounts/);
 assert.match(html,/accountant\.js\?v=20261110-accounts-kpis/);
});
