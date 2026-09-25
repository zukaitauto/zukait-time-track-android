import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const voice=fs.readFileSync('app/src/main/assets/voice_quick_entry_intelligent.js','utf8');
assert.match(html,/supervisor_stable\.js\?v=143[\s\S]*voice_quick_entry_intelligent\.js\?v=157/);
assert.match(voice,/window\.v143ApplyVoiceEntry=function/);
assert.match(voice,/window\.zukaitVoiceQuickEntryParse=parse/);
assert.match(voice,/Review before Create Job \+ Assign/);
assert.doesNotMatch(voice,/\.click\(\)|createJob|assignJob/i);
console.log('Intelligent voice Quick Entry wiring and confirmation boundary: ok');