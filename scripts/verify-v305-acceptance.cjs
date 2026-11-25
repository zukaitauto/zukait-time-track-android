'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const required=['client_https_restart','physical_android','physical_safari','full_data_preservation','fresh_backup_restored','pc_site_reconciled','production_backend_smoke'];
function validate(approval,record) {
 assert.equal(approval.approvedForStaff,true,'Staff approval required');
 assert.match(String(approval.sourceCommit||''),/^[0-9a-f]{40}$/i,'Approved source SHA required');
 assert.ok(typeof approval.approvedAt==='string'&&!Number.isNaN(Date.parse(approval.approvedAt)),'Approval timestamp required');
 assert.ok(typeof approval.publishNonce==='string'&&approval.publishNonce.length>=12,'Publication nonce required');
 assert.ok(Number.isSafeInteger(approval.signedAcceptanceRun)&&approval.signedAcceptanceRun>0,'Signed acceptance run required');
 assert.equal(record.versionName,approval.versionName,'Acceptance version mismatch');
 assert.equal(record.versionCode,approval.versionCode,'Acceptance version code mismatch');
 assert.equal(record.sourceCommit,approval.sourceCommit,'Acceptance source SHA mismatch');
 for(const key of required) {
  const check=record.checks?.[key];
  // One-time V421 owner-directed release exception. No deferred check is a pass.
  if(approval.v421AcceptanceDeferral) {
   const waiver=approval.v421AcceptanceDeferral;
   assert.equal(approval.versionName,'V421','Exception limited to V421');
   assert.equal(approval.versionCode,384);
   assert.equal(approval.releaseScope,'standard');
   assert.equal(approval.sourceCommit,'5e02808249f536505d115d2f054651c161617408');
   assert.equal(approval.signedAcceptanceRun,45571357825);
   assert.equal(approval.ownerPublicationRequested,true);
   assert.equal(approval.ownerRequestedImmediateRelease,true);
   assert.equal(approval.phase2ActivationApproved,false);
   assert.equal(approval.previousPublishedRelease?.versionName,'V420');
   assert.deepEqual(waiver.checks,required);
   assert.equal(waiver.status,'DEFERRED_BY_OWNER_NOT_PERFORMED');
   assert.equal(waiver.versionName,approval.versionName);
   assert.equal(waiver.versionCode,approval.versionCode);
   assert.equal(waiver.sourceCommit,approval.sourceCommit);
   assert.equal(waiver.signedAcceptanceRun,approval.signedAcceptanceRun);
   assert.equal(waiver.authorizedBy,'Owner in this conversation');
   assert.equal(waiver.instruction,'3 bypass; fix and publish');
   assert.equal(waiver.recordedDate,'2026-11-25');
   assert.equal(approval.physicalAcceptanceStatus,waiver.status);
   assert.equal(approval.freshProductionBackupRestoreStatus,waiver.status);
   assert.equal(check?.passed,false,'Deferred check must remain not passed: '+key);
   assert.equal(check?.status,waiver.status);
   assert.deepEqual(check?.ownerWaiver,waiver,'V421 exception records must match');
   assert.ok(typeof check.evidence==='string'&&check.evidence.trim().length>=12);
   continue;
  }
  // One-time V422 owner-directed release exception. No deferred check is a pass.
  if(approval.v422AcceptanceDeferral) {
   const waiver=approval.v422AcceptanceDeferral;
   assert.equal(approval.versionName,'V422','Exception limited to V422');
   assert.equal(approval.versionCode,385);
   assert.equal(approval.releaseScope,'standard');
   assert.equal(approval.sourceCommit,'4f390af88fea04b28f72cb5b063ed549916f110d');
   assert.equal(approval.signedAcceptanceRun,45593239658);
   assert.equal(approval.verificationRun,45593239138);
   assert.equal(approval.accountantVerificationRun,45593239082);
   assert.equal(approval.ownerPublicationRequested,true);
   assert.equal(approval.ownerRequestedImmediateRelease,true);
   assert.equal(approval.phase2ActivationApproved,false);
   assert.equal(approval.previousPublishedRelease?.versionName,'V421');
   assert.deepEqual(waiver.checks,required);
   assert.equal(waiver.status,'DEFERRED_BY_OWNER_NOT_PERFORMED');
   assert.equal(waiver.versionName,approval.versionName);
   assert.equal(waiver.versionCode,approval.versionCode);
   assert.equal(waiver.sourceCommit,approval.sourceCommit);
   assert.equal(waiver.signedAcceptanceRun,approval.signedAcceptanceRun);
   assert.equal(waiver.authorizedBy,'Owner in this conversation');
   assert.equal(waiver.instruction,'Bypass and publish');
   assert.equal(waiver.recordedDate,'2026-11-25');
   assert.equal(approval.physicalAcceptanceStatus,waiver.status);
   assert.equal(approval.freshProductionBackupRestoreStatus,waiver.status);
   assert.equal(check?.passed,false,'Deferred check must remain not passed: '+key);
   assert.equal(check?.status,waiver.status);
   assert.deepEqual(check?.ownerWaiver,waiver,'V422 exception records must match');
   assert.ok(typeof check.evidence==='string'&&check.evidence.trim().length>=12);
   continue;
  }
  if(['client_https_restart','physical_safari'].includes(key) && approval.ownerBrowserBuildWaiver) {
   const waiver=approval.ownerBrowserBuildWaiver;
   assert.equal(approval.versionName,'V376','Browser waiver is limited to V376');
   assert.equal(approval.versionCode,339,'Browser waiver version code mismatch');
   assert.deepEqual(waiver.checks,['client_https_restart','physical_safari'],'Browser waiver checks mismatch');
   assert.equal(waiver.status,'OWNER_REPORTED_BUILD_UNVERIFIED_DEFERRED','Browser waiver status mismatch');
   assert.equal(waiver.versionName,approval.versionName,'Browser waiver version mismatch');
   assert.equal(waiver.versionCode,approval.versionCode,'Browser waiver version code mismatch');
   assert.equal(waiver.sourceCommit,approval.sourceCommit,'Browser waiver source mismatch');
   assert.equal(waiver.authorizedBy,'Owner in this conversation','Browser waiver owner required');
   assert.equal(waiver.instruction,'Defer browser-build verification and release','Explicit browser deferral required');
   assert.ok(typeof waiver.recordedAt==='string'&&!Number.isNaN(Date.parse(waiver.recordedAt)),'Browser waiver timestamp required');
   assert.equal(check?.passed,false,'Unverified browser build must remain not passed');
   assert.deepEqual(check?.ownerWaiver,waiver,'Browser waiver records must match');
   assert.ok(typeof check.evidence==='string'&&check.evidence.trim().length>=12,'Browser deferral evidence required');
   continue;
  }
  // The owner's V420 physical-device deferral is scoped to the exact signed candidate.
  if(['physical_android','physical_safari'].includes(key) && approval.physicalDeviceDeferral) {
   const waiver=approval.physicalDeviceDeferral;
   assert.equal(approval.versionName,'V420','Physical deferral limited to V420');
   assert.equal(approval.versionCode,383,'V420 physical deferral version code mismatch');
   assert.equal(approval.releaseScope,'purchase-invoice-coordinated','V420 coordinated scope required');
   assert.equal(approval.sourceCommit,'c521ccc89c7a11897cb1d536f9a877e7280856d0','V420 physical deferral source mismatch');
   assert.equal(approval.signedAcceptanceRun,45467177557,'V420 signed acceptance run mismatch');
   assert.equal(approval.ownerPublicationRequested,true,'Owner publication request required');
   assert.deepEqual(waiver.checks,['physical_android','physical_safari'],'Physical deferral checks mismatch');
   assert.equal(waiver.status,'DEFERRED_BY_OWNER_NOT_PERFORMED','Physical deferral status mismatch');
   assert.equal(waiver.versionName,approval.versionName,'Physical deferral version mismatch');
   assert.equal(waiver.versionCode,approval.versionCode,'Physical deferral version code mismatch');
   assert.equal(waiver.sourceCommit,approval.sourceCommit,'Physical deferral source mismatch');
   assert.equal(waiver.authorizedBy,'Owner in this conversation','Explicit owner authorization required');
   assert.equal(waiver.instruction,'Bypass and publish','Explicit physical deferral required');
   assert.equal(waiver.recordedDate,'2026-11-24','V420 physical deferral date mismatch');
   assert.equal(approval.physicalAcceptanceStatus,waiver.status,'Physical deferral status must be disclosed');
   assert.equal(check?.passed,false,'Deferred physical test must remain not passed');
   assert.deepEqual(check?.ownerWaiver,waiver,'Physical deferral records must match');
   assert.ok(typeof check.evidence==='string'&&check.evidence.trim().length>=12,'Physical deferral evidence required');
   continue;
  }
  // Explicit owner authorization applies only to the exact signed V420 source.
  if(key==='fresh_backup_restored' && approval.backupRestoreDeferral) {
   const waiver=approval.backupRestoreDeferral;
   assert.equal(approval.versionName,'V420','V420 backup deferral only');
   assert.equal(approval.versionCode,383,'V420 backup deferral version code mismatch');
   assert.equal(approval.releaseScope,'purchase-invoice-coordinated','V420 coordinated scope required');
   assert.equal(approval.sourceCommit,'c521ccc89c7a11897cb1d536f9a877e7280856d0','V420 backup deferral source mismatch');
   assert.equal(approval.signedAcceptanceRun,45467177557,'V420 signed acceptance run mismatch');
   assert.equal(approval.ownerPublicationRequested,true,'Owner publication request required');
   assert.equal(waiver.check,key,'Backup deferral check mismatch');
   assert.equal(waiver.status,'DEFERRED_BY_OWNER_NOT_PERFORMED','Backup deferral status mismatch');
   assert.equal(waiver.versionName,approval.versionName,'Backup deferral version mismatch');
   assert.equal(waiver.versionCode,approval.versionCode,'Backup deferral version code mismatch');
   assert.equal(waiver.sourceCommit,approval.sourceCommit,'Backup deferral source mismatch');
   assert.equal(waiver.authorizedBy,'Owner in this conversation','Explicit owner authorization required');
   assert.equal(waiver.instruction,'Defer backup','Explicit backup deferral required');
   assert.equal(waiver.recordedDate,'2026-11-24','V420 deferral date mismatch');
   assert.equal(approval.freshProductionBackupRestoreStatus,waiver.status,'Backup deferral status must be disclosed');
   assert.equal(check?.passed,false,'Deferred backup must remain not passed');
   assert.deepEqual(check?.ownerWaiver,waiver,'Backup deferral records must match');
   assert.ok(typeof check.evidence==='string'&&check.evidence.trim().length>=12,'Backup deferral evidence required');
   continue;
  }
  // One-release owner exception: never represent a deferred restore as passed.
  if(key==='fresh_backup_restored' && approval.ownerBackupRestoreWaiver) {
   const waiver=approval.ownerBackupRestoreWaiver;
   assert.equal(approval.versionName,'V376','Backup waiver is limited to V376');
   assert.equal(approval.versionCode,339,'Backup waiver version code mismatch');
   assert.equal(waiver.check,key,'Backup waiver check mismatch');
   assert.equal(waiver.status,'DEFERRED_BY_OWNER_NOT_PERFORMED','Backup waiver status mismatch');
   assert.equal(waiver.versionName,approval.versionName,'Backup waiver version mismatch');
   assert.equal(waiver.versionCode,approval.versionCode,'Backup waiver version code mismatch');
   assert.equal(waiver.sourceCommit,approval.sourceCommit,'Backup waiver source mismatch');
   assert.equal(waiver.authorizedBy,'Owner in this conversation','Backup waiver owner required');
   assert.equal(waiver.instruction,"I don't want backup test, bypass it and release, we can do backup test later",'Explicit backup deferral required');
   assert.ok(typeof waiver.recordedAt==='string'&&!Number.isNaN(Date.parse(waiver.recordedAt)),'Backup waiver timestamp required');
   assert.equal(approval.freshProductionBackupRestoreStatus,waiver.status,'Backup status must disclose deferral');
   assert.equal(check?.passed,false,'Deferred backup must remain not passed');
   assert.deepEqual(check?.ownerWaiver,waiver,'Backup waiver records must match');
   assert.ok(typeof check.evidence==='string'&&check.evidence.trim().length>=12,'Backup deferral evidence required');
   continue;
  }
  const remainingV420Checks=['client_https_restart','full_data_preservation','production_backend_smoke'];
  if(remainingV420Checks.includes(key) && approval.remainingAcceptanceDeferral) {
   const waiver=approval.remainingAcceptanceDeferral;
   assert.equal(approval.versionName,'V420');
   assert.equal(approval.versionCode,383);
   assert.equal(approval.releaseScope,'purchase-invoice-coordinated');
   assert.equal(approval.sourceCommit,'c521ccc89c7a11897cb1d536f9a877e7280856d0');
   assert.equal(approval.signedAcceptanceRun,45467177557);
   assert.equal(approval.ownerPublicationRequested,true);
   assert.equal(approval.ownerRequestedImmediateRelease,true);
   assert.deepEqual(waiver.checks,remainingV420Checks);
   assert.equal(waiver.status,'DEFERRED_BY_OWNER_NOT_PERFORMED');
   assert.equal(waiver.versionName,approval.versionName);
   assert.equal(waiver.versionCode,approval.versionCode);
   assert.equal(waiver.sourceCommit,approval.sourceCommit);
   assert.equal(waiver.authorizedBy,'Owner in this conversation');
   assert.equal(waiver.instruction,'bypass all and publish');
   assert.equal(waiver.recordedDate,'2026-11-25');
   assert.equal(check?.passed,false,'Deferred acceptance must remain not passed');
   assert.deepEqual(check?.ownerWaiver,waiver);
   assert.ok(typeof check.evidence==='string'&&check.evidence.trim().length>=12);
   continue;
  }
  if(check?.passed!==true||typeof check.evidence!=='string'||check.evidence.trim().length<12||
     typeof check.verifiedBy!=='string'||check.verifiedBy.trim().length<2||
     !check.verifiedAt||Number.isNaN(Date.parse(check.verifiedAt))) {
   throw Error('V305 release blocked: missing independently verified evidence for '+key);
  }
 }
 return true;
}
if(require.main===module) {
 const approval=JSON.parse(fs.readFileSync('release-request.json','utf8'));
 const record=JSON.parse(fs.readFileSync('docs/INSURANCE_V305_ACCEPTANCE_GATE.json','utf8'));
 validate(approval,record);
 console.log('V305 acceptance requirements satisfied for approved source '+approval.sourceCommit);
 if(approval.v421AcceptanceDeferral) console.log('OWNER-DEFERRED: V421 seven manual acceptance gates NOT PERFORMED; signed source and publication integrity checks remain mandatory.');
 if(approval.ownerBrowserBuildWaiver) console.log('OWNER-DEFERRED: exact browser build verification; owner reports V376 browser tests.');
 if(approval.remainingAcceptanceDeferral) console.log('OWNER-DEFERRED: V420 authenticated production smoke, HTTPS restart and complete data preservation NOT VERIFIED.');
 if(approval.physicalDeviceDeferral) console.log('OWNER-DEFERRED: V420 physical Android and Safari tests NOT PERFORMED.');
 if(approval.backupRestoreDeferral) console.log('OWNER-DEFERRED: V420 backup restore NOT PERFORMED.');
 if(approval.ownerBackupRestoreWaiver) console.log('OWNER-DEFERRED: fresh backup restore NOT PERFORMED for V376.');
}
module.exports={validate,required};
