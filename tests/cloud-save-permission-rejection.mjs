import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const section = source.slice(source.indexOf("async function push(retry=0)"), source.indexOf("window.cloudScheduleSave="));
assert.ok(section.length > 1000, 'cloud push implementation should exist');
assert.match(section, /if\(r\._status===403\)\s*\{[\s\S]*?e\.httpStatus=403;/, 'HTTP 403 must be classified separately');
assert.match(section, /const permissionDenied=e\?\.httpStatus===403[;,]/, 'catch must identify denied saves');
assert.match(section, /PERMISSION DENIED — CHANGE PRESERVED/, 'denied saves must show a clear status');
assert.match(section, /if\(!(?:permissionDenied|blocked)&&navigator\.onLine&&sessionToken\(\)\)/, 'denied saves must not schedule retries');
if (/if\(!blocked&&navigator\.onLine/.test(section)) {
  assert.match(section, /blocked=permissionDenied\|\|assignmentConflict/, 'combined retry barrier must still include denied saves');
}
assert.match(section, /localStorage\.setItem\(PENDING_KEY,JSON\.stringify\(/, 'denied saves must preserve the pending snapshot');
console.log('PASS: 403 save errors are labeled correctly, retained locally, and not scheduled for automatic retry.');

