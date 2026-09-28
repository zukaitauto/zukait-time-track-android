import fs from 'node:fs';import assert from 'node:assert/strict';
const v74=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
assert.match(v74,/window\.v154ApplyManagerWorkshopControl=apply/);
assert.match(v74,/if\(!sp\)\{sp=card\('v154-spare'\);grid\.appendChild\(sp\)\}/);
assert.match(v74,/b\.onclick=window\.v150OpenManagerSpareParts/);
assert.doesNotMatch(v74,/new MutationObserver\(\(\)=>ensure\(\)\)\.observe\(managerRoot/,'Manager dashboard must not use a mutation observer to re-add Spare Parts');
assert.doesNotMatch(v74,/priorManagerSpareRender=window\.renderManager/,'Manager Spare Parts must rely on the final settle authority, not another render wrapper');
assert.match(v74,/window\.v156ManagerSparePartsInvariant/,'final Manager UI authority must verify Spare Parts after each Manager render');
console.log('Manager Spare Parts final-settle visibility lifecycle: ok');
