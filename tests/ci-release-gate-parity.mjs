import fs from 'node:fs';
import assert from 'node:assert/strict';

const build=fs.readFileSync('.github/workflows/build-apk.yml','utf8');
const publish=fs.readFileSync('.github/workflows/publish-approved-release.yml','utf8');

for (const script of [
  'scripts/ci-validate-js.sh',
  'scripts/ci-full-regression.sh',
  'scripts/ci-check-production-assets.sh'
]) {
  assert.ok(build.includes(`bash ${script}`), `normal Android build must call ${script}`);
  assert.ok(publish.includes(`bash ${script}`), `signed release must call ${script}`);
}

assert.ok(fs.existsSync('scripts/ci-validate-js.sh'),'shared JavaScript validation script must exist');
assert.ok(fs.existsSync('scripts/ci-full-regression.sh'),'shared full regression script must exist');
assert.ok(fs.existsSync('scripts/ci-check-production-assets.sh'),'shared production asset check script must exist');

console.log('Normal build and signed release use identical validation/regression/asset gates: ok');
