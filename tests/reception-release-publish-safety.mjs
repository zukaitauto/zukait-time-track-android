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
assert.match(approved,/apksigner verify/,'signed APK must verify signature');
assert.match(pages,/scripts\/verify-pc-pages-publication\.cjs/,'PC release must validate approval');
assert.match(pages,/git -c advice\.detachedHead=false checkout --detach --force/, 'PC release must publish pinned SHA');
assert.equal(release.approvedForStaff,false,'V305 must not be released during QA');
assert.equal(updater.versionName,'V304','staff updater must remain approved V304');
assert.equal(updater.versionCode,267,'V304 version code must remain 267');
console.log('PASS: Signed APK and Pages are manual-only on architecture-v2 with source/approval gates; V305 unpublished');
