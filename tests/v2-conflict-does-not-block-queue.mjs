import fs from'node:fs';import assert from'node:assert/strict';
const cloud=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const start=cloud.indexOf('async function flushV2EventQueue');
assert.ok(start>=0,'V2 queue flusher required');
const end=cloud.indexOf('\n  }',start);const block=cloud.slice(start,end+4);
assert.match(block,/for\(const event of q\.pending\(\)\)/);
assert.match(block,/NETWORK.*TIMEOUT.*NO_SESSION/s);
assert.match(block,/q\.markConflict\(event\.eventId/);
// Transient transport failures may stop a flush; domain conflicts must be quarantined and iteration must continue.
const conflict=block.indexOf('q.markConflict(event.eventId');
assert.ok(conflict>=0);
const after=block.slice(conflict);
assert.doesNotMatch(after.split('}')[0],/break\s*;/,'domain conflict must not block later independent events');
console.log('V2 conflict queue continuation gate: ok');
