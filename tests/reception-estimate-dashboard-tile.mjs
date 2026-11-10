import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const dashboard=fs.readFileSync('app/src/main/assets/reception_dashboard.js','utf8');
const estimate=fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8');
const workshop=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const receptionist=fs.readFileSync('app/src/main/assets/receptionist.html','utf8');

test('Estimate is a shared Reception tile and opens the existing Estimate window',()=>{
 assert.match(dashboard,/\["estimate","Estimate","New · Find · Saved · Print \/ PDF","🧾"\]/);
 assert.match(dashboard,/if\(next==='estimate'\)[\s\S]*?return window\.zukaitEstimate\.openHome\(\)/);
 assert.match(dashboard,/\["new","create-job","estimate"\]\.includes\(key\)/);
 assert.match(dashboard,/\['new','checklists','estimate'\]\.includes\(key\)/);
 assert.match(estimate,/function canUse\(\)[\s\S]*?Receptionist/);
 assert.match(estimate,/window\.zukaitEstimate=\{openHome/);
});
test('Manager and Supervisor retain their existing Estimate dashboard cards',()=>{
 assert.match(estimate,/if\(r==='Supervisor'\)/);
 assert.match(estimate,/if\(r==='Manager'\)/);
 assert.match(estimate,/data-estimate-card/);
});
test('Both workshop and Receptionist entry points request refreshed dashboard asset',()=>{
 for(const html of [workshop,receptionist]){
  assert.match(html,/reception_dashboard\.js\?v=20261110-estimate-tile/);
  assert.match(html,/v2\/features\/estimate\/main_module\.js/);
 }
});
