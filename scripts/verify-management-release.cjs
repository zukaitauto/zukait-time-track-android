'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
function validate(r,ref) {
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
 assert.ok(!Number.isNaN(Date.parse(r.managedBackup?.completedAt)),'fresh backup evidence required');
 assert.equal(r.managedBackup?.project,'pjknotnjkufadqavcmii');
 assert.ok(Number.isSafeInteger(r.productionBackend?.version)&&r.productionBackend.version>61,'new backend deployment evidence required');
 assert.match(r.productionBackend?.bundleSha256||'',/^[0-9a-f]{64}$/,'backend bundle hash required');
 for(const k of ['preservation','permissionSmoke','hostedQa','ciRestoreRehearsal']) assert.equal(r.evidence?.[k]?.passed,true,k+' required');
 for(const v of Object.values(r.evidence)) assert.ok(typeof v.evidence==='string'&&v.evidence.length>=12);
 return true;
}
if(require.main===module) {
 const r=JSON.parse(fs.readFileSync('release-request.json','utf8'));
 if(r.releaseScope!=='reception-insurance-features-1-10') console.log('MANAGEMENT_PUBLICATION=false');
 else { validate(r,process.env.GITHUB_REF); console.log('MANAGEMENT_PUBLICATION=true'); console.log('UI_VERIFICATION_RUN='+r.verificationRun); }
}
module.exports={validate};
