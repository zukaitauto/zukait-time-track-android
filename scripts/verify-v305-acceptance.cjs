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
 if(approval.ownerBackupRestoreWaiver) console.log('OWNER-DEFERRED: fresh backup restore NOT PERFORMED for V376.');
}
module.exports={validate,required};
