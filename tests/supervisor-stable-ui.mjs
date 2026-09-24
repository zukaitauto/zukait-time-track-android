import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const stable=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8');

assert.match(stable,/V143 SUPERVISOR STABLE AUTHORITY/,'final Supervisor authority marker must exist');
assert.ok(html.includes('<script src="v74_updates.js?v=142"></script>'),'legacy update bundle must still load for shared helpers');
assert.ok(html.includes('<script src="supervisor_stable.js?v=143"></script>'),'stable Supervisor authority must be shipped');
assert.ok(html.indexOf('supervisor_stable.js?v=143')>html.indexOf('v74_updates.js?v=142'),'stable Supervisor authority must load after all legacy Supervisor decorators');

assert.match(stable,/window\.renderSupervisor=renderStable/,'stable authority must own renderSupervisor');
assert.match(stable,/window\.render=function\(\)\{if\(role\(\)==='Supervisor'\)return renderStable\(\);return typeof prior==='function'\?prior\.apply/,'Supervisor render must bypass legacy render chain while non-Supervisor roles retain it');
assert.doesNotMatch(stable,/MutationObserver/,'stable Supervisor authority must not use DOM observers');
assert.doesNotMatch(stable,/setTimeout\(apply/,'stable Supervisor authority must not use post-render layout decorators');

assert.match(stable,/class="v143-two"/,'stable UI must use deterministic two-column rows');
assert.match(stable,/AVAILABLE WORKERS/,'Available Workers card must remain');
assert.match(stable,/id="supervisorConsumablesTile"/,'Consumables must occupy the paired Supervisor resource slot');
assert.match(stable,/Today at a Glance/,'Today at a Glance must remain');
assert.match(stable,/Technician Board/,'Technician Board must remain');
assert.match(stable,/ASSIGN ID001/,'standalone ID001 assignment must remain');
assert.match(stable,/VIEW · FILTER · PRINT/,'ID001 report must remain');
assert.match(stable,/Additional Action History/,'Additional Action History must remain');
assert.match(stable,/Job Card List/,'Job Card List must remain');
assert.match(stable,/Assigned Job Cards/,'Assigned Job Cards must remain');
assert.match(stable,/Additional Time/,'Additional Time must remain');
assert.match(stable,/Incentive/,'Incentive must remain');

assert.match(stable,/grid-template-areas:"job tech" "time assign"/,'Assign\/Update must preserve the agreed 2x2 layout');
assert.match(stable,/id="v143JobSearch"/,'visible Job Card search must be part of final Supervisor renderer');
assert.match(stable,/id="sj" class="v143-internal"/,'legacy #sj handoff must remain hidden for assignment compatibility');
assert.match(stable,/\[j\.no,j\.reg,j\.vehicle,j\.year,j\.brand,j\.make,j\.model\]/,'search must cover JC, registration, vehicle, year, brand, make and model');
assert.match(stable,/String\(j\.no\)\.trim\(\)\.toUpperCase\(\)!==H/,'ID001 must be excluded from normal Job Card search');
assert.match(stable,/sel\.value=no/,'selecting a result must write the selected Job Card to #sj');
assert.match(stable,/Search and select a valid Job Card first\./,'invalid free text must not assign a stale Job Card');
assert.match(stable,/window\.assignJobCore\(no,emp,mins\)/,'selected Job Card must reach the existing assignment core');

assert.match(stable,/v65OpenAccount\(\)/,'Supervisor menu must remain available');
assert.match(stable,/v92OpenAvailableWorkers\(\)/,'Available Workers popup must remain wired');
assert.match(stable,/openConsumablesModule\(\)/,'Supervisor Consumables must open the real module');
assert.match(stable,/v84OpenDept/,'Technician Board departments must remain clickable');

console.log('Stable Supervisor UI tests passed: single final renderer, no legacy layout chain, fixed two-column surface, working search handoff and preserved controls');
