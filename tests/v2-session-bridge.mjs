import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
assert.match(html,/me=found;window\.me=me;window\.currentUser=me;/,'login must publish authenticated user to external V2 scripts');
assert.match(html,/me=null;window\.me=null;window\.currentUser=null;/,'logout must clear V2 session bridge');
const mod=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
assert.match(mod,/window\.me\|\|window\.currentUser/,'Spare Parts must consume shared authenticated session');
console.log('V2 session bridge guard passed');