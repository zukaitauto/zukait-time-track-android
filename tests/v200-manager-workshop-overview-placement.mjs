import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync('app/src/main/assets/workshop_overview.js','utf8');

assert.match(src,/role\(\)==='Manager'/,'Manager must remain supported by Workshop Overview');
assert.match(src,/root\.querySelector\('\.v91-role-identity'\)/,'Manager placement must anchor to the identity row');
assert.match(src,/identity\.insertAdjacentElement\('afterend',panel\)/,'Workshop Overview must be placed after the Manager identity row');
assert.match(src,/if\(identity\?\.parentNode===root\)identity\.insertAdjacentElement\('afterend',panel\);else root\.prepend\(panel\)/,'Manager may prepend only when the identity row is unavailable');

console.log('V200 Manager Workshop Overview placement passed');
