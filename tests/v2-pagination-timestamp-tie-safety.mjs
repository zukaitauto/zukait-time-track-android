import fs from'node:fs';import assert from'node:assert/strict';
const hist=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
const job=fs.readFileSync('supabase/ARCHITECTURE_V2_JOBCARD_PROJECTION.sql','utf8');
const reporting=fs.readFileSync('supabase/ARCHITECTURE_V2_REPORTING.sql','utf8');
// Ordering must be deterministic when many rows share a timestamp. This is necessary for repeatable bounded reads.
// NOTE: timestamp-only continuation can still skip tied rows at a page boundary; real-backend composite-cursor qualification remains open.
assert.match(hist,/order by e\.server_time desc, e\.event_id desc/i);
assert.match(job,/order by j\.updated_at desc, j\.job_card desc/i);
assert.match(reporting,/order by e\.server_time desc, e\.event_id desc/i);
assert.match(hist,/server_time desc, event_id desc/i);
assert.match(job,/updated_at desc, job_card desc/i);
console.log('V2 deterministic timestamp-tie ordering gate: ok (composite continuation remains rollout gate)');
