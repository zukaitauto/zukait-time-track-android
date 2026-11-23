import assert from 'node:assert/strict';
import fs from 'node:fs';

const overview=fs.readFileSync('app/src/main/assets/workshop_overview.js','utf8');
const spare=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');

assert.match(overview,/\['Parts Pending',s\.partsPending,'parts-pending',/,'Daily Workshop Summary must label the outstanding-parts card Parts Pending');
assert.doesNotMatch(overview,/\['Parts awaiting arrival'/,'Old duplicate Parts awaiting arrival label must be removed');
assert.match(overview,/a==='parts-pending'\)parts\(\)\?\.openPartsPending\?\.\(\)/,'Parts Pending card must open the authoritative pending-parts list');
assert.match(spare,/const pending=pendingSummary\(rows\)\.parts;return \{attention,waiting,pending,/,'Workshop summary must receive the exact individual pending-parts count');
assert.match(overview,/button\('Delivered · pending parts · '\+\(s\.deliveredPending\?\?'Not loaded'\),'pending'\)/,'Delivered-vehicle pending-parts workflow must remain separately accessible below the quick-view cards');

console.log('V202 Parts Pending daily summary regression passed');
