// Synthetic safety checks for offline v124 history-reader packaging.
// Never connects to Supabase; no backup data is read in CI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(repo,'scripts/stage-v124-history-reader-offline.mjs');
function run(args) {
  return spawnSync(process.execPath,[script,...args],{
    cwd:repo,encoding:'utf8',timeout:20000
  });
}
const syntax=spawnSync(process.execPath,['--check',script],{
  cwd:repo,encoding:'utf8',timeout:20000
});
assert.equal(syntax.status,0,'Offline staging script must parse: '+syntax.stderr);
const missing=run([]);
assert.notEqual(missing.status,0,'Missing input must fail closed');
assert.match(missing.stderr,/Usage: node scripts\/stage-v124-history-reader-offline/);

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zukait-v124-safety-'));
try {
  const backup=path.join(dir,'backup');
  const target=path.join(dir,'stage');
  fs.mkdirSync(backup);
  const noManifest=run([backup,target]);
  assert.notEqual(noManifest.status,0,'Unverified backup must fail');
  assert.equal(fs.existsSync(target),false,'Never stage without backup evidence');

  fs.writeFileSync(path.join(backup,'EDGE-SOURCE-BACKUP-PASSED.json'),JSON.stringify({
    project_ref:'pjknotnjkufadqavcmii',
    pinned_inventory:'OUTDATED-V123.json',
    function_count:9,file_count:53,status:'HASH_VERIFIED'
  }));
  const outdated=run([backup,target]);
  assert.notEqual(outdated.status,0,'v123 backup must be rejected');
  assert.match(outdated.stderr,/pinned_inventory/);
  assert.equal(fs.existsSync(target),false,'Old backup must not create stage');

  fs.writeFileSync(path.join(backup,'EDGE-SOURCE-BACKUP-PASSED.json'),JSON.stringify({
    project_ref:'pjknotnjkufadqavcmii',
    pinned_inventory:'EDGE_FUNCTION_LIVE_SOURCE_SHA256_20261115_V124.json',
    function_count:9,file_count:53,status:'HASH_VERIFIED'
  }));
  const empty=run([backup,target]);
  assert.notEqual(empty.status,0,'No source files must fail even with a forged manifest');
  assert.equal(fs.existsSync(target),false,'No source, no candidate stage');

  const identical=run([backup,backup]);
  assert.notEqual(identical.status,0,'Never write inside backup folder');
  assert.match(identical.stderr,/separate/);
  console.log('PASS v124 offline reader: syntax, missing/old/forged backups fail closed, no staging, backup separation');
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}
