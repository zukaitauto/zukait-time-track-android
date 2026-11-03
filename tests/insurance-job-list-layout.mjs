import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('app/src/main/assets/insurance_management.js','utf8');
new vm.Script(source,{filename:'insurance_management.js'});
for(const field of ['Date','JC Number','Make / Model / Year','Claim Number','Insurance Company','Delivery Date','LPO Amount (OMR)'])assert.ok(source.includes("'"+field+"'"),'Missing list column: '+field);
assert.ok(source.includes('ins-jobs-table')&&source.includes('ins-job-line'),'One-row table and clickable rows required');
assert.ok(source.includes("if(action==='job')return jobDetails(button.dataset.job)"),'Row must open dedicated insurance details');
assert.ok(!source.includes('360°'),'Insurance job list must not use 360° view');
assert.ok(source.includes("if(action==='detail-print')"),'Dedicated details must support print');

// Approved modern Insurance Management design is presentation-only.
// Keep four distinct KPI accents, selected navigation, accessible focus,
// responsive table scroll, and the existing print/filter actions.
for(const selector of ['.ins-summary button:nth-child(1)','button:nth-child(2)','button:nth-child(3)','button:nth-child(4)','[aria-pressed="true"]','.ins-list-scroll','.ins-jobs-table','.ins-jc-number','@media(max-width:600px)','prefers-reduced-motion']){
 assert.ok(source.includes(selector),'Modern design regression: '+selector);
}
for(const color of ['#008a80','#1660ed','#ef780b','#9339e9']){
 assert.ok(source.includes(color),'Missing approved KPI color '+color);
}
for(const action of ["if(action==='refresh'||action==='back')","if(action==='print')return print()","data-ins-filter=\"company\"","data-ins-filter=\"month\"","data-ins-filter=\"search\""]){
 assert.ok(source.includes(action),'Keep existing dashboard behavior '+action);
}

console.log('Insurance Job list and dedicated detail syntax/contract: PASS');
