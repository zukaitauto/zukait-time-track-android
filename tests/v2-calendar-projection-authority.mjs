import fs from'node:fs';import assert from'node:assert/strict';
const op=fs.readFileSync('supabase/ARCHITECTURE_V2_OPERATIONAL_PROJECTIONS.sql','utf8');
const ev=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
assert.match(op,/zukait_v2_apply_calendar_event/);assert.match(op,/PUBLIC_HOLIDAY_SET/);assert.match(op,/PUBLIC_HOLIDAY_CLEARED/);
assert.match(op,/is_public_holiday=true/);assert.match(op,/is_public_holiday=false/);assert.match(op,/zukait_v2_closed_day/);
assert.match(ev,/p_event_type in \('PUBLIC_HOLIDAY_SET','PUBLIC_HOLIDAY_CLEARED'\)/);assert.match(ev,/zukait_v2_apply_calendar_event/);
console.log('V2 public holiday projection authority gate: ok');