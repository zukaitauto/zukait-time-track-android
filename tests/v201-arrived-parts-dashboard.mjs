import assert from 'node:assert/strict';
import fs from 'node:fs';

const spare=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const ui=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');

assert.match(spare,/function arrivalPendingItems\(list\).*status\|\|''\)==='RECEIVED'/s,'Arrival follow-up must include only purchaser-arrived items awaiting confirmation');
assert.match(spare,/transitionItem\(listNo,itemId,'SUPERVISOR_VERIFIED'/,'Confirm Arrived must use the existing spare-parts status authority');
assert.match(spare,/Confirmed items leave this list automatically/,'Confirmation queue must explicitly clear confirmed items from the pending view');
assert.match(spare,/\['📦','Parts Arrived',arrivalPendingCount\(rows\),'ARRIVAL_CONFIRM'/,'Supervisor and Manager spare-parts dashboards must expose Parts Arrived');
assert.match(ui,/data-v201-arrived-supervisor/,'Supervisor main dashboard must have the Parts Arrived follow-up launcher');
assert.match(ui,/data-v201-arrived-manager/,'Manager Workshop Control Center must have the Parts Arrived follow-up launcher');
assert.match(ui,/Quick\\s\+\(\?:Action\|Actions\|Management\)/,'Manager legacy Quick Action removal must stay narrowly scoped');
assert.doesNotMatch(ui,/state\.assign\s*=|state\.sessions\s*=/,'V201 UI layer must not mutate job-card or session authority');

console.log('V201 arrived parts dashboard regression passed');
