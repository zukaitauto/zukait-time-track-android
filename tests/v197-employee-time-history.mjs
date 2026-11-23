import fs from 'node:fs';import assert from 'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.match(src,/function sessionsForAssignment\(a\)/,'assignment-aware session history authority must exist');
assert.match(src,/String\(s\.assignmentId\|\|''\)===String\(a\.id\|\|''\)/,'current assignment must retain all exact session records across pause/resume');
assert.match(src,/const legacy=rows\.filter\(s=>!s\.assignmentId\)/,'legacy session history must be considered');
assert.match(src,/owners\.length===1\?\[\.\.\.exact,\.\.\.legacy\]:exact/,'legacy time must be retained only when assignment ownership is unambiguous');
assert.match(src,/function totalForAssignment\(a\)\{return sessionsForAssignment\(a\)\.reduce/,'all dashboards must total the preserved assignment session history');
console.log('Employee assignment time-history regression passed');
