import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow=fs.readFileSync('.github/workflows/publish-approved-release.yml','utf8');

assert.match(workflow,/releases\/latest/,'release workflow must verify the repository-wide latest pointer');
assert.match(workflow,/LATEST_ID=.*jq -r '\.id \/\/ empty'/,'release workflow must read the latest release id');
assert.match(workflow,/make_latest=false/,'release workflow must be able to clear a stale pinned latest release');
assert.match(workflow,/Latest release pointer is stale/,'release workflow must log stale latest-pointer repair');
assert.match(workflow,/test "\$LATEST_ID" = "\$RELEASE_ID"/,'release workflow must fail when latest id is still wrong');
assert.match(workflow,/test "\$LATEST_TAG" = "\$EXPECTED_TAG"/,'release workflow must verify the latest tag as well as id');
assert.match(workflow,/ZUKAIT_TIME_TRACK_LATEST\.apk/,'release workflow must verify the signed APK asset remains attached');
console.log('Release latest-pointer verification and stale-pin repair guards: ok');
