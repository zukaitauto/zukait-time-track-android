'use strict';
// Separate owner-authorized Phase 1 UI publication. Never attests Phase 2 gates.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
function validate(request,ref,record) {
 assert.equal(ref,'refs/heads/architecture-v2');
 assert.equal(request.releaseScope,'phase1-compatible-ui');
 assert.equal(request.approvedForStaff,true);
 assert.equal(request.ownerRequestedImmediateRelease,true);
 assert.equal(request.backupDeferredByOwner,true);
 assert.equal(request.productionBackendChanges,false);
 assert.equal(request.phase2ActivationApproved,false);
 assert.equal(request.physicalAcceptanceStatus,'NOT_RUN');
 assert.equal(request.versionName,'V305');
 assert.equal(request.versionCode,268);
 assert.match(request.sourceCommit,/^[a-f0-9]{40}$/);
 assert.ok(Number.isSafeInteger(request.signedAcceptanceRun)&&request.signedAcceptanceRun>0);
 assert.ok(Number.isSafeInteger(request.verificationRun)&&request.verificationRun>0);
 assert.ok(!Number.isNaN(Date.parse(request.approvedAt)));
 assert.ok(request.publishNonce.length>=12);
 for(const check of Object.values(record.checks)) assert.equal(check.passed,false,'Unperformed Phase 2 gates must remain false');
 return true;
}
if(require.main===module) {
 const file='release-ui-request.json';
 if(!fs.existsSync(file)||JSON.parse(fs.readFileSync(file,'utf8')).approvedForStaff!==true) {
  console.log('UI_ONLY_PUBLICATION=false');
 } else {
  const request=JSON.parse(fs.readFileSync(file,'utf8'));
  validate(request,process.env.GITHUB_REF,JSON.parse(fs.readFileSync('docs/INSURANCE_V305_ACCEPTANCE_GATE.json','utf8')));
  const src=execFileSync('git',['show',request.sourceCommit+':app/src/main/assets/v2/features/insurance/reception.js'],{encoding:'utf8'});
  assert.ok(src.includes('async function supportsPhase2()')&&src.includes('if (!phase2 && kind !== "INSURANCE")')&&src.includes('if (!phase2Enabled &&'),'Pinned source must retain Phase 1 fail-closed controls');
  fs.writeFileSync('release-request.json',JSON.stringify(request,null,2)+'\n');
  console.log('UI_ONLY_PUBLICATION=true');
  console.log('UI_VERIFICATION_RUN='+request.verificationRun);
 }
}
module.exports={validate};
