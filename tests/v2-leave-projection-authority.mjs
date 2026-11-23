import fs from'node:fs';import assert from'node:assert/strict';
const op=fs.readFileSync('supabase/ARCHITECTURE_V2_OPERATIONAL_PROJECTIONS.sql','utf8');
const ev=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
assert.match(op,/zukait_v2_apply_leave_event/);assert.match(op,/LEAVE_CREATED/);assert.match(op,/LEAVE_UPDATED/);assert.match(op,/LEAVE_CANCELLED/);
assert.match(op,/leave_closed_day/);assert.match(op,/leave_overlap/);assert.match(op,/period='FULL' or per='FULL' or l\.period=per/);
assert.match(ev,/p_event_type in \('LEAVE_CREATED','LEAVE_UPDATED','LEAVE_CANCELLED'\)/);assert.match(ev,/zukait_v2_apply_leave_event/);
console.log('V2 leave projection authority gate: ok');