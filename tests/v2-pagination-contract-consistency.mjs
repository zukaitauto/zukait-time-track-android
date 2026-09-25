import fs from'node:fs';import assert from'node:assert/strict';
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const hist=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
const job=fs.readFileSync('supabase/ARCHITECTURE_V2_JOBCARD_PROJECTION.sql','utf8');
const op=fs.readFileSync('supabase/ARCHITECTURE_V2_OPERATIONAL_PROJECTIONS.sql','utf8');
const reporting=fs.readFileSync('supabase/ARCHITECTURE_V2_REPORTING.sql','utf8');
// All public V2 list paths must be bounded.
for(const s of [hist,job,op,reporting])assert.match(s,/limit greatest\(1,least\(coalesce\(p_limit,100\),500\)\)/i);
// API must clamp hostile/oversized page requests too.
assert.match(api,/Math\.max\(1, Math\.min\(Number\.isFinite\(requested\) \? requested : 100, 500\)\)/);
assert.match(api,/Math\.max\(1, Math\.min\(Number\.isFinite\(requested\) \? requested : 100, 500\)\)/g);
// Event history cursor uses the same ordered field consumed by the SQL before predicate.
assert.match(hist,/p_before is null or e\.server_time < p_before or \(e\.server_time = p_before and p_before_id is not null and e\.event_id < p_before_id\)/i);
assert.match(hist,/order by e\.server_time desc, e\.event_id desc/i);
assert.match(api,/last\?\.server_time && last\?\.event_id/);
// Job/WIP cursors use updated_at and generic report cursor uses sort_time with updated_at fallback.
assert.match(job,/p_before is null or j\.updated_at<p_before or \(j\.updated_at=p_before and p_before_id is not null and j\.job_card<p_before_id\)/i);
assert.match(api,/cursorValue = action === "v2_search_jobcards" \|\| report === "WIP" \|\| report === "COMPLETION_TARGET"/);
assert.match(api,/rows\[rows\.length - 1\]\?\.sort_time \|\| rows\[rows\.length - 1\]\?\.updated_at/);
// A short final page must terminate pagination rather than emit another cursor.
assert.match(api,/rows\.length === limit[\s\S]*next_cursor/s);
console.log('V2 pagination contract consistency gate: ok');
