import fs from 'node:fs';
import assert from 'node:assert/strict';

const approved = fs.readFileSync('.github/workflows/publish-approved-release.yml','utf8');
const pages = fs.readFileSync('.github/workflows/pages.yml','utf8');
const release = JSON.parse(fs.readFileSync('release-request.json','utf8'));
const updater = JSON.parse(fs.readFileSync('latest-version.json','utf8'));

for (const [name, workflow] of [['signed APK',approved],['PC Pages',pages],['Reception preview',fs.readFileSync('.github/workflows/reception-web-preview-only.yml','utf8')]]) {
 assert.match(workflow,/^on:\s*\n(?:[\s\S]*?)\s+workflow_dispatch:/m,name+' must support explicit dispatch');
 assert.doesNotMatch(workflow,/^\s+push:\s*$/m,name+' cannot publish from Git push');
 assert.match(workflow,/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/architecture-v2'/,name+' must refuse main and other branches');
}
assert.match(approved,/release-request\.json is not approved/,'signed APK must require staff approval');
assert.match(approved,/git merge-base --is-ancestor/,'signed APK must verify source ancestry');
assert.match(approved,/Production source drift detected/,'signed APK must reject unauthorized drift');
assert.match(approved, /'\:\(exclude\)docs\/INSURANCE_V305_ACCEPTANCE_GATE\.json'/,
 'Acceptance records may be attested after application source is frozen');
assert.doesNotMatch(approved, /'\:\(exclude\)app\/src\/main\/assets/,
 'Application assets must not be excluded from signed source drift protection');
assert.match(approved,/apksigner["']? verify/,'signed APK must verify signature');
assert.match(pages,/scripts\/verify-pc-pages-publication\.cjs/,'PC release must validate approval');
assert.match(pages,/git -c advice\.detachedHead=false checkout --detach --force/, 'PC release must publish pinned SHA');
assert.equal(typeof release.approvedForStaff,'boolean','Release approval must be explicit');
if (release.approvedForStaff) {
 assert.match(release.sourceCommit || '',/^[a-f0-9]{40}$/,'Approved source must be immutable');
 assert.ok(Number.isSafeInteger(release.signedAcceptanceRun)&&release.signedAcceptanceRun>0,'Signed candidate required');
 assert.ok(!Number.isNaN(Date.parse(release.approvedAt)),'Approval date required');
}
const uiApproval = fs.existsSync('release-ui-request.json') ? JSON.parse(fs.readFileSync('release-ui-request.json','utf8')) : null;
function verifyUpdaterAfterUiRelease(metadata) {
 if (metadata.versionName === 'V304') { assert.equal(metadata.versionCode,267); return; }
 assert.ok(uiApproval?.approvedForStaff, 'Published V305 requires explicit owner UI approval');
 assert.equal(uiApproval.releaseScope,'phase1-compatible-ui');
 assert.equal(uiApproval.productionBackendChanges,false);
 assert.equal(uiApproval.phase2ActivationApproved,false);
 assert.equal(uiApproval.physicalAcceptanceStatus,'NOT_RUN');
 assert.equal(metadata.versionName,uiApproval.versionName);
 assert.equal(metadata.versionCode,uiApproval.versionCode);
 assert.equal(metadata.sourceCommit,uiApproval.sourceCommit);
 assert.match(metadata.apkSha256,/^[a-f0-9]{64}$/);
 assert.equal(metadata.releaseTag,'release-'+metadata.versionName+'-architecture-v2');
}
if (updater.versionCode < release.versionCode) {
 // A pending new release must not overwrite the last published updater.
 assert.equal(updater.status,'current');
 assert.match(updater.versionName,/^V[1-9][0-9]*$/);
 assert.match(updater.sourceCommit,/^[a-f0-9]{40}$/);
 assert.match(updater.apkSha256,/^[a-f0-9]{64}$/);
 assert.equal(updater.releaseTag,'release-'+updater.versionName+'-architecture-v2');
 if(!['reception-insurance-features-1-10','accountant-live-test'].includes(release.releaseScope)) assert.equal(uiApproval?.versionName,release.versionName,'Pending UI and APK release versions must match');
 if(!['reception-insurance-features-1-10','accountant-live-test'].includes(release.releaseScope)) assert.equal(uiApproval?.versionCode,release.versionCode);
} else if(['reception-insurance-features-1-10','accountant-live-test'].includes(release.releaseScope)) { assert.equal(updater.sourceCommit,release.sourceCommit); assert.equal(updater.versionCode,release.versionCode); assert.match(updater.apkSha256,/^[a-f0-9]{64}$/); } else verifyUpdaterAfterUiRelease(updater);
console.log('PASS: Signed APK and Pages are manual-only on architecture-v2 with source/approval gates; explicit UI approval required');
