import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validate}=require('../scripts/verify-pc-pages-publication.cjs');
const current=JSON.parse(fs.readFileSync('release-request.json','utf8'));
const latest=JSON.parse(fs.readFileSync('latest-version.json','utf8'));
const workflow=fs.readFileSync('.github/workflows/pages.yml','utf8');
const source={...current,approvedForStaff:true,approvedAt:'2026-10-10T06:00:00Z',
 sourceCommit:'a'.repeat(40),publishNonce:'qa-only-test-nonce',signedAcceptanceRun:12345,
 versionCode:268,versionName:'V305'};
const updater={...latest,versionCode:268,versionName:'V305'};
const branch='refs/heads/architecture-v2';
assert.equal(validate(source,updater,branch).sha,'a'.repeat(40));
for(const [name,bad,ref] of [
 ['unapproved',{...source,approvedForStaff:false},branch],
 ['unknown branch',source,'refs/heads/main'],
 ['missing approval',{...source,approvedAt:null},branch],
 ['invalid SHA',{...source,sourceCommit:'latest'},branch],
 ['short nonce',{...source,publishNonce:'x'},branch],
 ['missing signed acceptance',{...source,signedAcceptanceRun:null},branch],
 ['version mismatch',{...source,versionCode:267},branch],
 ['name mismatch',{...source,versionName:'V304'},branch]
]){
 assert.throws(()=>validate(bad,updater,ref),undefined,name);
}
assert.equal(current.approvedForStaff,false,'V305 must remain unpublished during QA');
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
verifyUpdaterAfterUiRelease(latest);
assert.match(workflow,/^\s+workflow_dispatch:\s*$/m,'Manual Pages invocation required');
assert.doesNotMatch(workflow,/^\s+push:\s*$/m,'Automatic Pages pushes prohibited');
assert.match(workflow,/scripts\/verify-pc-pages-publication\.cjs/,'Pages must run approval validation');
assert.match(workflow,/git fetch --no-tags --depth=1 origin "\$\{SOURCE_SHA\}"/,'Source pin fetch required');
assert.match(workflow,/git -c advice\.detachedHead=false checkout --detach --force "\$\{SOURCE_SHA\}"/,
 'Published contents must use exact approved source, not mutable branch HEAD');
assert.match(workflow,/git rev-parse HEAD/,'Deployment must verify checked-out SHA');
assert.match(workflow,/SOURCE_VERSION_NAME/,'APK version pin must be validated');
assert.match(workflow,/SOURCE_VERSION_CODE/,'APK code pin must be validated');
assert.doesNotMatch(workflow,/main_module\.js\\n\s+grep/,
 'Pages shell must contain a real newline; literal backslash-n breaks publication asset checks');
assert.match(workflow,/main_module\.js\n\s+grep -q 'open:render'/,
 'Both independent Parts module checks must be valid lines');
console.log('PASS: manual-only PC publication, approval denial matrix, pinned source commit and owner-approved updater gates');
