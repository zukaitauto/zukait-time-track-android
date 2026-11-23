import assert from 'node:assert/strict';
import fs from 'node:fs';

const ready=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const cons=fs.readFileSync('app/src/main/assets/consumables_ui.js','utf8');
const spare=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');

assert.match(ready,/V213 READY FOR DELIVERY/);
assert.match(ready,/typeof window\.v120ReadyJobs==='function'\?window\.v120ReadyJobs\(\):\[\]/,'V120 remains Ready lifecycle authority');
assert.match(ready,/QC Pending/);
assert.match(ready,/Paint Final Pending/);
assert.match(ready,/Parts Pending/);
assert.match(ready,/Costing Pending/);
assert.match(ready,/Pending paint costing or spare parts do not block delivery/);
assert.match(ready,/j\.delivered=true;j\.deliveredAt=Date\.now\(\);j\.status='Delivered'/);
assert.match(ready,/const current=ready\(\)\.some/,'Delivery must re-check Ready state before mutation');
assert.match(cons,/Final Material Pending/);
assert.match(cons,/c\.actuals\.filter\(x=>x&&!x\.voided&&x\.locked\)/,'Only finalized locked actuals clear paint pending');
assert.match(spare,/const delivered=job\(r\.jobCard\)\?\.delivered===true/,'Delivered pending parts derives from authoritative JC delivery state');
assert.match(spare,/&&items\.some\(isPartPending\)/,'Only outstanding parts appear in Delivered Pending Parts');
assert.doesNotMatch(ready,/state\.assign\.push|state\.sessions\.push/,'Ready layer must not create assignments or sessions');

console.log('V213 Ready for Delivery regression passed');
