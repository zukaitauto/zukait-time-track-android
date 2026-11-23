import fs from'node:fs';import assert from'node:assert/strict';
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_OPERATIONAL_PROJECTIONS.sql','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
// New normal assignment must stop an employee's active ID001 before assigning productive work.
assert.match(sql,/create or replace function public\.zukait_v2_apply_assignment_event/i);
assert.match(sql,/where x\.employee_id=emp and x\.status='ACTIVE' and x\.kind='ID001'/i);
assert.match(sql,/status='STOPPED'/i);
// Starting normal WORK on another device must also close ID001 first, then enforce one active session.
assert.match(sql,/if p_event_type='WORK_START' then[\s\S]*where x\.employee_id=emp and x\.status='ACTIVE' and x\.kind='ID001' and x\.session_id<>p_entity_id/i);
assert.match(sql,/if exists\(select 1 from public\.workshop_v2_work_sessions x where x\.employee_id=emp and x\.status='ACTIVE' and x\.session_id<>p_entity_id\) then raise exception 'employee_already_active'/i);
// ID001 cannot masquerade as normal work, cannot pause, and cannot start outside duty/leave rules.
assert.match(sql,/p_event_type='ID001_START' and job<>'ID001'/i);
assert.match(sql,/p_event_type='WORK_START' and job='ID001'/i);
assert.match(sql,/p_event_type='WORK_PAUSE' and cur\.kind='ID001'/i);
assert.match(sql,/raise exception 'id001_outside_duty'/i);
assert.match(sql,/raise exception 'employee_on_leave'/i);
// Stale device actions remain explicit conflicts rather than silently restoring ID001.
assert.match(sql,/raise exception 'stale_work_revision'/i);
assert.match(api,/code:"stale_work_revision"/);
assert.match(api,/code:"employee_already_active"/);
console.log('V2 ID001/normal-job cross-device race gate: ok');
