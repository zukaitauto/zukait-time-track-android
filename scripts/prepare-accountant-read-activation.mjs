// Review-only configuration change. Never deploys or writes database records.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function prepareActivation(baseline){
 assert.equal(baseline.slug,'workshop-api');assert.equal(baseline.version,118);assert.equal(baseline.ezbr_sha256,'c832a8e8a5e546a3c4880dc6a3ffb3fa1a7c53283e59888dadfab2b3033134a1');assert.equal(baseline.verify_jwt,false);assert.equal(baseline.import_map,true);assert.equal(baseline.files.length,43);
 const files=baseline.files.map(f=>({name:f.name,content:f.content})),index=files.find(f=>f.name==='index.ts');assert.ok(index);assert.equal(index.content.split('coalesceContextReads:false').length,2);
 index.content=index.content.replace('coalesceContextReads:false','coalesceContextReads:true');
 const changed=files.filter(f=>!baseline.files.some(old=>old.name===f.name&&old.content===f.content)).map(f=>f.name);assert.deepEqual(changed,['index.ts']);
 return {candidate:{name:'workshop-api',entrypoint_path:'index.ts',import_map_path:'deno.json',verify_jwt:false,files},manifest:{reviewOnly:true,project:'pjknotnjkufadqavcmii',baselineVersion:118,changedModules:changed,unchangedModules:42,enabled:true,files:files.map(f=>({name:f.name,sha256:hash(f.content)}))}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const [source,output]=process.argv.slice(2);assert.ok(source&&output,'Usage: node scripts/prepare-accountant-read-activation.mjs baseline-v118.json output-directory');const b=JSON.parse(fs.readFileSync(source,'utf8')),r=prepareActivation(b);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'activation-bundle.json'),JSON.stringify(r.candidate));fs.writeFileSync(path.join(output,'rollback-disabled-v118.json'),JSON.stringify(b));fs.writeFileSync(path.join(output,'activation-manifest.json'),JSON.stringify(r.manifest,null,2)+'\n');console.log('Review-only activation: one boolean change; 42 modules preserved; no deployment performed.');
}
