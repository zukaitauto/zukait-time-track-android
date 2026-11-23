import fs from 'node:fs';import assert from 'node:assert/strict';
const sup=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8');
const v74=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
assert.doesNotMatch(sup,/v143OpenSpareParts=function\(\)\{alert\('Spare Parts — Coming Soon'\)/);
assert.match(sup,/v143OpenSpareParts=function\(\)\{if\(window\.zukaitV2\?\.sparePartsMain\?\.open\)/);
assert.match(v74,/v150OpenManagerSpareParts=.*zukaitV2\?\.sparePartsMain\?\.open/);
assert.match(v74,/if\(Number\(latestCode\)<=current\)\{\s*if\(nv\)nv\.textContent=currentVersion\(\)\|\|'—'/);

const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.match(sup,/id="supervisorSparePartsTile"/,'Supervisor dashboard must render a dedicated Spare Parts tile');
assert.match(sup,/@media\(min-width:800px\)/,'Supervisor web dashboard must include desktop-specific readability rules');
assert.match(html,/supervisor_stable\.js\?v=164/,'Web must cache-bust the current Supervisor renderer');
assert.match(html,/v2\/features\/spare-parts\/main_module\.js\?v=164/,'Web must cache-bust the current Spare Parts module');
const main=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
assert.match(main,/v2-sp-modal-host/,'Spare Parts web modal must use desktop-width styling');
assert.match(main,/renderSupervisorDashboard[\s\S]*markSparePartsModal\(\)/,'Supervisor Spare Parts dashboard must activate the web modal layout');
console.log('V2 Spare Parts launchers, web cache and desktop UI guard: ok');
