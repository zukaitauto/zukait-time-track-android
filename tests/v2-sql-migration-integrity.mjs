import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
assert.equal((sql.match(/create or replace function public\.zukait_v2_commit_event/g)||[]).length,1,'event commit RPC must have one definition');
assert.equal((sql.match(/\ncommit;/g)||[]).length,1,'bounded history migration must have one transaction commit');
assert.match(sql,/vehicleYear',''\) ~ '\^\[0-9\]\{4\}\$'/,'vehicle year validation regex must be complete');
assert.match(sql,/zukait_v2_apply_work_event/,'accepted work events must project transactionally');
assert.match(sql,/zukait_v2_upsert_jobcard/,'accepted job events must project transactionally');
console.log('V2 bounded history migration integrity: ok');
