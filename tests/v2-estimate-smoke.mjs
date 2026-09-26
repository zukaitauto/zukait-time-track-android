import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8');
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const cloud=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const sql=fs.readFileSync('supabase/V148_ESTIMATE_NUMBERING.sql','utf8');

assert.match(html,/v2\/features\/estimate\/main_module\.js/,'Estimate module must be loaded by the app');
assert.match(cloud,/allocateEstimateNo:v2AllocateEstimateNo/,'Cloud transport must expose estimate number allocation');
assert.match(cloud,/state\.estimates=state\.estimates\|\|\[\]/,'Estimate records must be initialized for cloud sync');
assert.match(cloud,/state\.estimateAudit=state\.estimateAudit\|\|\[\]/,'Estimate audit records must be initialized for cloud sync');

assert.match(api,/action === "v2_allocate_estimate_no"/,'Workshop API must expose estimate allocation');
assert.match(api,/\["Manager","Supervisor"\]/,'Estimate allocation must be limited to Manager and Supervisor');
assert.match(sql,/v_no:='Zi-Qt'\|\|lpad\(v_seq::text,3,'0'\)/,'Official number must use Zi-Qt001 pattern');
assert.match(sql,/client_key text not null unique/,'Number allocation must be retry-idempotent');

for(const required of [
  'Total Labour / Lumpsum',
  'LABOUR',
  'SPARE PARTS',
  'VAT 5%',
  'NO VAT',
  'Mobile Number',
  'Make & Model',
  'Registration No.',
  'VIN No.',
  'Claim No.',
  'Job Card No. (Optional)',
  'WhatsApp',
  'Print',
  'PDF',
  'Share'
]) assert.ok(ui.includes(required),'Missing Estimate requirement: '+required);

assert.match(ui,/e\.type==='PL'\?labour\+parts\+misc:ls\+spare\+misc/,'LS and PL totals must remain separate');
assert.match(ui,/e\.vatEnabled\?subtotal\*\.05:0/,'VAT must calculate at 5% only when enabled');
assert.match(ui,/if\(!navigator\.onLine\|\|!window\.zukaitCloud\?\.allocateEstimateNo\)/,'Official serial allocation must not fall back to unsafe local numbering');
assert.match(ui,/r==='Manager'\|\|r==='Supervisor'/,'Both Manager and Supervisor must use the module');
assert.match(ui,/Job Card \/ Registration not found\. You can still enter all estimate details manually\./,'Job Card must remain optional');

console.log('V2 Estimate smoke: ok');
