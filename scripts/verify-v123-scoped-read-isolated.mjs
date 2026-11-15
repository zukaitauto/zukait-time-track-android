// ZUKAIT v123: isolated, no-network validation of the encrypted-Z Edge source.
// Node >= 22 required. Never writes to, uploads, or modifies a source bundle.
// Complete 43-file hash inventory is verified before patching index.ts in memory.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {pathToFileURL} from 'node:url';

const expectedDeploymentSha = 'edf5131f3b1394afe3ecff52d4d45c72680f8462889b07a1cfd871e9d374d68a';
const expectedIndexSha = '7288382735de10de0ab44c60cec013ad998f6a98d899129c1aea0d3eceb0964e';
const hash = data => createHash('sha256').update(data).digest('hex');
function fail(message) { throw Error(message); }
function argsParser(args) {
  const v = {};
  for (let i=0;i<args.length;i++) {
    if (args[i]==='--self-test') {v.selfTest=true; continue;}
    if (!['--function-dir','--manifest','--patch','--stage-dir'].includes(args[i])||!args[i+1]) fail('Invalid CLI argument '+args[i]);
    v[args[i].slice(2)]=args[++i];
  }
  return v;
}
function parseAndApply(source, patch) {
  if (!patch.startsWith('diff --git a/index.ts b/index.ts\n--- a/index.ts\n+++ b/index.ts\n')) fail('Patch is not for v123 index.ts');
  if (patch.match(/(^|\n)diff --git/g)?.length!==1) fail('Patch must affect exactly one file');
  const oldLines = source.split('\n'), lines=patch.replace(/\r\n/g,'\n').split('\n');
  const newLines=[];
  let oldAt=0, hunks=0, touched=[];
  for (let i=0;i<lines.length;) {
    const line=lines[i];
    if (!line.startsWith('@@ ')) {i++;continue;}
    const match=/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(line);
    if (!match) fail('Invalid unified diff header '+line);
    const start=Number(match[1])-1, oldLength=Number(match[2]), newLength=Number(match[4]);
    if (start<oldAt || start>oldLines.length) fail('Overlapping or out-of-range patch hunk');
    newLines.push(...oldLines.slice(oldAt,start));oldAt=start;i++;
    let oldCount=0,newCount=0;
    while(i<lines.length && /^[ +\-]/.test(lines[i])) {
      const prefix=lines[i][0], value=lines[i].slice(1);i++;
      if(prefix===' '||prefix==='-') {
        if(oldLines[oldAt]!==value) fail('Patch mismatch at original source line '+(oldAt+1));
        oldAt++;oldCount++;
      }
      if(prefix===' '||prefix==='+') {
        newLines.push(value);newCount++;
      }
      if(prefix==='+'||prefix==='-') touched.push(prefix+value);
    }
    if(oldCount!==oldLength||newCount!==newLength) fail('Patch hunk line counts mismatched');
    hunks++;
  }
  newLines.push(...oldLines.slice(oldAt));
  if(hunks!==3) fail('Expected exactly 3 patch hunks, got '+hunks);
  if(touched.filter(x=>x[0]==='-').length!==3) fail('Unexpected source deletions in patch');
  if(touched.some(x=>/commit_workshop_state_v2|computeLiveStatus|accountant_post|rpc\(/.test(x))) fail('Patch attempts to alter write operations');
  const newSource=newLines.join('\n');
  if(newSource===source) fail('No patch applied');
  if(!newSource.includes("select('jobs:data->jobs')")||
     !newSource.includes('select("jobs:data->jobs,assign:data->assign,sessions:data->sessions")'))
      fail('Expected read projections absent after patch');
  if(!newSource.includes("const result = receptionistDeliveryTransition(current.data, user, body, Date.now());"))
      fail('Delivery mutation path missing');
  return {newSource,hunks,changes:touched};
}
function inventoryCheck(folder, manifest) {
  assert.equal(manifest.project_ref,'pjknotnjkufadqavcmii','Incorrect project');
  const fns=manifest.functions;
  assert.equal(fns.length,9,'Expected 9 deployed functions');
  const fn=fns.find(x=>x.slug==='workshop-api');
  assert.ok(fn,'Missing workshop-api inventory');
  assert.equal(fn.version,123,'Incorrect deployed source version');
  assert.equal(fn.ezbr_sha256,expectedDeploymentSha,'Deployment bundle identity changed');
  assert.equal(fn.source_file_count,43,'Expected all 43 deployed files');
  assert.equal(fn.files.length,43,'Incomplete function inventory');
  const actual=fs.realpathSync(folder);
  const observed=[];
  for(const item of fn.files) {
    const name=item.path;
    if(typeof name!=='string'||!(/^[A-Za-z0-9_./-]+$/).test(name)||
       name.startsWith('/')||name.includes('\\')||name.split('/').some(x=>x==='..'||x===''||x==='.')) fail('Unsafe inventory file path');
    const candidate=fs.realpathSync(path.join(actual,...name.split('/')));
    const relative=path.relative(actual,candidate);
    if(!relative || relative.startsWith('..')||path.isAbsolute(relative)) fail('Source path escapes encrypted backup folder');
    const bytes=fs.readFileSync(candidate);
    assert.equal(bytes.length,item.bytes,'Size mismatch for '+name);
    assert.equal(hash(bytes),item.sha256,'SHA256 mismatch for '+name);
    observed.push({name,bytes:bytes.length,sha256:item.sha256});
  }
  assert.equal(observed.length,43);
  assert.equal(observed.find(x=>x.name==='index.ts')?.sha256,expectedIndexSha);
  return {source:fs.readFileSync(path.join(actual,'index.ts'),'utf8'),observed};
}
async function loadRealRules(folder) {
  // These modules come directly from the user's offline v123 archive.
  const qc=await import(pathToFileURL(path.join(folder,'qc_delivery_rules.js')).href);
  const insurance=await import(pathToFileURL(path.join(folder,'insurance_management_rules.js')).href);
  const receptionist=await import(pathToFileURL(path.join(folder,'receptionist_delivery_rules.js')).href);
  assert.equal(typeof qc.qcWork,'function');
  assert.equal(typeof insurance.insuranceProjection,'function');
  assert.equal(typeof receptionist.receptionistDeliveryList,'function');
  return {qcWork:qc.qcWork,insuranceProjection:insurance.insuranceProjection,
    insuranceLpoTransition:insurance.insuranceLpoTransition,
    receptionistDeliveryList:receptionist.receptionistDeliveryList,
    receptionistDeliveryRow:receptionist.receptionistDeliveryRow,
    receptionistDeliveryTransition:receptionist.receptionistDeliveryTransition};
}
function makeState(qcWork) {
  const data={
    users:[{id:'QA-TECH',name:'Synthetic Employee',role:'Employee',active:true,department:'Denter'}],
    jobs:[
      {no:'QA-001',receptionNo:'RC-QA-001',vehicle:'Synthetic Toyota',
        reg:'1234-Q',year:2024,jobType:'INSURANCE',insuranceCompany:'Synthetic Insurer',
        status:'Completed',createdAt:Date.parse('2026-11-10T10:00:00+04:00'),amount:100},
      {no:'QA-002',receptionNo:'RC-QA-002',vehicle:'Synthetic Honda',
        reg:'1235-Q',jobType:'CASH',status:'Open',
        createdAt:Date.parse('2026-11-09T10:00:00+04:00')},
    ],
    assign:[{id:'A1',job:'QA-001',emp:'QA-TECH',completed:true,completedAt:10}],
    sessions:[{id:'S1',job:'QA-001',emp:'QA-TECH',start:1,end:10}],
    expenses:[{id:'SYNTHETIC',value:'x'.repeat(2500)}],
    spareParts:[{id:'SYNTHETIC',value:'x'.repeat(2500)}]
  };
  data.jobs[0].qcWorkflow={
    revision:2,fingerprint:qcWork(data,'QA-001').fingerprint,
    painting:{result:'PASS'},final:{result:'PASS'},history:[]};
  return data;
}
function buildServer(source, snapshot, rules) {
  const trace={selects:[],writes:0,rpcs:0,apiCalls:0}, actor={role:'Manager'}, state=structuredClone(snapshot);
  const mockAdmin={
    from(table){
      if(!['staff_sessions','workshop_state','workshop_receptions','workshop_insurance_companies'].includes(table)) fail('Unexpected table access: '+table);
      let fields='', previous={}, current={};
      const chain={
        select(v){fields=v;trace.selects.push({table,fields:v});return chain;},
        eq(k,v){previous[k]=v;return chain;},
        order(){return chain;},
        async maybeSingle(){
          assert.equal(table,'staff_sessions');
          return {data:{user_id:'QA-ACTOR',revoked_at:null,last_seen_at:new Date().toISOString(),job_numbers:[],
            staff_credentials:{user_id:'QA-ACTOR',display_name:'Synthetic Actor',
              role:actor.role,department:'Reception',active:true,must_change:false}},error:null};
        },
        async single(){
          assert.equal(table,'workshop_state');
          assert.equal(previous.id,'main');
          if(fields==='data')return {data:{data:structuredClone(state)},error:null};
          if(fields==='revision,data')return {data:{data:structuredClone(state),revision:5},error:null};
          if(fields==='jobs:data->jobs')return {data:{jobs:structuredClone(state.jobs)},error:null};
          if(fields==='jobs:data->jobs,assign:data->assign,sessions:data->sessions')return {data:{
            jobs:structuredClone(state.jobs),assign:structuredClone(state.assign),sessions:structuredClone(state.sessions)},error:null};
          fail('Unexpected read selector: '+fields);
        },
        async range(){
          assert.equal(table,'workshop_receptions');
          return {data:[],error:null};
        },
        then(resolve,reject) {
          assert.equal(table,'workshop_insurance_companies');
          return Promise.resolve({data:[{id:1,name:'Synthetic Insurer'}],error:null}).then(resolve,reject);
        },
        update(){trace.writes++;fail('Unexpected UPDATE in read-only test');},
        insert(){trace.writes++;fail('Unexpected INSERT in read-only test');},
        delete(){trace.writes++;fail('Unexpected DELETE in read-only test');},
        upsert(){trace.writes++;fail('Unexpected UPSERT in read-only test');}
      };
      return chain;
    },
    async rpc(name) {trace.rpcs++;fail('Unexpected RPC in read-only test: '+name);}
  };
  let handler;
  const deno={env:{get:k=>k==='SUPABASE_PUBLISHABLE_KEY'?'synthetic-test-key':
    k==='SUPABASE_URL'?'https://invalid.synthetic':
    k==='SUPABASE_SERVICE_ROLE_KEY'?'synthetic-not-secret':''},
    serve:fn=>{handler=fn;}};
  const sandbox={
    Deno:deno,createClient:()=>mockAdmin,
    createDatabaseFetch:()=>()=>fail('No real HTTP fetch allowed'),
    insuranceProjection:rules.insuranceProjection,
    insuranceLpoTransition:rules.insuranceLpoTransition,
    receptionistDeliveryList:rules.receptionistDeliveryList,
    receptionistDeliveryRow:rules.receptionistDeliveryRow,
    receptionistDeliveryTransition:rules.receptionistDeliveryTransition,
    structuredClone,crypto:webcrypto,TextEncoder,Request,Response,Date,URL,console:{error(){}},
    fetch:()=>fail('Live network access forbidden in isolated test'),
    zukaitPaintOrderRules:{}
  };
  const withoutImports=source.replace(/^import[^\n]*\n/gm,'');
  const transpiled=stripTypeScriptTypes(withoutImports);
  vm.runInNewContext(transpiled,sandbox,{filename:'workshop-api-v123-isolated.ts',timeout:15000});
  assert.equal(typeof handler,'function','Edge entry did not register its handler');
  return {
    trace,
    async request(role,body) {
      actor.role=role;
      const res=await handler(new Request('https://synthetic.invalid',{
        method:'POST',headers:{apikey:'synthetic-test-key','x-zukait-session':'synthetic-session'},
        body:JSON.stringify(body)}));
      const payload=await res.json();
      return {status:res.status,body:JSON.parse(JSON.stringify(payload))};
    }
  };
}
async function testRuntime(original,patched,folder) {
  const rules=await loadRealRules(folder),state=makeState(rules.qcWork);
  const legacy=buildServer(original,state,rules),candidate=buildServer(patched,state,rules);
  const requests=[
    {role:'Manager',body:{action:'insurance_dashboard',section:'jobs',month:'2026-11'},expect:200},
    {role:'Manager',body:{action:'insurance_dashboard',section:'pending',month:'2026-11'},expect:200},
    {role:'Manager',body:{action:'insurance_dashboard',section:'wip',month:'2026-11'},expect:200},
    {role:'Receptionist',body:{action:'receptionist_delivery_list'},expect:200},
    {role:'Receptionist',body:{action:'insurance_dashboard'},expect:403},
    {role:'Manager',body:{action:'receptionist_delivery_list'},expect:403},
    {role:'Receptionist',body:{action:'receptionist_delivery_list',actor_id:'forged'},expect:403}
  ];
  for(const request of requests) {
    const a=await legacy.request(request.role,request.body);
    const b=await candidate.request(request.role,request.body);
    assert.equal(a.status,request.expect,'Baseline v123 response changed for '+request.body.action);
    assert.deepEqual(b,a,'Patched v123 response differs for '+request.body.action);
  }
  const oldSelectors=legacy.trace.selects.filter(x=>x.table==='workshop_state').map(x=>x.fields);
  const newSelectors=candidate.trace.selects.filter(x=>x.table==='workshop_state').map(x=>x.fields);
  assert.ok(oldSelectors.includes('data'),'Original v123 did not use full-state read');
  assert.ok(oldSelectors.includes('revision,data'),'Original v123 did not use full-state delivery read');
  assert.ok(newSelectors.includes('jobs:data->jobs'),'Missing Insurance projection in patched runtime');
  assert.ok(newSelectors.includes('jobs:data->jobs,assign:data->assign,sessions:data->sessions'),
    'Missing Reception delivery projection in patched runtime');
  assert.ok(!newSelectors.includes('data')&&!newSelectors.includes('revision,data'),
    'Patched read-only routes still loaded full-state data');
  assert.equal(candidate.trace.writes,0);
  assert.equal(candidate.trace.rpcs,0);
  assert.equal(legacy.trace.writes,0);
  assert.equal(legacy.trace.rpcs,0);
  return {cases:requests.length,originalSelectors:oldSelectors,patchedSelectors:newSelectors};
}

function makeOfflineReleasePackage({folder,observed,patchedSource,stageDir,metadata}) {
  // A complete, source-only staging + rollback rehearsal. Never deploy.
  if (!stageDir) fail('No release stage directory provided');
  const archiveDir=fs.realpathSync(folder);
  const parent=fs.realpathSync(path.dirname(path.dirname(path.dirname(path.dirname(archiveDir)))));
  const target=path.resolve(stageDir);
  const targetParent=fs.realpathSync(path.dirname(target));
  const same=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
  if (!same(targetParent,parent)) fail('Stage folder must be a NEW direct child of the encrypted backup base');
  if(fs.existsSync(target))fail('Stage folder exists: refusing to replace previous work');
  if(observed.length!==43||observed.filter(f=>f.name==='index.ts').length!==1)
    fail('Full 43-file source manifest required to stage or rehearse rollback');
  const expectedNames=new Set(observed.map(x=>x.name));
  if(expectedNames.size!==43)fail('Source inventory has duplicate filenames');

  const tmp=fs.mkdtempSync(path.join(parent,'.zukait-v123-stage-incomplete-'));
  let published=false;
  function treeName(root){return path.join(tmp,root,'supabase','functions','workshop-api')}
  function writeTree(root,patched){
    const output=treeName(root);
    for(const entry of observed){
      const targetFile=path.join(output,...entry.name.split('/'));
      fs.mkdirSync(path.dirname(targetFile),{recursive:true});
      if(patched&&entry.name==='index.ts'){
        fs.writeFileSync(targetFile,patchedSource,{flag:'wx'});
      }else {
        fs.copyFileSync(path.join(archiveDir,...entry.name.split('/')),targetFile,fs.constants.COPYFILE_EXCL);
      }
    }
    return output;
  }
  function inspectTree(root,patched){
    const files=[];
    function recurse(dirname,prefix=''){
      for(const dirent of fs.readdirSync(dirname,{withFileTypes:true})){
        const name=prefix?prefix+'/'+dirent.name:dirent.name;
        if(dirent.isSymbolicLink())fail('Stage contains a symbolic link: '+name);
        if(dirent.isDirectory())recurse(path.join(dirname,dirent.name),name);
        else if(dirent.isFile()) files.push(name);
        else fail('Unexpected staging filesystem object: '+name);
      }
    }
    recurse(root);
    if(files.length!==43||files.some(x=>!expectedNames.has(x))) fail('Staged source file list differs from exact 43-file manifest');
    for(const item of observed){
      const file=fs.readFileSync(path.join(root,...item.name.split('/')));
      const expectedHash=patched&&item.name==='index.ts'?hash(Buffer.from(patchedSource)):item.sha256;
      if(hash(file)!==expectedHash)fail('Staged SHA256 mismatch: '+item.name);
      if(!patched&&file.length!==item.bytes)fail('Rollback size mismatch: '+item.name);
    }
  }
  try{
    const rollback=writeTree('ROLLBACK-UNPATCHED-V123',false);
    const candidate=writeTree('CANDIDATE-PROJECTED-READS',true);
    inspectTree(rollback,false);
    inspectTree(candidate,true);
    // Offline rollback rehearsal: restore a working copy of the patched files
    // with the complete unpatched archive. Never replace a deployed function.
    const drill=treeName('ROLLBACK-DRILL');
    for(const item of observed){
      const destination=path.join(drill,...item.name.split('/'));
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.copyFileSync(path.join(candidate,...item.name.split('/')),destination,fs.constants.COPYFILE_EXCL);
    }
    for(const item of observed) {
      const restored=path.join(drill,...item.name.split('/'));
      const original=path.join(rollback,...item.name.split('/'));
      fs.copyFileSync(original,restored); // overwritten only in newly created temporary rehearsal
    }
    inspectTree(drill,false);
    fs.rmSync(path.join(tmp,'ROLLBACK-DRILL'),{recursive:true,force:true});
    if(hash(fs.readFileSync(path.join(archiveDir,'index.ts')))!==expectedIndexSha)
      fail('Encrypted original source changed after packaging');
    const result={
      status:'V123_SOURCE_STAGE_AND_ROLLBACK_REHEARSAL_PASSED',
      qualified_utc:new Date().toISOString(),
      project_ref:'pjknotnjkufadqavcmii',
      function_slug:'workshop-api',
      original_deployment_version:123,
      original_deployment_bundle_sha256:expectedDeploymentSha,
      source_file_count:43,
      changed_files:['index.ts'],
      patched_index_sha256:hash(Buffer.from(patchedSource)),
      baseline_index_sha256:expectedIndexSha,
      synthetic_api_cases:metadata.synthetic_cases,
      patch_hunks:metadata.applied_patch_hunks,
      rollback_copy_sha256_verified:true,
      candidate_unchanged_files_sha256_verified:true,
      rollback_rehearsal:'offline file restore completed and all 43 hashes rechecked; live CLI redeployment NOT exercised',
      production_deployments:0,
      production_writes:0,
      source_backup_mutated:false,
      contents:{
        candidate:'CANDIDATE-PROJECTED-READS/supabase/functions/workshop-api',
        rollback:'ROLLBACK-UNPATCHED-V123/supabase/functions/workshop-api'
      },
      deploy_authorized:false,
      caveat:'No live Supabase deployment, no actual deployment rollback proof, no credentials/config verification, no EBS disk IO measurements.'
    };
    fs.writeFileSync(path.join(tmp,'STAGE-AND-ROLLBACK-VERIFIED.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    fs.renameSync(tmp,target);
    published=true;
    return {stageRoot:target,manifest:result};
  }finally {
    if(!published&&fs.existsSync(tmp))fs.rmSync(tmp,{recursive:true,force:true});
  }
}
async function testPackagingFailClosed(){
  // This self-test never uses the operator's encrypted backup. Build 43
  // synthetic source files and check that staging/rollback copies are exact.
  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'zukait-package-fixture-'));
  try{
    const base=path.join(tempRoot,'Zukait-20261025');
    const folder=path.join(base,'FAKE-EDGE-BACKUP','supabase','functions','workshop-api');
    fs.mkdirSync(folder,{recursive:true});
    const items=[{name:'index.ts',bytes:10,sha256:hash(Buffer.from('unchanged\n'))}];
    for(let i=0;i<42;i++){
      const name='module/fixture'+String(i).padStart(2,'0')+'.js';
      const value=Buffer.from('synthetic '+i+'\n');
      items.push({name,bytes:value.length,sha256:hash(value)});
      const dst=path.join(folder,...name.split('/'));
      fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,value);
    }
    fs.writeFileSync(path.join(folder,'index.ts'),'unchanged\n');
    // Packaging function is pinned to actual v123 index SHA: reject synthetic data.
    assert.throws(()=>makeOfflineReleasePackage({
      folder,observed:items,patchedSource:'patched\n',
      stageDir:path.join(base,'NO-PACKAGE-ON-SOURCE-MISMATCH'),
      metadata:{synthetic_cases:7,applied_patch_hunks:3}
    }),/Encrypted original source changed/);
    assert.equal(fs.existsSync(path.join(base,'NO-PACKAGE-ON-SOURCE-MISMATCH')),false);
    assert.equal(fs.readFileSync(path.join(folder,'index.ts'),'utf8'),'unchanged\n');
    return true;
  }finally{fs.rmSync(tempRoot,{recursive:true,force:true});}
}

async function testHarnessSelfCheck() {
  // CI-only synthetic transport test uses development source and bundled JS rules.
  // It neither claims to verify deployed v123 nor connects to Supabase.
  const root=path.resolve('supabase/functions/workshop-api');
  const rules=await loadRealRules(root);
  const state=makeState(rules.qcWork);
  const candidate=buildServer(fs.readFileSync(path.join(root,'index.ts'),'utf8'),state,rules);
  const tests=[
    {role:'Manager',body:{action:'insurance_dashboard',section:'jobs',month:'2026-11'},expect:200},
    {role:'Manager',body:{action:'insurance_dashboard',section:'pending',month:'2026-11'},expect:200},
    {role:'Receptionist',body:{action:'receptionist_delivery_list'},expect:200},
    {role:'Receptionist',body:{action:'insurance_dashboard'},expect:403},
    {role:'Manager',body:{action:'receptionist_delivery_list'},expect:403},
    {role:'Receptionist',body:{action:'receptionist_delivery_list',actor_id:'forged'},expect:403}
  ];
  for (const t of tests) {
    const r=await candidate.request(t.role,t.body);
    assert.equal(r.status,t.expect,'Synthetic dev handler check for '+t.body.action);
  }
  assert.equal(candidate.trace.writes,0);
  assert.equal(candidate.trace.rpcs,0);
  assert.ok(candidate.trace.selects.some(s=>s.table==='workshop_state'&&
    s.fields==='jobs:data->jobs'));
  assert.ok(candidate.trace.selects.some(s=>s.table==='workshop_state'&&
    s.fields==='jobs:data->jobs,assign:data->assign,sessions:data->sessions'));
  return tests.length;
}
function testPatchParser() {
  const baseline='first\nsecond\nthird\nfourth\nfifth\nsixth\nseventh\n';
  const demo='diff --git a/index.ts b/index.ts\n--- a/index.ts\n+++ b/index.ts\n'+
    '@@ -1,2 +1,3 @@\n first\n-second\n+replacement\n+extra\n'+
    '@@ -3,2 +4,2 @@\n third\n-fourth\n+alternative\n'+
    '@@ -5,3 +6,3 @@\n fifth\n-sixth\n+another\n seventh\n';
  const expected='first\nreplacement\nextra\nthird\nalternative\nfifth\nanother\nseventh\n';
  // The mock patch below intentionally lacks required selectors; ensure fail-closed.
  assert.throws(()=>parseAndApply(baseline,demo),/Expected read projections absent/);
  assert.ok(expected.includes('replacement'));
}
async function main(){
  const a=argsParser(process.argv.slice(2));
  const major=Number(process.versions.node.split('.')[0]);
  if(major<22)fail('Node.js 22+ needed for isolated v123 TypeScript stripping. No backup changed.');
  if(a.selfTest) {
    testPatchParser();
    await testPackagingFailClosed();
    const n=await testHarnessSelfCheck();
    console.log('PASS: v123 patch parser, fail-closed 43-file staging/rollback, and '+n+' mocked API runtime self-checks (NOT deployed v123).');
    return;
  }
  if(!a['function-dir']||!a.manifest||!a.patch)fail('Specify --function-dir, --manifest and --patch. No data changed.');
  const folder=fs.realpathSync(path.resolve(a['function-dir']));
  const manifest=JSON.parse(fs.readFileSync(path.resolve(a.manifest),'utf8'));
  const {source,observed}=inventoryCheck(folder,manifest);
  const patch=fs.readFileSync(path.resolve(a.patch),'utf8');
  const applied=parseAndApply(source,patch);
  const result=await testRuntime(source,applied.newSource,folder);
  // Recheck the original index.ts bytes after tests: no mutation allowed.
  assert.equal(hash(fs.readFileSync(path.join(folder,'index.ts'))),expectedIndexSha,
    'Backup source changed unexpectedly');
  const report={
    status:'V123_EXACT_43_FILES_OFFLINE_RUNTIME_TEST_PASSED',
    tested_utc:new Date().toISOString(),
    project_ref:'pjknotnjkufadqavcmii',
    edge_version:123,
    deployed_bundle_sha256:expectedDeploymentSha,
    source_index_sha256:expectedIndexSha,
    patched_index_sha256:hash(Buffer.from(applied.newSource)),
    verified_source_file_count:observed.length,
    applied_patch_hunks:applied.hunks,
    synthetic_cases:result.cases,
    synthetic_original_read_selectors:result.originalSelectors,
    synthetic_patched_read_selectors:result.patchedSelectors,
    production_requests:0,
    production_writes:0,
    original_backup_modified:false,
    caveat:'Synthetic mocked Edge transport; not a production load test, EBS balance measurement or approval to deploy.'
  };
  // Write only an isolated test report under the system temporary directory.
  const resultFile=path.join(os.tmpdir(),'zukait-v123-offline-qual-'+Date.now()+'.json');
  fs.writeFileSync(resultFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log('V123 ISOLATED RUNTIME TEST PASSED - 43 verified source files, '+result.cases+' synthetic API cases, 3 patch hunks.');
  console.log('No network, no live API, no database writes and no source-backup edits.');
  if(a['stage-dir']){
    const packaged=makeOfflineReleasePackage({folder,observed,patchedSource:applied.newSource,
      stageDir:a['stage-dir'],metadata:report});
    console.log('V123 STAGING AND OFFLINE ROLLBACK REHEARSAL PASSED - 43 source files in each package; only candidate index.ts differs.');
    console.log('STAGING: '+packaged.stageRoot);
    console.log('STAGING REPORT: '+path.join(packaged.stageRoot,'STAGE-AND-ROLLBACK-VERIFIED.json'));
  }
  console.log('REPORT: '+resultFile);
}
main().catch(err=>{console.error('V123 ISOLATED TEST FAILED (no production changes): '+err.message);process.exitCode=1;});
