'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
function validate(r,ref){
 assert.equal(ref,'refs/heads/architecture-v2','Accountant release must use architecture-v2');
 // Mechanical uses the established protected coordinated publication gates, but only
 // when explicitly owner-authorized, backend-unchanged and QA-proven.
 const mechanical=r.releaseScope==='mechanical-ui-test';
 assert.ok(mechanical||r.releaseScope==='accountant-live-test','Accountant / Mechanical scope required');assert.equal(r.approvedForStaff,true);
 if(mechanical){
  assert.equal(r.ownerApprovedMechanicalUiTesting,true,'Mechanical UI owner authorization required');
  assert.equal(r.authorization,'Owner approved publishing the Mechanical Department modern UI for testing.','Mechanical owner publication intent required');
  assert.equal(r.productionBackendChanges,false,'Mechanical visual redesign must not redeploy backend');
  assert.equal(r.backendDeploymentRequired,false,'Mechanical visual redesign must not require backend changes');
  assert.ok(Number.isSafeInteger(r.mechanicalVerificationRun)&&r.mechanicalVerificationRun>0,'Isolated Mechanical phone QA evidence required');
 }else{
  assert.equal(r.ownerApprovedLiveAccountantTesting,true);
  assert.ok(['Owner approved activating Accountant backend and publishing Manager Accounts for live-app testing with PROCEED.','Owner requested V393 Accounts improvements release for checking.','Owner requested publishing V394 Accounts redesign for testing.','Owner requested V395 concise Accounts Profit/Loss screen for testing.','Owner requested publishing V397 for complete Accountant Module testing.'].includes(r.authorization),'Owner release authorization required');
 }
 assert.equal(r.physicalAcceptanceStatus,'NOT_RUN','Do not claim unperformed device acceptance');
 assert.equal(typeof r.productionBackendChanges,'boolean');assert.equal(r.backendDeploymentRequired,r.productionBackendChanges,'Backend deployment flag must reflect this release');assert.equal(r.phase2ActivationApproved,false);
 assert.match(r.versionName,/^V[1-9][0-9]*$/);assert.ok(r.versionCode>299);
 assert.match(r.sourceCommit,/^[a-f0-9]{40}$/);assert.ok(!Number.isNaN(Date.parse(r.approvedAt)));
 assert.match(r.publishNonce,/^[a-f0-9]{32,}$/);
 for(const k of ['signedAcceptanceRun','verificationRun','accountantVerificationRun'])assert.ok(Number.isSafeInteger(r[k])&&r[k]>0,k+' required');
 assert.equal(r.productionBackend.project,'pjknotnjkufadqavcmii');
 for(const slug of ['staff-auth','workshop-api']){const e=r.productionBackend.functions[slug];assert.ok(e.version>0);assert.match(e.bundleSha256,/^[a-f0-9]{64}$/);assert.equal(e.verifiedFileMatch,true);}
 for(const n of ['accountant_financial_ledger','accountant_lpo_audit','accountant_append_only_grants','accountant_append_only_corrections'])assert.ok(r.productionBackend.migrations.includes(n));
 for(const k of ['credentialPreservation','qaFinancialAcceptance','serverPermissions','rollbackPrepared','legacyLoginCompatibility'])assert.equal(r.evidence[k],true,k+' not verified');
 return true;
}
if(require.main===module){const r=JSON.parse(fs.readFileSync('release-request.json','utf8'));if(!['accountant-live-test','mechanical-ui-test'].includes(r.releaseScope)||r.approvedForStaff!==true)console.log('ACCOUNTANT_PUBLICATION=false');else{validate(r,process.env.GITHUB_REF);console.log('ACCOUNTANT_PUBLICATION=true');console.log('UI_VERIFICATION_RUN='+r.verificationRun);}}
module.exports={validate};
