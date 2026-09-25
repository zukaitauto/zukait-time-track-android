import fs from 'node:fs';import assert from 'node:assert/strict';
const sup=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8');
const v74=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
assert.doesNotMatch(sup,/v143OpenSpareParts=function\(\)\{alert\('Spare Parts — Coming Soon'\)/);
assert.match(sup,/v143OpenSpareParts=function\(\)\{if\(window\.zukaitV2\?\.sparePartsMain\?\.open\)/);
assert.match(v74,/v150OpenManagerSpareParts=.*zukaitV2\?\.sparePartsMain\?\.open/);
assert.match(v74,/if\(Number\(latestCode\)<=current\)\{\s*if\(nv\)nv\.textContent=currentVersion\(\)\|\|'—'/);
console.log('V2 Spare Parts launchers and updater downgrade guard: ok');
