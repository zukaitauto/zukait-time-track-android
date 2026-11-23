import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_OPERATIONAL_PROJECTIONS.sql','utf8');
assert.match(sql,/create unique index if not exists workshop_v2_one_active_employee_idx on public\.workshop_v2_work_sessions\(employee_id\) where status='ACTIVE'/);
const guards=(sql.match(/raise exception 'employee_already_active'/g)||[]).length;
assert.equal(guards,2,'start and resume must both enforce one active employee session');
assert.match(sql,/x\.employee_id=emp and x\.status='ACTIVE' and x\.session_id<>p_entity_id/);
console.log('V2 one-active-session server authority gate: ok');
