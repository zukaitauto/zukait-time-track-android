// ZUKAIT v124 history reader: OFFLINE-only backup-to-candidate staging.
// Requires a completed, hash-verified v124 Edge Functions backup on encrypted Z:.
// Does not connect to Supabase, deploy Edge Functions or write to PostgreSQL.
// Run with Node 22+ from a repository checkout.
// Usage: node scripts/stage-v124-history-reader-offline.mjs "Z:\...\ZUKAIT-EDGE-SOURCES-..." "Z:\...\NEW-READER-STAGE"
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [backupArg, targetArg] = process.argv.slice(2);
assert.ok(backupArg && targetArg, 'Usage: node scripts/stage-v124-history-reader-offline.mjs BACKUP_DIR NEW_STAGE_DIR');
assert.ok(Number(process.versions.node.split('.')[0]) >= 22, 'Node 22+ required for isolated TypeScript reader qualification');

const backup = path.resolve(backupArg);
const target = path.resolve(targetArg);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (child, parent) => child === parent || child.startsWith(parent + path.sep);
assert.ok(!within(target,backup) && !within(backup,target), 'Staging and backup directories must remain separate');
if (process.platform === 'win32') {
  assert.equal(path.parse(backup).root.toUpperCase(), 'Z:\\', 'Use the encrypted Z: backup drive');
  assert.equal(path.parse(target).root.toUpperCase(), 'Z:\\', 'Use the encrypted Z: staging drive');
}
assert.ok(fs.statSync(backup).isDirectory(), 'Expected the v124 encrypted backup folder');
assert.ok(fs.existsSync(path.dirname(target)), 'Create the encrypted staging parent folder first');
assert.ok(!fs.existsSync(target), 'Refusing to overwrite an existing staging package');

const pinnedPath = path.join(repoRoot,'docs/storage/EDGE_FUNCTION_LIVE_SOURCE_SHA256_20261115_V124.json');
const pinned = JSON.parse(fs.readFileSync(pinnedPath,'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(backup,'EDGE-SOURCE-BACKUP-PASSED.json'),'utf8'));
assert.equal(pinned.project_ref,'pjknotnjkufadqavcmii');
assert.equal(pinned.status,'SOURCE_HASH_INVENTORY__NOT_YET_SAVED_TO_PC');
assert.equal(report.project_ref,pinned.project_ref);
assert.equal(report.pinned_inventory,'EDGE_FUNCTION_LIVE_SOURCE_SHA256_20261115_V124.json');
assert.equal(report.function_count,9);
assert.equal(report.file_count,53);
assert.match(report.status,/HASH_VERIFIED/);

const fn = pinned.functions.find(x=>x.slug==='workshop-api');
assert.ok(fn,'Pinned workshop API source missing');
assert.equal(fn.version,124,'Pinned version must be v124');
assert.equal(fn.ezbr_sha256,'ebd48e18da452008048a67902a346b9b3ad67e9f85124aa48aaa2dae7e134f3e');
assert.equal(fn.source_file_count,43);
assert.equal(fn.verify_jwt,false);
assert.equal(fn.files.length,43);
const functionRoot = path.resolve(backup,'supabase','functions','workshop-api');
assert.ok(fs.statSync(functionRoot).isDirectory(), 'Expected complete backed-up workshop-api source');

const files = fn.files.map(f=>{
  assert.match(f.path,/^[A-Za-z0-9_.\-/]+$/,'Unexpected source file name');
  assert.ok(!f.path.split('/').some(v=>v==='..' || v==='.'),'Unsafe source path');
  const local = path.resolve(functionRoot,...f.path.split('/'));
  assert.ok(within(local,functionRoot),'Source escapes backup folder');
  assert.ok(fs.lstatSync(local).isFile(),'Source must be a regular file, not symlink');
  const bytes = fs.readFileSync(local);
  assert.equal(bytes.length,f.bytes,'Backed-up source length mismatch: '+f.path);
  assert.equal(sha256(bytes),f.sha256,'Backed-up source hash mismatch: '+f.path);
  const content = bytes.toString('utf8');
  assert.ok(Buffer.from(content,'utf8').equals(bytes),'Non UTF-8 backed-up source: '+f.path);
  return {name:f.path,content};
});
assert.equal(new Set(files.map(f=>f.name)).size,43);
const originalIndex = files.find(f=>f.name==='index.ts');
assert.equal(sha256(originalIndex.content),'45c804facc435fd6e07c1743bb80e5451657fa0a93130b34c49525b18f7c8292');

const exactReadback = {
  slug:'workshop-api',version:124,ezbr_sha256:fn.ezbr_sha256,
  verify_jwt:false,files
};
fs.mkdirSync(target);
const input = path.join(target,'verified-live-v124-input.json');
const output = path.join(target,'offline-packet');
try {
  fs.writeFileSync(input,JSON.stringify(exactReadback));
  execFileSync(process.execPath,[
    path.join(repoRoot,'scripts/prepare-history-reader-candidate.mjs'),input,output
  ],{cwd:repoRoot,stdio:'inherit',timeout:60000});
} finally {
  if(fs.existsSync(input)) fs.unlinkSync(input);
}
const result = JSON.parse(fs.readFileSync(path.join(output,'candidate-bundle.json'),'utf8'));
const rollback = JSON.parse(fs.readFileSync(path.join(output,'rollback-v124-bundle.json'),'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(output,'review.json'),'utf8'));
assert.equal(manifest.production_authorization,false);
assert.equal(manifest.baseline_version,124);
assert.equal(manifest.default_reader,'legacy');
assert.equal(manifest.changed_files.join(','),'index.ts');
assert.deepEqual(rollback.files,files,'Exact source rollback is not byte-equivalent');
assert.equal(result.files.length,43);
for(const f of result.files) {
  const original = fn.files.find(x=>x.path===f.name);
  assert.ok(original,'Unexpected output file: '+f.name);
  if(f.name!=='index.ts') {
    assert.equal(sha256(f.content),original.sha256,'Non-reader source changed: '+f.name);
  } else {
    assert.notEqual(sha256(f.content),original.sha256,'Reader patch missing');
    assert.match(f.content,/ZUKAIT_HISTORY_READER_COMPAT/);
  }
}
execFileSync(process.execPath,[
  path.join(repoRoot,'tests/history-reader-rollout.mjs'),
  path.join(output,'candidate-index.ts')
],{cwd:repoRoot,stdio:'inherit',timeout:60000});
const pass = {
  status:'OFFLINE_V124_HISTORY_READER_CANDIDATE_AND_ROLLBACK_VERIFIED',
  project_ref:pinned.project_ref,
  deployed_source_version:124,
  source_bundle_sha256:fn.ezbr_sha256,
  source_file_count:43,
  unchanged_file_count:42,
  reader_test:'PASSED',
  rollback:'EXACT_SOURCE_FILES_VERIFIED__NOT_LIVE_REDEPLOYMENT_TEST',
  candidate_path:'offline-packet/candidate-bundle.json',
  rollback_path:'offline-packet/rollback-v124-bundle.json',
  requires_fresh_live_readback:true,
  production_approval:false,
  production_changes:'NONE',
  history_cutover:'NOT_AUTHORIZED',
  prepared_utc:new Date().toISOString()
};
fs.writeFileSync(path.join(target,'STAGE-PASSED.json'),JSON.stringify(pass,null,2)+'\n',{flag:'wx'});
process.stdout.write('PASS v124 offline history reader and exact rollback: 43 files; no production access or changes.\n');
