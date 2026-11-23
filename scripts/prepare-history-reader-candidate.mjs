// Offline packaging only. No credentials, database connection or deployment.
// Input must be an independently verified, version-pinned live readback (43 or 50 files).
// Fail closed for unqualified versions or drift; never deploy this script.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assembleReaderCandidate} from './history-reader-patch-core.mjs';
const [baselinePath,outputPath]=process.argv.slice(2);
assert.ok(baselinePath&&outputPath,'Usage: node scripts/prepare-history-reader-candidate.mjs baseline.json NEW-output-directory');
const sha=s=>createHash('sha256').update(s).digest('hex');
const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
const expectedCount=baseline.version===128?50:43;
assert.equal(baseline.files.length,expectedCount,'Review a changed live source-file count separately');
// Keep the exact live bundle from the selected release. Never infer deployed
// code from the branch or silently use a stale v120 version label.
const approved={
  120:{index:'7288382735de10de0ab44c60cec013ad998f6a98d899129c1aea0d3eceb0964e',bundle:null},
  122:{index:'7288382735de10de0ab44c60cec013ad998f6a98d899129c1aea0d3eceb0964e',bundle:'c78650c9c8d7810e9770b03c44e9f10fb1b39f3a9e54529d657165c6d621f257'},
  123:{index:'7288382735de10de0ab44c60cec013ad998f6a98d899129c1aea0d3eceb0964e',bundle:'edf5131f3b1394afe3ecff52d4d45c72680f8462889b07a1cfd871e9d374d68a'},
  124:{index:'45c804facc435fd6e07c1743bb80e5451657fa0a93130b34c49525b18f7c8292',bundle:'ebd48e18da452008048a67902a346b9b3ad67e9f85124aa48aaa2dae7e134f3e'},
  128:{index:'90cb794e8f4160ada336587d4d5895a3a2c77d507d265dee205f467125d3a931',bundle:'d6d349a7a38881d23927c8f5c7ca8f2f89539e643c94e396b316b6ffa5e15901'},
};
const pinned=approved[baseline.version];
assert.ok(pinned,'Unqualified deployed version: review source before packaging');
if(pinned.bundle) assert.equal(baseline.ezbr_sha256,pinned.bundle,'Live bundle drift: requalify exact source');
assert.equal(baseline.slug,'workshop-api','Expected workshop-api live readback');
assert.equal(new Set(baseline.files.map(f=>f.name)).size,expectedCount);
if(baseline.version===128){
  const lock=JSON.parse(fs.readFileSync('scripts/history-reader-v128-lock.json','utf8'));
  assert.equal(lock.project_ref,'pjknotnjkufadqavcmii','Wrong live project');
  assert.equal(baseline.id,lock.edge_function_id,'Live function identity changed');
  assert.equal(lock.version,baseline.version);
  assert.equal(lock.ezbr_sha256,baseline.ezbr_sha256);
  assert.equal(baseline.import_map,true,'Import map changed');
  assert.deepEqual(baseline.files.map(f=>f.name),lock.files.map(f=>f.name),'Live v128 file manifest/order changed');
  for(const [i,file] of baseline.files.entries()){
    assert.equal(typeof file.content,'string','Missing source content: '+file.name);
    assert.equal(Buffer.byteLength(file.content,'utf8'),lock.files[i].bytes,'Source byte size drift: '+file.name);
    assert.equal(sha(file.content),lock.files[i].sha256,'Source SHA-256 drift: '+file.name);
  }
  assert.equal(lock.entrypoint_sha256,pinned.index);
}
const old=baseline.files.find(f=>f.name==='index.ts');
assert.equal(sha(old.content),pinned.index,'Live handler drift: requalify exact source');
assert.equal(sha(baseline.files.find(f=>f.name==='accountant/api.js').content),'03db7a9a7861d3463f780d468b57558b31fd14c065b75cf7f1ca74028eb43980','Priced-parts fix must remain');
assert.match(old.content,/coalesceContextReads:\s*true/,'Preserve active Accountant sharing');
assert.equal(baseline.verify_jwt,false,'Custom session authentication configuration must remain');
const repo=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const candidate=assembleReaderCandidate(baseline,repo);
assert.deepEqual(candidate.files.filter(f=>f.name!=='index.ts'),baseline.files.filter(f=>f.name!=='index.ts'));
assert.match(candidate.files.find(f=>f.name==='index.ts').content,/coalesceContextReads:\s*true/);
// Fail instead of overwriting a previous packet/rollback source.
fs.mkdirSync(outputPath);
const payload=b=>({name:'workshop-api',entrypoint_path:'index.ts',import_map_path:'deno.json',verify_jwt:false,files:b.files});
fs.writeFileSync(path.join(outputPath,'candidate-bundle.json'),JSON.stringify(payload(candidate),null,2));
const rollbackName=`rollback-v${baseline.version}-bundle.json`;
fs.writeFileSync(path.join(outputPath,rollbackName),JSON.stringify(payload(baseline),null,2));
fs.writeFileSync(path.join(outputPath,'candidate-index.ts'),candidate.files.find(f=>f.name==='index.ts').content);
const manifest={project:'pjknotnjkufadqavcmii',baseline_version:baseline.version,baseline_file_count:expectedCount,unchanged_file_count:expectedCount-1,baseline_bundle_sha256:baseline.ezbr_sha256||null,rollback_bundle_file:rollbackName,production_authorization:false,default_reader:'legacy',opt_in:'ZUKAIT_HISTORY_READER_COMPAT=true',changed_files:['index.ts'],requires_live_readback_recheck:true,requires_coherent_restore:true,files:candidate.files.map(f=>({name:f.name,baseline_sha256:sha(baseline.files.find(g=>g.name===f.name).content),candidate_sha256:sha(f.content)}))};
fs.writeFileSync(path.join(outputPath,'review.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared default-off reader and exact v${baseline.version} rollback; ${expectedCount-1} files unchanged. NO deployment performed.`);
