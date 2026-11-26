import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const start = api.indexOf('async function loadAuthoritativeLiveStatus()');
const end = api.indexOf('\n\nfunction employeeTimeTransition', start);
assert.ok(start >= 0 && end > start, 'authoritative projection loader must exist');
const loader = api.slice(start, end);

// Do not loosen API revision validation before the atomic SQL writer is migrated.
// Otherwise unchanged older per-employee revisions can hide stale/corrupt rows.
assert.match(loader, /ZUKAIT_LIVE_STATUS_SELECTIVE_REVISION/);
assert.match(loader, /selectiveRevision \? \{\} : \{state_revision:/);
assert.match(loader, /rowRevision < 1 \|\| rowRevision > Number\(e.state_revision\)/);
assert.match(loader, /Number\(currentRow.state_revision\)>revision/);
assert.match(loader, /const stale = !matches\(rows,expected\)/);
assert.match(loader, /const changedRows = expected\.filter/);
assert.match(loader, /\.upsert\(changedRows,\{onConflict:"employee_id"\}\)/);
assert.match(loader, /if \(changedRows\.length\)/);
assert.match(loader, /if \(staleIds\.length\)/);
assert.match(loader, /if\(!stale&&Number\.isSafeInteger\(revision\)/);
assert.match(api, /zukait_commit_workshop_employee_time_sections/);
console.log('PASS: API keeps strict revision checks by default; selective per-employee revisions require explicit opt-in.');
