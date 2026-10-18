'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
function validate(r,ref){
 assert.equal(ref,'refs/heads/architecture-v2','Accountant release must use architecture-v2');
 assert.equal(r.releaseScope,'accountant-live-test');assert.equal(r.approvedForStaff,true);
 assert.equal(r.ownerApprovedLiveAccountantTesting,true);assert.equal(r.authorization,'Owner approved activating Accountant backend and publishing Manager Accounts for live-app testing with PROCEED.');
 assert.equal(r.physicalAcceptanceStatus,'NOT_RUN','Do not claim unperformed device acceptance');
 assert.equal(r.productionBackendChanges,true);assert.equal(r.phase2ActivationApproved,false);
 assert.match(r.versionName,/^V[1-9][0-9]*$/);assert.ok(r.versionCode>299);
 assert.match(r.sourceCommit,/^[a-f0-9]{40}$/);assert.ok(!Number.isNaN(Date.parse(r.approvedAt)));
 assert.match(r.publishNonce,/^[a-f0-9]{32,}$/);
 for(const k of ['signedAcceptanceRun','verificationRun','accountantVerificationRun'])assert.ok(Number.isSafeInteger(r[k])&&r[k]>0,k+' required');
 assert.equal(r.productionBackend.project,'pjknotnjkufadqavcmii');
 for(const slug of ['staff-auth','workshop-api']){const e=r.productionBackend.functions[slug];assert.ok(e.version>0);assert.match(e.bundleSha256,/^[a-f0-9]{64}$/);assert.equal(e.verifiedFileMatch,true);}
 for(const n of ['accountant_financial_ledger','accountant_lpo_audit'])assert.ok(r.productionBackend.migrations.includes(n));
 for(const k of ['credentialPreservation','qaFinancialAcceptance','serverPermissions','rollbackPrepared','legacyLoginCompatibility'])assert.equal(r.evidence[k],true,k+' not verified');
 return true;
}
if(require.main===module){const r=JSON.parse(fs.readFileSync('release-request.json','utf8'));if(r.releaseScope!=='accountant-live-test')console.log('ACCOUNTANT_PUBLICATION=false');else{validate(r,process.env.GITHUB_REF);console.log('ACCOUNTANT_PUBLICATION=true');console.log('UI_VERIFICATION_RUN='+r.verificationRun);}}
module.exports={validate};
