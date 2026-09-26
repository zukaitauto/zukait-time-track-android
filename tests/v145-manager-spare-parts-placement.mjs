import fs from'node:fs';import assert from'node:assert/strict';
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.match(html,/querySelector\('\.v67-control-grid,\.v66-control-grid,\.v65-control-grid'\)/,'Spare Parts must target Workshop Control grid');
assert.match(html,/const fifthRowStart=8/,'2-column Workshop Control fifth row must start at zero-based position 8');
assert.match(html,/grid\.insertBefore\(b,children\[fifthRowStart\]\)/,'Spare Parts must be inserted at fifth-row start when later cards exist');
assert.match(html,/data-v2-manager-spare-parts/);
assert.match(html,/existing\.slice\(1\)\.forEach\(x=>x\.remove\(\)/,'duplicate Manager Spare Parts launchers must be removed');
assert.match(html,/openSparePartsModule/,'Manager launcher must open authoritative Spare Parts module');
console.log('V145 Manager Spare Parts fifth-row placement guard passed');