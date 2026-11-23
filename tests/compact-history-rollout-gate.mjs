// No network or production credentials: rollout readiness can only be reviewed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(root,'scripts/check-compact-history-rollout.mjs');
const original=JSON.parse(fs.readFileSync(path.join(root,'docs/storage/COMPACT_HISTORY_RELEASE_EVIDENCE_20261116.json'),'utf8'));
function run(file){return spawnSync(process.execPath,[script,file].filter(Boolean),{cwd:root,encoding:'utf8',timeout:15000})}
const actual=run();
assert.equal(actual.status,2,'Current release must remain blocked');
const result=JSON.parse(actual.stdout);
assert.equal(result.eligible_for_review,false);
assert.equal(result.production_actions_authorized,undefined);
assert.equal(result.deployment_performed,false);
assert.equal(result.live_data_changed,false);
assert.ok(result.stages.length===5);
assert.ok(result.stages.every(s=>s.outcome==='HOLD'));
assert.ok(result.next_action.includes('disk_io_headroom'));
assert.ok(result.next_action.includes('coherent_recovery_restore'));
assert.ok(result.next_action.includes('current_edge_source_backup'));
const d=fs.mkdtempSync(path.join(os.tmpdir(),'zukait-history-gates-'));
try{
  function tmp(e){const p=path.join(d,'evidence.json');fs.writeFileSync(p,JSON.stringify(e));return p}
  const changed=structuredClone(original);
  changed.baseline.version=125;
  assert.notEqual(run(tmp(changed)).status,0,'New API version must fail');
  changed.baseline.version=124;
  changed.baseline.bundle_sha256='0'.repeat(64);
  assert.notEqual(run(tmp(changed)).status,0,'Source drift must fail');
  changed.baseline.bundle_sha256=original.baseline.bundle_sha256;
  changed.production_actions_authorized=true;
  assert.notEqual(run(tmp(changed)).status,0,'This file cannot authorize production');
  changed.production_actions_authorized=false;
  changed.gates.disk_io_headroom={state:'verified',note:'synthetic forged approval'};
  assert.notEqual(run(tmp(changed)).status,0,'Evidence-less verified gate must fail');
  changed.gates.disk_io_headroom={state:'verified',note:'synthetic forged approval',evidence:'SYNTHETIC-TEST-ONLY'};
  const stillBlocked=run(tmp(changed));
  assert.equal(stillBlocked.status,2,'One fabricated pass cannot unlock remaining gates');
  const allVerified=structuredClone(original);
  for(const g of Object.values(allVerified.gates)){
    g.state='verified';g.evidence='SYNTHETIC-TEST-ONLY';
  }
  const testOnly=run(tmp(allVerified));
  assert.equal(testOnly.status,0,'All fields create review eligibility in isolated fixture');
  const val=JSON.parse(testOnly.stdout);
  assert.equal(val.eligible_for_review,true);
  assert.equal(val.deployment_performed,false);
  assert.equal(val.authorization,'NONE__NEVER_AUTOMATICALLY_DEPLOY');
  assert.ok(val.stages.every(s=>s.outcome==='ELIGIBLE_FOR_SEPARATE_HUMAN_REVIEW'));
}finally{fs.rmSync(d,{recursive:true,force:true})}
console.log('PASS compact-history rollout safety: real hold, source drift, missing evidence, no auto-authorization, five-stage review only');
