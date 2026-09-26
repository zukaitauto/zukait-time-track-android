import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.match(html,/data-v2-manager-spare-parts/,'Manager Spare Parts launcher marker must exist');
assert.match(html,/window\.openSparePartsModule\(\)/,'Manager Spare Parts launcher must open authoritative module');
assert.match(html,/window\.renderManager=wrapped/,'Manager launcher must survive Manager re-render');
assert.match(html,/existing\.slice\(1\)\.forEach/,'Manager launcher must deduplicate duplicate cards');
console.log('V2 Manager Spare Parts launcher guard passed');
