import fs from 'node:fs';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../app/src/main/assets/v74_updates.js',import.meta.url),'utf8');
const start=src.indexOf('/* V107 INCENTIVE FINAL AUTHORITY');
const end=src.indexOf('/* V108 retired',start);
assert.ok(start>=0&&end>start,'V107 final authority missing');
const v107=src.slice(start,end);
assert.match(v107,/if\(a\.job===HOLD\)return \{achieved:current,excess:0,actual:current,id001:current\}/,'ID001 normal-duty minutes must count as Achieved exactly once');
assert.doesNotMatch(v107,/if\(a\.job===HOLD\)return \{achieved:0/,'ID001 must not be zeroed from Achieved');
assert.match(v107,/const incentive=Math\.max\(0,achieved-t\.target-repeat\)/,'final incentive formula must remain Achieved - Target - Repeat');

assert.match(src,/a\.job==='ID001'\?Math\.max\(0,normal\)/,'Employee achieved-details fallback must show ID001 normal-duty time as Achieved');
const cost=fs.readFileSync(new URL('../app/src/main/assets/job_cost_summary_v128.js',import.meta.url),'utf8');
assert.match(cost,/!s\.preliminaryLinkedJob/,'normal JC labour must exclude separately classified preliminary sessions');
console.log('ID001 achieved classification tests passed');
