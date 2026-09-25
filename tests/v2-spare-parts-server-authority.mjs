import fs from'node:fs';import assert from'node:assert/strict';
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
const report=fs.readFileSync('supabase/ARCHITECTURE_V2_REPORTING.sql','utf8');
assert.match(sql,/p_event_type like 'SPARE_PART%'/);
assert.match(sql,/raise exception 'invalid_spare_part_event'/);
assert.match(sql,/p_event_type='SPARE_PART_STATUS_CHANGED'/);
assert.match(sql,/raise exception 'invalid_spare_part_transition'/);
assert.match(report,/q\.report='PARTS_DELAY'.*e\.event_type like 'SPARE_PART%'/s);
console.log('V2 spare-parts server event authority gate: ok');