import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {validate}=createRequire(import.meta.url)('../scripts/verify-management-release.cjs');
const r={releaseScope:'reception-insurance-features-1-10',approvedForStaff:true,versionName:'V318',versionCode:281,sourceCommit:'a'.repeat(40),signedAcceptanceRun:1,verificationRun:2,approvedAt:'2026-10-12T16:00:00Z',ownerDeferrals:{freshProductionBackupRestore:'Authorize backup deferral and release',physicalDevices:'Defer physical testing and release',paidResources:'Do not add paid resources'},physicalAcceptanceStatus:'NOT_RUN',freshProductionBackupRestoreStatus:'NOT_RUN',managedBackup:{completedAt:'2026-10-11T19:04:38Z',project:'pjknotnjkufadqavcmii'},productionBackend:{version:62,bundleSha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},evidence:Object.fromEntries(['preservation','permissionSmoke','hostedQa','ciRestoreRehearsal'].map(k=>[k,{passed:true,evidence:'Verified evidence fixture'}]))};
assert.equal(validate(r,'refs/heads/architecture-v2'),true);
for(const ref of ['refs/heads/main','refs/heads/other']) assert.throws(()=>validate(r,ref));
for(const key of ['freshProductionBackupRestore','physicalDevices']) {const bad=structuredClone(r);delete bad.ownerDeferrals[key];assert.throws(()=>validate(bad,'refs/heads/architecture-v2'));}
for(const key of Object.keys(r.evidence)) {const bad=structuredClone(r);bad.evidence[key].passed=false;assert.throws(()=>validate(bad,'refs/heads/architecture-v2'));}
for(const [key,value] of [['sourceCommit',''],['signedAcceptanceRun',0],['versionCode',280],['physicalAcceptanceStatus','PASSED'],['freshProductionBackupRestoreStatus','PASSED']]) assert.throws(()=>validate({...r,[key]:value},'refs/heads/architecture-v2'));
console.log('PASS: full release requires exact owner deferrals and verified server/QA evidence; unperformed checks stay NOT_RUN');
