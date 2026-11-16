// ZUKAIT compact-history rollout GATE ONLY. Offline, read-only file checks.
// Does not connect to Supabase, deploy, restart, rewrite, delete or set modes.
// Usage: node scripts/check-compact-history-rollout.mjs [evidence.json]
// Output: decision, ordered blockers, release phase eligibility (review only).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=process.argv[2]||path.join(root,'docs/storage/COMPACT_HISTORY_RELEASE_EVIDENCE_20261116.json');
const evidence=JSON.parse(fs.readFileSync(input,'utf8'));
const pin=JSON.parse(fs.readFileSync(path.join(root,'docs/storage/EDGE_FUNCTION_LIVE_SOURCE_SHA256_20261115_V124.json'),'utf8'));
const baseline=pin.functions.find(x=>x.slug==='workshop-api');
assert.equal(evidence.project_id,'pjknotnjkufadqavcmii','Wrong production project');
assert.equal(pin.project_ref,evidence.project_id);
assert.equal(evidence.target_branch,'architecture-v2');
assert.equal(evidence.baseline.version,124,'New API version requires requalification');
assert.equal(evidence.baseline.bundle_sha256,baseline.ezbr_sha256,'API source has drifted');
assert.equal(evidence.baseline.verify_jwt,false);
assert.equal(baseline.source_file_count,43,'Unexpected function bundle');
assert.equal(evidence.production_actions_authorized,false,'This preparation file cannot authorize production actions');
assert.equal(evidence.default_mode,'legacy','Never stage initially in dual or compact');
const stages=[
  {id:'legacy_infrastructure',name:'Install infrastructure in LEGACY mode',requires:[
    'live_workshop_stable','disk_io_headroom','physical_storage_headroom',
    'coherent_recovery_restore','current_edge_source_backup',
    'exact_source_rollback_rehearsal','history_dependency_audit',
    'pg17_isolated_tests','specific_legacy_infra_approval']},
  {id:'compatible_reader',name:'Deploy reader default OFF',requires:[
    'legacy_infrastructure_verified','history_reader_acl_and_integrity',
    'reader_candidate_and_rollback_verified','specific_reader_approval']},
  {id:'dual_observation',name:'Bounded DUAL observation',requires:[
    'compatible_reader_verified','dual_peak_io_budget',
    'stop_conditions_and_monitoring','specific_dual_approval']},
  {id:'compact_capture',name:'Enable COMPACT after observed integrity',requires:[
    'dual_integrity_verified','full_app_acceptance_verified',
    'compact_only_revisions_readable','specific_compact_approval']},
  {id:'old_history_reclaim',name:'Archive and reclaim legacy history',requires:[
    'compact_stability_verified','compact_only_restore_verified',
    'old_archive_checksum_verified','storage_reclaim_plan_verified',
    'specific_reclaim_approval']}
];
const all=Array.from(new Set(stages.flatMap(x=>x.requires)));
assert.deepEqual(Object.keys(evidence.gates).sort(),all.sort(),'Evidence must name every required gate exactly');
for(const [k,v] of Object.entries(evidence.gates)){
  assert.ok(v && ['verified','pending','blocked'].includes(v.state),'Invalid state: '+k);
  assert.ok(typeof v.note==='string' && v.note.trim().length>0,'Missing gate description: '+k);
  if(v.state==='verified'){
    assert.ok(typeof v.evidence==='string' && v.evidence.trim().length>7,'Missing evidence for '+k);
  }
}
const result={
  project_id:evidence.project_id,
  baseline_version:evidence.baseline.version,
  default_mode:evidence.default_mode,
  live_data_changed:false,
  deployment_performed:false,
  stages:[],
  eligible_for_review:false,
  authorization:'NONE__NEVER_AUTOMATICALLY_DEPLOY',
};
let priorReady=true;
for(const st of stages){
  const blockers=st.requires.filter(key=>evidence.gates[key].state!=='verified').map(key=>({
    gate:key,status:evidence.gates[key].state,reason:evidence.gates[key].note
  }));
  const eligible=priorReady && blockers.length===0;
  result.stages.push({
    phase:st.id,description:st.name,
    outcome:eligible?'ELIGIBLE_FOR_SEPARATE_HUMAN_REVIEW':'HOLD',
    blockers,prior_phase_ready:priorReady
  });
  priorReady=eligible;
}
result.eligible_for_review=result.stages[0].outcome==='ELIGIBLE_FOR_SEPARATE_HUMAN_REVIEW';
if(!result.eligible_for_review){
  result.next_action=result.stages[0].blockers.map(b=>b.gate);
}else{
  result.next_action=['Seek specific independent approval for LEGACY-mode infrastructure; revalidate live version and resource headroom'];
}
process.stdout.write(JSON.stringify(result,null,2)+'\n');
if(!result.eligible_for_review)process.exitCode=2;
