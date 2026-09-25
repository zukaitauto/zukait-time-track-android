import fs from 'node:fs';import assert from 'node:assert/strict';
const v74=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
assert.match(v74,/window\.v154ApplyManagerWorkshopControl=apply/);
assert.match(v74,/new MutationObserver\(\(\)=>ensure\(\)\)\.observe\(managerRoot,\{childList:true,subtree:true\}\)/);
assert.match(v74,/priorManagerSpareRender=window\.renderManager/);
assert.match(v74,/setTimeout\(ensure,0\);return r/);
assert.match(v74,/if\(!sp\)\{sp=card\('v154-spare'\);grid\.appendChild\(sp\)\}/);
assert.match(v74,/b\.onclick=window\.v150OpenManagerSpareParts/);
console.log('Manager Spare Parts visibility lifecycle: ok');