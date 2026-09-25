import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const events=fs.readFileSync('app/src/main/assets/v2/core/event_contract.js','utf8');
const live=fs.readFileSync('app/src/main/assets/v2/core/live_selectors.js','utf8');

assert.match(html,/v2\/core\/event_contract\.js/,'V2 event contract must load');
assert.match(html,/v2\/core\/live_selectors\.js/,'V2 live selectors must load');
assert.match(events,/eventId/,'event envelope requires an idempotency key');
assert.match(events,/serverRevision/,'event envelope carries authoritative revision');
assert.match(events,/syncState/,'event envelope carries synchronization state');
assert.match(events,/function dedupe\(events\)/,'event contract must deduplicate replay');
assert.match(live,/zukaitServerLive/,'live selector must prefer server authority');
assert.doesNotMatch(events,/setInterval|MutationObserver/,'core event contract must not create timers or DOM observers');
assert.doesNotMatch(live,/setInterval|MutationObserver/,'live selector must not create timers or DOM observers');

const legacyFiles=['app/src/main/assets/v54_improvements.js','app/src/main/assets/v63_updates.js','app/src/main/assets/v65_updates.js','app/src/main/assets/v66_updates.js','app/src/main/assets/v67_updates.js','app/src/main/assets/v68_updates.js','app/src/main/assets/v69_updates.js','app/src/main/assets/v74_updates.js'];
for(const file of legacyFiles) assert.ok(fs.existsSync(file),file+' remains available during parity migration');

console.log('Architecture V2 foundation checks passed');
