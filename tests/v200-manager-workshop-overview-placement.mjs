import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync('app/src/main/assets/workshop_overview.js','utf8');

assert.match(src,/role\(\)==='Manager'/,'Manager must remain supported by Workshop Overview');
assert.match(src,/root\.querySelector\('\.v91-role-identity'\)/,'Manager placement must anchor to the identity row');
assert.match(src,/identity\.insertAdjacentElement\('afterend',panel\)/,'Workshop Overview must be placed after the Manager identity row');
assert.doesNotMatch(src,/role\(\)==='Manager'[^\n]{0,500}root\.prepend\(panel\)/,'Manager must not force Workshop Overview above its identity row');

console.log('V200 Manager Workshop Overview placement passed');
