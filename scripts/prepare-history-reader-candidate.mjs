// Offline packaging only. No credentials, database connection or deployment.
// Input must be the verified 43-file live v120 readback/deployment bundle.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [baselinePath,outputPath]=process.argv.slice(2);
assert.ok(baselinePath&&outputPath,'Usage: node scripts/prepare-history-reader-candidate.mjs baseline.json NEW-output-directory');
const sha=s=>createHash('sha256').update(s).digest('hex');
const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
assert.equal(baseline.files.length,43,'Review a changed live bundle separately');
assert.equal(new Set(baseline.files.map(f=>f.name)).size,43);
const old=baseline.files.find(f=>f.name==='index.ts');
assert.equal(sha(old.content),'7288382735de10de0ab44c60cec013ad998f6a98d899129c1aea0d3eceb0964e','Live handler drift: requalify exact source');
assert.equal(sha(baseline.files.find(f=>f.name==='accountant/api.js').content),'03db7a9a7861d3463f780d468b57558b31fd14c065b75cf7f1ca74028eb43980','Priced-parts fix must remain');
assert.match(old.content,/coalesceContextReads:\s*true/,'Preserve active Accountant sharing');
assert.equal(baseline.verify_jwt,false,'Custom session authentication configuration must remain');
const repo=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
function region(source){const start=source.indexOf('async function baseStateForRevision('),end=source.indexOf('// FINAL_SESSION_STATUS_BEGIN',start);assert.ok(start>0&&end>start);return {start,end,text:source.slice(start,end)}}
const target=region(old.content),replacement=region(repo);
assert.match(replacement.text,/ZUKAIT_HISTORY_READER_COMPAT/);
const candidate=structuredClone(baseline);
candidate.files.find(f=>f.name==='index.ts').content=old.content.slice(0,target.start)+replacement.text+old.content.slice(target.end);
assert.deepEqual(candidate.files.filter(f=>f.name!=='index.ts'),baseline.files.filter(f=>f.name!=='index.ts'));
assert.match(candidate.files.find(f=>f.name==='index.ts').content,/coalesceContextReads:\s*true/);
// Fail instead of overwriting a previous packet/rollback source.
fs.mkdirSync(outputPath);
const payload=b=>({name:'workshop-api',entrypoint_path:'index.ts',import_map_path:'deno.json',verify_jwt:false,files:b.files});
fs.writeFileSync(path.join(outputPath,'candidate-bundle.json'),JSON.stringify(payload(candidate),null,2));
fs.writeFileSync(path.join(outputPath,'rollback-v120-bundle.json'),JSON.stringify(payload(baseline),null,2));
fs.writeFileSync(path.join(outputPath,'candidate-index.ts'),candidate.files.find(f=>f.name==='index.ts').content);
const manifest={project:'pjknotnjkufadqavcmii',baseline_version:120,production_authorization:false,default_reader:'legacy',opt_in:'ZUKAIT_HISTORY_READER_COMPAT=true',changed_files:['index.ts'],requires_live_readback_recheck:true,files:candidate.files.map(f=>({name:f.name,baseline_sha256:sha(baseline.files.find(g=>g.name===f.name).content),candidate_sha256:sha(f.content)}))};
fs.writeFileSync(path.join(outputPath,'review.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared default-off reader and exact v120 rollback; 42 files unchanged. NO deployment performed.');
