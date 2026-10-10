import fs from 'node:fs';
import assert from 'node:assert/strict';

const approved = fs.readFileSync('.github/workflows/publish-approved-release.yml','utf8');
const pages = fs.readFileSync('.github/workflows/pages.yml','utf8');
const release = JSON.parse(fs.readFileSync('release-request.json','utf8'));
const updater = JSON.parse(fs.readFileSync('latest-version.json','utf8'));

for (const [name, workflow] of [['signed APK',approved],['PC Pages',pages]]) {
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
assert.equal(release.approvedForStaff,false,'V305 must not be released during QA');
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
 assert.equal(metadata.releaseTag,'release-V305-architecture-v2');
}
verifyUpdaterAfterUiRelease(updater);
console.log('PASS: Signed APK and Pages are manual-only on architecture-v2 with source/approval gates; explicit UI approval required');
