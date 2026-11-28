import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {validate,required}=createRequire(import.meta.url)('../scripts/verify-v305-acceptance.cjs');
const request=JSON.parse(fs.readFileSync('release-request.json','utf8'));
const actual=JSON.parse(fs.readFileSync('docs/INSURANCE_V305_ACCEPTANCE_GATE.json','utf8'));
assert.equal(typeof request.approvedForStaff,'boolean');
assert.equal(required.length,7);
// A standard release may complete the real evidence record. Validate its linkage
// rather than treating the historical incomplete record as a permanent fixture.
if (!request.approvedForStaff) assert.throws(()=>validate(request,actual),/Staff approval required/);
else if (request.remainingAcceptanceDeferral) {
 assert.equal(validate(request,actual),true);
 assert.throws(()=>validate({...request,remainingAcceptanceDeferral:undefined},actual),/client_https_restart/);
 const changed=structuredClone(actual);
 changed.checks.client_https_restart.passed=true;
 assert.throws(()=>validate(request,changed),/must remain not passed/);
 const web=structuredClone(actual);
 web.checks.pc_site_reconciled.passed=false;
 assert.throws(()=>validate(request,web),/pc_site_reconciled/);
} else if (request.releaseScope==='standard') {
 assert.equal(validate(request,actual),true,'Approved standard release requires all seven evidenced gates');
} else if(request.versionName==='V420'&&request.backupRestoreDeferral&&required.filter(key=>key!=='fresh_backup_restored'&&!request.physicalDeviceDeferral?.checks.includes(key)).every(key=>actual.checks[key]?.passed===true)) {
 assert.equal(validate(request,actual),true,'V420 explicit backup deferral still requires six verified gates');
} else if (required.some(key=>actual.checks[key]?.passed!==true)) {
 assert.throws(()=>validate(request,actual),'Incomplete evidence must not validate under another release scope');
} else assert.equal(validate(request,actual),true);
const good={...request,v425AcceptanceDeferral:undefined,v424AcceptanceDeferral:undefined,v423AcceptanceDeferral:undefined,v422AcceptanceDeferral:undefined,v421AcceptanceDeferral:undefined,remainingAcceptanceDeferral:undefined,physicalDeviceDeferral:undefined,backupRestoreDeferral:undefined,ownerBackupRestoreWaiver:undefined,ownerBrowserBuildWaiver:undefined,approvedForStaff:true,sourceCommit:'a'.repeat(40),approvedAt:'2026-10-10T06:00:00Z',publishNonce:'fixture-only-nonce',signedAcceptanceRun:12345};
const complete={...actual,versionName:good.versionName,versionCode:good.versionCode,sourceCommit:good.sourceCommit,checks:Object.fromEntries(required.map(k=>[k,{passed:true,evidence:'docs/QA-'+k+'.md',verifiedBy:'QA Reviewer',verifiedAt:'2026-10-10T05:00:00Z'}]))};
assert.equal(validate(good,complete),true,'Synthetic complete attestation must validate');
for(const key of required) {
 const missing={...complete,checks:{...complete.checks,[key]:{...complete.checks[key],passed:false}}};
 assert.throws(()=>validate(good,missing),new RegExp(key));
}
assert.throws(()=>validate({...good,sourceCommit:'b'.repeat(40)},complete),/source SHA mismatch/);
assert.throws(()=>validate({...good,signedAcceptanceRun:null},complete),/Signed acceptance run/);
console.log('PASS: all 7 release acceptance gates fail closed until evidenced and linked to approved SHA');

const waivedApproval={...good,versionName:'V376',versionCode:339,freshProductionBackupRestoreStatus:'DEFERRED_BY_OWNER_NOT_PERFORMED'};
const waiver={check:'fresh_backup_restored',status:'DEFERRED_BY_OWNER_NOT_PERFORMED',versionName:'V376',versionCode:339,sourceCommit:good.sourceCommit,authorizedBy:'Owner in this conversation',recordedAt:'2026-10-29T18:52:58Z',instruction:"I don't want backup test, bypass it and release, we can do backup test later"};
waivedApproval.ownerBackupRestoreWaiver=waiver;
const deferred={...structuredClone(complete),versionName:'V376',versionCode:339};
deferred.checks.fresh_backup_restored={passed:false,evidence:'Owner deferred backup restore; test was not performed.',ownerWaiver:structuredClone(waiver)};
assert.equal(validate(waivedApproval,deferred),true);
for(const key of required.filter(k=>k!=='fresh_backup_restored')) {
 const bad=structuredClone(deferred); bad.checks[key].passed=false;
 assert.throws(()=>validate(waivedApproval,bad),new RegExp(key),'Backup waiver must not waive '+key);
}
for(const [key,value] of Object.entries({check:'physical_safari',status:'PASSED',versionName:'V377',versionCode:340,sourceCommit:'b'.repeat(40),authorizedBy:'agent',instruction:'release',recordedAt:'invalid'})) {
 const bad=structuredClone(waivedApproval);bad.ownerBackupRestoreWaiver[key]=value;
 assert.throws(()=>validate(bad,deferred),'Reject invalid waiver '+key);
}
const future=structuredClone(waivedApproval);future.versionName='V377';
assert.throws(()=>validate(future,{...deferred,versionName:'V377'}),/limited to V376/);
const fakePass=structuredClone(deferred);fakePass.checks.fresh_backup_restored.passed=true;
assert.throws(()=>validate(waivedApproval,fakePass),/must remain not passed/);
const mismatch=structuredClone(deferred);delete mismatch.checks.fresh_backup_restored.ownerWaiver;
assert.throws(()=>validate(waivedApproval,mismatch),/records must match/);
assert.throws(()=>validate({...waivedApproval,ownerBackupRestoreWaiver:undefined},deferred),/fresh_backup_restored/);
console.log('PASS: V376 owner backup deferral is explicit, source-bound, not a test pass, and cannot waive other checks');

const browserWaiver={checks:['client_https_restart','physical_safari'],status:'OWNER_REPORTED_BUILD_UNVERIFIED_DEFERRED',versionName:'V376',versionCode:339,sourceCommit:good.sourceCommit,authorizedBy:'Owner in this conversation',recordedAt:'2026-10-29T19:00:00Z',instruction:'Defer browser-build verification and release'};
const bothApproval={...waivedApproval,ownerBrowserBuildWaiver:browserWaiver};
const bothRecord=structuredClone(deferred);
for(const k of browserWaiver.checks) bothRecord.checks[k]={passed:false,evidence:'Owner reports V376 browser tests; exact tested build unknown and explicitly deferred.',ownerWaiver:structuredClone(browserWaiver)};
assert.equal(validate(bothApproval,bothRecord),true);
for(const k of ['physical_android','full_data_preservation','pc_site_reconciled','production_backend_smoke']) {
 const bad=structuredClone(bothRecord);bad.checks[k].passed=false;
 assert.throws(()=>validate(bothApproval,bad),new RegExp(k));
}
for(const [key,value] of Object.entries({checks:['physical_android'],status:'PASSED',versionName:'V377',versionCode:340,sourceCommit:'b'.repeat(40),authorizedBy:'agent',instruction:'release',recordedAt:'invalid'})) {
 const bad=structuredClone(bothApproval);bad.ownerBrowserBuildWaiver[key]=value;
 assert.throws(()=>validate(bad,bothRecord),'Reject browser waiver '+key);
}
assert.throws(()=>validate({...bothApproval,ownerBrowserBuildWaiver:undefined},bothRecord),/client_https_restart/);
const fakeBrowser=structuredClone(bothRecord);fakeBrowser.checks.physical_safari.passed=true;
assert.throws(()=>validate(bothApproval,fakeBrowser),/must remain not passed/);
console.log('PASS: explicit browser-build deferral cannot bypass Android, preservation, deployment or source checks');

if(request.versionName==='V420'&&request.backupRestoreDeferral){
 const v420={...request,remainingAcceptanceDeferral:undefined,approvedForStaff:true,approvedAt:'2026-11-24T19:00:00Z',publishNonce:'fixture-only-v420'};
 const v420Evidence={...complete,versionName:'V420',versionCode:383,sourceCommit:v420.sourceCommit,checks:structuredClone(complete.checks)};
 v420Evidence.checks.fresh_backup_restored={passed:false,evidence:'Explicit owner deferral; restore not performed.',ownerWaiver:structuredClone(v420.backupRestoreDeferral)};
 for(const k of v420.physicalDeviceDeferral?.checks||[]) v420Evidence.checks[k]={passed:false,evidence:'Explicit owner physical deferral; not performed.',ownerWaiver:structuredClone(v420.physicalDeviceDeferral)};
 assert.equal(validate(v420,v420Evidence),true);
 for(const k of required.filter(k=>k!=='fresh_backup_restored'&&!v420.physicalDeviceDeferral?.checks.includes(k))){const incomplete=structuredClone(v420Evidence);incomplete.checks[k].passed=false;assert.throws(()=>validate(v420,incomplete),new RegExp(k));}
 const changed={...v420,sourceCommit:'b'.repeat(40)};assert.throws(()=>validate(changed,{...v420Evidence,sourceCommit:changed.sourceCommit}),/source mismatch/);
 const fake=structuredClone(v420Evidence);fake.checks.fresh_backup_restored.passed=true;assert.throws(()=>validate(v420,fake),/must remain not passed/);
 for(const k of v420.physicalDeviceDeferral?.checks||[]){const invalid=structuredClone(v420Evidence);invalid.checks[k].passed=true;assert.throws(()=>validate(v420,invalid),/must remain not passed/);}
 if(v420.physicalDeviceDeferral){const invalid={...v420,physicalDeviceDeferral:undefined};assert.throws(()=>validate(invalid,v420Evidence),/physical_android/);}
 console.log('PASS: V420 owner deferrals cannot waive any other acceptance check');
}

if(request.versionName==='V421'&&request.v421AcceptanceDeferral){
 const approved={...request,approvedForStaff:true,approvedAt:'2026-11-25T08:00:00Z',publishNonce:'fixture-v421-owner-defer'};
 assert.equal(validate(approved,actual),true);
 assert.throws(()=>validate({...approved,v421AcceptanceDeferral:undefined},actual),/client_https_restart/);
 for(const key of required){
  const fake=structuredClone(actual);fake.checks[key].passed=true;
  assert.throws(()=>validate(approved,fake),/must remain not passed/);
  const missing=structuredClone(actual);delete missing.checks[key].ownerWaiver;
  assert.throws(()=>validate(approved,missing),/records must match/);
 }
 for(const [key,value] of Object.entries({versionName:'V422',versionCode:385,sourceCommit:'b'.repeat(40),signedAcceptanceRun:1})){
  const altered={...approved,[key]:value};
  assert.throws(()=>validate(altered,{...actual,[key]:value}));
 }
 console.log('PASS: V421 exception is exact-source, owner-directed and cannot fabricate acceptance.');
}

if(request.versionName==='V422'&&request.v422AcceptanceDeferral){
 const approved={...request,approvedForStaff:true,approvedAt:'2026-11-25T08:00:00Z',publishNonce:'fixture-v422-owner-defer'};
 assert.equal(validate(approved,actual),true);
 assert.throws(()=>validate({...approved,v422AcceptanceDeferral:undefined},actual),/client_https_restart/);
 for(const key of required){
  const fake=structuredClone(actual);fake.checks[key].passed=true;
  assert.throws(()=>validate(approved,fake),/must remain not passed/);
  const missing=structuredClone(actual);delete missing.checks[key].ownerWaiver;
  assert.throws(()=>validate(approved,missing),/records must match/);
 }
 for(const [key,value] of Object.entries({versionName:'V423',versionCode:386,sourceCommit:'b'.repeat(40),signedAcceptanceRun:1})){
  const altered={...approved,[key]:value};
  assert.throws(()=>validate(altered,{...actual,[key]:value}));
 }
 console.log('PASS: V422 exception is exact-source, owner-directed and cannot fabricate acceptance.');
}

if(request.versionName==='V423'&&request.v423AcceptanceDeferral){
 const approved={...request,approvedForStaff:true,approvedAt:'2026-11-25T08:00:00Z',publishNonce:'fixture-v423-owner-defer'};
 assert.equal(validate(approved,actual),true);
 assert.throws(()=>validate({...approved,v423AcceptanceDeferral:undefined},actual),/client_https_restart/);
 for(const key of required){
  const fake=structuredClone(actual);fake.checks[key].passed=true;
  assert.throws(()=>validate(approved,fake),/must remain not passed/);
  const missing=structuredClone(actual);delete missing.checks[key].ownerWaiver;
  assert.throws(()=>validate(approved,missing),/records must match/);
 }
 for(const [key,value] of Object.entries({versionName:'V424',versionCode:387,sourceCommit:'b'.repeat(40),signedAcceptanceRun:1})){
  const altered={...approved,[key]:value};
  assert.throws(()=>validate(altered,{...actual,[key]:value}));
 }
 console.log('PASS: V423 exception is exact-source, owner-directed and cannot fabricate acceptance.');
}

if(request.versionName==='V424'&&request.v424AcceptanceDeferral){
 const approved={...request,approvedForStaff:true,approvedAt:'2026-11-25T08:00:00Z',publishNonce:'fixture-v424-owner-defer'};
 assert.equal(validate(approved,actual),true);
 assert.throws(()=>validate({...approved,v424AcceptanceDeferral:undefined},actual),/client_https_restart/);
 for(const key of required){
  const fake=structuredClone(actual);fake.checks[key].passed=true;
  assert.throws(()=>validate(approved,fake),/must remain not passed/);
  const missing=structuredClone(actual);delete missing.checks[key].ownerWaiver;
  assert.throws(()=>validate(approved,missing),/records must match/);
 }
 for(const [key,value] of Object.entries({versionName:'V425',versionCode:388,sourceCommit:'b'.repeat(40),signedAcceptanceRun:1})){
  const altered={...approved,[key]:value};
  assert.throws(()=>validate(altered,{...actual,[key]:value}));
 }
 console.log('PASS: V424 exception is exact-source, owner-directed and cannot fabricate acceptance.');
}

if(request.versionName==='V425'&&request.v425AcceptanceDeferral){
 assert.equal(validate(request,actual),true);
 assert.throws(()=>validate({...request,v425AcceptanceDeferral:undefined},actual),/client_https_restart/);
 for(const key of required){
  const fake=structuredClone(actual);fake.checks[key].passed=true;
  assert.throws(()=>validate(request,fake),/must remain not passed/);
  const missing=structuredClone(actual);delete missing.checks[key].ownerWaiver;
  assert.throws(()=>validate(request,missing),/records must match/);
 }
 for(const [key,value] of Object.entries({versionName:'V426',versionCode:389,sourceCommit:'b'.repeat(40),signedAcceptanceRun:1,verificationRun:1,ownerPublicationRequested:false,productionBackendChanges:false,phase2ActivationApproved:true})){
  const changed={...request,[key]:value};assert.throws(()=>validate(changed,{...actual,[key]:value}));
 }
 const wrongBackend={...request,productionBackend:{...request.productionBackend,readbackVerified:false}};
 assert.throws(()=>validate(wrongBackend,actual));
 const wrongInstruction=structuredClone(request);wrongInstruction.v425AcceptanceDeferral.instruction='publish';assert.throws(()=>validate(wrongInstruction,actual));
 console.log('PASS: V425 owner deferral is exact-source, exact-signed-artifact, server-readback-bound and cannot fabricate manual acceptance.');
}
