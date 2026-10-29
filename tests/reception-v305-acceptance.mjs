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
else if (request.releaseScope==='standard') {
 assert.equal(validate(request,actual),true,'Approved standard release requires all seven evidenced gates');
} else if (required.some(key=>actual.checks[key]?.passed!==true)) {
 assert.throws(()=>validate(request,actual),'Incomplete evidence must not validate under another release scope');
} else assert.equal(validate(request,actual),true);
const good={...request,ownerBackupRestoreWaiver:undefined,approvedForStaff:true,sourceCommit:'a'.repeat(40),approvedAt:'2026-10-10T06:00:00Z',publishNonce:'fixture-only-nonce',signedAcceptanceRun:12345};
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
