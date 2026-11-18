// Offline-only v128 compatibility packet tests. No production credentials/network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {assembleReaderCandidate,historyReaderRegion} from '../scripts/history-reader-patch-core.mjs';
const repo=process.cwd();
const lock=JSON.parse(fs.readFileSync('scripts/history-reader-v128-lock.json','utf8'));
assert.equal(lock.version,128);
assert.equal(lock.source_file_count,50);
assert.equal(lock.files.length,50);
assert.equal(new Set(lock.files.map(x=>x.name)).size,50);
assert.equal(lock.files.find(x=>x.name==='index.ts').sha256,lock.entrypoint_sha256);
assert.ok(lock.files.some(x=>x.name==='extensions/mechanical_qc_overview.js'));
assert.ok(lock.files.some(x=>x.name==='extensions/mechanical_inspection_storage.js'));
assert.ok(lock.files.some(x=>x.name==='accountant/api.js'));
assert.equal(lock.production_changes_authorized,false);
const repoIndex=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(historyReaderRegion(repoIndex).text,/ZUKAIT_HISTORY_READER_COMPAT/);
const legacyIndex=[
'// Stable authentication logic must never change.',
'const sessionUser = async()=>({active:true});',
'async function baseStateForRevision(revision: number, currentRevision: number, currentData: any) {',
'  if (revision===currentRevision) return currentData;',
'  return await admin.from("workshop_state_history").select("data").eq("revision",revision).maybeSingle();',
'}',
'',
'// FINAL_SESSION_STATUS_BEGIN',
'const accountant = {coalesceContextReads:true};',
'const mechanicalAuthorization = "unchanged";'
].join('\n');
const files=lock.files.map(x=>({name:x.name,content:x.name==='index.ts'?legacyIndex:'// synthetic unchanged '+x.name}));
const baseline={id:lock.edge_function_id,version:128,slug:'workshop-api',import_map:true,verify_jwt:false,ezbr_sha256:lock.ezbr_sha256,files};
const candidate=assembleReaderCandidate(baseline,repoIndex);
assert.equal(candidate.files.length,50);
assert.notEqual(candidate.files[0].content,baseline.files[0].content);
assert.equal(candidate.files[0].content.split('// FINAL_SESSION_STATUS_BEGIN')[1],legacyIndex.split('// FINAL_SESSION_STATUS_BEGIN')[1]);
assert.match(candidate.files[0].content,/ZUKAIT_HISTORY_READER_COMPAT/);
assert.match(candidate.files[0].content,/workshop_state_history/);
for(let i=1;i<50;i++)assert.deepEqual(candidate.files[i],baseline.files[i],'Module changed: '+baseline.files[i].name);
assert.deepEqual(baseline.files,files,'Assembler must not mutate the live readback');
assert.throws(()=>assembleReaderCandidate({...baseline,files:[...files,files[0]]},repoIndex),/Duplicate baseline files/);
assert.throws(()=>assembleReaderCandidate({...baseline,files:[{name:'index.ts',content:'no reader marker'},...files.slice(1)]},repoIndex),/anchor or boundary/);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zukait-v128-history-safe-'));
try{
 const input=path.join(dir,'synthetic-v128.json'),out=path.join(dir,'packet');
 fs.writeFileSync(input,JSON.stringify(baseline));
 let result=spawnSync(process.execPath,['scripts/prepare-history-reader-candidate.mjs',input,out],{cwd:repo,encoding:'utf8'});
 assert.notEqual(result.status,0,'Fabricated v128 source must fail SHA checks');
 assert.match(result.stderr,/Source (byte size|SHA-256) drift|Live handler drift/);
 assert.equal(fs.existsSync(out),false,'Failed validation must not create packet directory');
 const tampered={...baseline,ezbr_sha256:'0'.repeat(64)};
 fs.writeFileSync(input,JSON.stringify(tampered));
 result=spawnSync(process.execPath,['scripts/prepare-history-reader-candidate.mjs',input,out],{cwd:repo,encoding:'utf8'});
 assert.notEqual(result.status,0,'Mismatched bundle must fail');
 assert.equal(fs.existsSync(out),false);
 const stale={...baseline,version:129};
 fs.writeFileSync(input,JSON.stringify(stale));
 result=spawnSync(process.execPath,['scripts/prepare-history-reader-candidate.mjs',input,out],{cwd:repo,encoding:'utf8'});
 assert.notEqual(result.status,0,'Unqualified future version must fail');
 assert.equal(fs.existsSync(out),false);
}finally{fs.rmSync(dir,{recursive:true,force:true})}
console.log('PASS v128 offline reader: 50-file splice, unchanged auth/Accountant/Mechanical modules, strict hashes, stale/drift fail-closed, no production action.');
