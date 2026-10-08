import fs from 'node:fs';import assert from 'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
assert.match(src,/AS=s=>\{if\(!s\)return null;const rows=\(state\.assign\|\|\[\]\)\.filter\(a=>a&&a\.job===s\.job&&a\.emp===s\.emp&&!a\.cancelled\)/,'Finish assignment resolver must stay scoped to the active employee and Job Card');
assert.match(src,/rows\.filter\(a=>!a\.completed\).*\|\|rows\.sort/s,'Migrated active sessions without assignmentId must recover their latest matching assignment even if stale state marked it completed');
assert.match(src,/No active work session was found\. Sync and try again\./,'Finish must not silently fail when the active session is missing');
assert.match(src,/This running work could not be matched to its assignment/,'Finish must visibly report an unrecoverable assignment mismatch');
assert.match(src,/s\.end=t;s\.finished=true;s\.paused=false;(?:s\.(?:finishDeviceTime=t|v79Integrity=true);)?a\.completed=true;a\.completedAt=t/,'Successful Finish must close the session and complete the assignment together');
console.log('Employee Finish recovery regression: ok');
