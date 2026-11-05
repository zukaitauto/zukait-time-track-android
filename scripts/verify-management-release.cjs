'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
function validateWorkflowFixes(r,ref){
 assert.equal(ref,'refs/heads/architecture-v2');assert.equal(r.releaseScope,'manager-workflow-fixes');
 assert.equal(r.approvedForStaff,true);assert.equal(r.ownerPublicationRequested,true);assert.equal(r.ownerRequestedImmediateRelease,true);
 assert.match(r.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(r.versionName,'V390');assert.equal(r.versionCode,353);
 assert.equal(r.productionBackendChanges,true);assert.equal(r.backendDeploymentRequired,true);assert.equal(r.phase2ActivationApproved,false);
 assert.equal(r.physicalAcceptanceStatus,'NOT_RUN');assert.equal(r.freshProductionBackupRestoreStatus,'NOT_RUN');assert.equal(r.backupDeferredByOwner,true);
 assert.ok(Number.isFinite(Date.parse(r.approvedAt)));assert.ok(r.publishNonce?.length>=12);
 for(const k of ['signedAcceptanceRun','verificationRun'])assert.ok(Number.isSafeInteger(r[k])&&r[k]>0);
 assert.equal(r.productionBackend?.project,'pjknotnjkufadqavcmii');assert.ok(r.productionBackend?.version>103);assert.match(r.productionBackend?.bundleSha256||'',/^[a-f0-9]{64}$/);
 assert.deepEqual(r.productionBackend?.changedModules?.slice().sort(),['job_edit_rules.js','time_management_rules.js']);
 assert.equal(r.productionBackend?.readbackVerified,true);assert.equal(r.databaseMigration?.name,'manager_job_vehicle_location');assert.equal(r.databaseMigration?.verified,true);
 for(const k of ['isolatedLocationTransaction','preservedProductionWork','managerPermission'])assert.equal(r.evidence?.[k]?.passed,true);
 return true;
}
function validate(r,ref) {
 if(r.releaseScope==='manager-workflow-fixes')return validateWorkflowFixes(r,ref);
 assert.equal(ref,'refs/heads/architecture-v2');
 assert.equal(r.releaseScope,'reception-insurance-features-1-10');
 assert.equal(r.approvedForStaff,true);
 assert.equal(r.versionName,'V318'); assert.equal(r.versionCode,281);
 assert.match(r.sourceCommit,/^[a-f0-9]{40}$/);
 for(const k of ['signedAcceptanceRun','verificationRun']) assert.ok(Number.isSafeInteger(r[k])&&r[k]>0);
 assert.ok(!Number.isNaN(Date.parse(r.approvedAt)));
 assert.equal(r.ownerDeferrals?.freshProductionBackupRestore,'Authorize backup deferral and release');
 assert.equal(r.ownerDeferrals?.physicalDevices,'Defer physical testing and release');
 assert.equal(r.ownerDeferrals?.paidResources,'Do not add paid resources');
 assert.equal(r.physicalAcceptanceStatus,'NOT_RUN');
 assert.equal(r.freshProductionBackupRestoreStatus,'NOT_RUN');
 // Owner may explicitly defer managed backup verification for this release only.
 // Do not invent backup evidence; require the isolated CI restore rehearsal.
 if(r.managedBackup != null) {
  assert.ok(!Number.isNaN(Date.parse(r.managedBackup.completedAt)),'invalid managed backup date');
  assert.equal(r.managedBackup.project,'pjknotnjkufadqavcmii');
 } else {
  assert.equal(r.freshProductionBackupRestoreStatus,'NOT_RUN');
  assert.equal(r.evidence?.productionBackupReadiness?.passed,false,'unverified backup must remain unverified');
  assert.equal(r.evidence?.ciRestoreRehearsal?.passed,true,'isolated CI restore rehearsal required for deferral');
 }
 assert.ok(Number.isSafeInteger(r.productionBackend?.version)&&r.productionBackend.version>61,'new backend deployment evidence required');
 assert.match(r.productionBackend?.bundleSha256||'',/^[0-9a-f]{64}$/,'backend bundle hash required');
 for(const k of ['preservation','permissionSmoke','hostedQa','ciRestoreRehearsal']) assert.equal(r.evidence?.[k]?.passed,true,k+' required');
 for(const v of Object.values(r.evidence)) assert.ok(typeof v.evidence==='string'&&v.evidence.length>=12);
 return true;
}
if(require.main===module) {
 const r=JSON.parse(fs.readFileSync('release-request.json','utf8'));
 if(!['reception-insurance-features-1-10','manager-workflow-fixes'].includes(r.releaseScope)||r.approvedForStaff!==true) console.log('MANAGEMENT_PUBLICATION=false');
 else { validate(r,process.env.GITHUB_REF); console.log('MANAGEMENT_PUBLICATION=true'); console.log('UI_VERIFICATION_RUN='+r.verificationRun); }
}
module.exports={validate};
