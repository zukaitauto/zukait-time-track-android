import fs from 'node:fs';import assert from 'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const start=src.indexOf('/* V135 MODERN MANAGER MENU');
assert.ok(start>=0,'V135 Manager menu authority must exist');
const block=src.slice(start,src.indexOf('/* V136',start)>start?src.indexOf('/* V136',start):src.indexOf('/* V2',start));
assert.match(block,/Manager identity\/menu is the dashboard header and must stay above every Manager card/);
assert.match(block,/if\(root\.firstElementChild!==row\)root\.insertBefore\(row,root\.firstChild\)/);
assert.doesNotMatch(block,/root\.insertBefore\(row,perf\)/,'Manager header must never be moved below Daily Workshop Summary or other top cards');
console.log('Manager header top-position regression passed');
