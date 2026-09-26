import fs from 'node:fs';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../app/src/main/assets/offline_test.html',import.meta.url),'utf8');
assert.match(src,/effectiveJob=s=>String\(s\?\.preliminaryLinkedJob\|\|s\?\.job\|\|''\)/,'effective job must prefer linked JC');
assert.match(src,/sessionHold=s=>effectiveJob\(s\)===HOLD/,'ID001 classification must use effective job');
assert.match(src,/rows\.some\(r=>r\.job===effectiveJob\(s\)&&r\.emp===s\.emp\)/,'completed efficiency must classify transferred time under JC');
assert.match(src,/filter\(s=>effectiveJob\(s\)===no&&s\.emp===emp\)/,'job totals must use effective JC');
assert.doesNotMatch(src,/ids\.has\(a\.id\)\|\|rows\.some\(r=>r\.job===a\.job&&r\.emp===a\.emp\)/,'completed calculation must not classify linked session by original ID001 assignment');
console.log('ID001 effective job classification tests passed');
