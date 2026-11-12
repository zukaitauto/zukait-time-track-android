// Review-only bundle preparation. No network calls, deployment or database writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function prepare(baseline,moduleSource,qualifiedApi){
 assert.equal(baseline.slug,'workshop-api');assert.equal(baseline.version,117,'Reinspect any newer live bundle before patching');assert.equal(baseline.verify_jwt,false);assert.equal(baseline.files.length,42);assert.equal(baseline.import_map,true);assert.ok(baseline.import_map_path.endsWith('/deno.json'));
 const files=baseline.files.map(f=>({name:f.name,content:f.content}));assert.equal(new Set(files.map(f=>f.name)).size,files.length);
 for(const f of files){assert.equal(typeof f.content,'string');assert.ok(f.name&&!path.isAbsolute(f.name)&&!f.name.split('/').includes('..')&&!f.name.includes(':')&&!f.name.includes('\\'))}
 const api=files.find(f=>f.name==='accountant/api.js'),index=files.find(f=>f.name==='index.ts');assert.ok(api&&index);assert.ok(!files.some(f=>f.name==='accountant/context_reader.js'));
 const old="const loaded=await admin.rpc('zukait_accountant_context',{p_actor_id:user.id});if(loaded.error)throw loaded.error;\n const context=loaded.data,full=";
 const replacement="const context=await readAccountantContext(admin,user,{enabled:services.coalesceContextReads===true,project:services.contextProject||'',readOnly:['accountant_dashboard','accountant_jc_search','accountant_jc_detail','accountant_report'].includes(action)});\n const full=";
 assert.equal(api.content.split(old).length,2,'Expected exactly one original context load');
 api.content="import {createAccountantContextReader} from './context_reader.js';\nconst readAccountantContext=createAccountantContextReader();\n"+api.content.replace(old,replacement);
 assert.equal(api.content.replaceAll('\r\n','\n'),qualifiedApi.replaceAll('\r\n','\n'),'Live API patch must equal qualified source');
 const call='Date.now(),{computeLiveStatus});return reply(result.body,result.status);';assert.equal(index.content.split(call).length,2);
 index.content=index.content.replace(call,"Date.now(),{computeLiveStatus,coalesceContextReads:Deno.env.get('ZUKAIT_ACCOUNTANT_COALESCE_READS')==='true',contextProject:Deno.env.get('SUPABASE_URL')||''});return reply(result.body,result.status);");
 files.push({name:'accountant/context_reader.js',content:moduleSource});
 const changes=files.filter(f=>!baseline.files.some(old=>old.name===f.name&&old.content===f.content)).map(f=>f.name).sort();assert.deepEqual(changes,['accountant/api.js','accountant/context_reader.js','index.ts']);
 return {files,manifest:{reviewOnly:true,project:'pjknotnjkufadqavcmii',baselineVersion:117,baselineBundleSha256:baseline.ezbr_sha256,verifyJwt:false,changedModules:changes,unchangedModules:40,featureFlag:'ZUKAIT_ACCOUNTANT_COALESCE_READS',defaultEnabled:false,files:files.map(f=>({name:f.name,sha256:hash(f.content)}))}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const [source,output]=process.argv.slice(2);assert.ok(source&&output,'Usage: node scripts/prepare-accountant-read-coalescing.mjs baseline.json output-directory');
 const baseline=JSON.parse(fs.readFileSync(source,'utf8'));const result=prepare(baseline,fs.readFileSync('supabase/functions/workshop-api/accountant/context_reader.js','utf8'),fs.readFileSync('supabase/functions/workshop-api/accountant/api.js','utf8'));
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'candidate-bundle.json'),JSON.stringify({name:'workshop-api',verify_jwt:false,entrypoint_path:'index.ts',import_map_path:'deno.json',files:result.files}));fs.writeFileSync(path.join(output,'baseline-bundle.json'),JSON.stringify(baseline));fs.writeFileSync(path.join(output,'review-manifest.json'),JSON.stringify(result.manifest,null,2)+'\n');console.log(JSON.stringify({changed:result.manifest.changedModules,unchanged:40,reviewOnly:true,defaultEnabled:false}));
}
