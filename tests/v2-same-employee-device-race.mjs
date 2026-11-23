import fs from'node:fs';import assert from'node:assert/strict';
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_OPERATIONAL_PROJECTIONS.sql','utf8');
const eventSql=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const queue=fs.readFileSync('app/src/main/assets/v2/core/offline_queue.js','utf8');
// Two devices for one employee must converge through server projection authority, never client timestamp preference.
assert.match(sql,/select \* into cur from public\.workshop_v2_work_sessions where session_id=p_entity_id for update/i);
assert.match(sql,/create unique index if not exists workshop_v2_one_active_employee_idx on public\.workshop_v2_work_sessions\(employee_id\) where status='ACTIVE'/i);
assert.match(sql,/if exists\(select 1 from public\.workshop_v2_work_sessions x where x\.employee_id=emp and x\.status='ACTIVE' and x\.session_id<>p_entity_id\) then raise exception 'employee_already_active'/i);
assert.match(sql,/if found and coalesce\(p_revision,0\)<=cur\.revision then raise exception 'stale_work_revision'/i);
// Duplicate delivery of the exact same device event is idempotent; reuse with changed content is a conflict.
assert.match(eventSql,/on conflict (?:\\(event_id\\)|on constraint workshop_v2_events_pkey) do nothing returning \* into v/i);
assert.match(eventSql,/coalesce\(v\.device_id,''\)<>coalesce\(p_device_id,''\)/i);
assert.match(eventSql,/raise exception 'event_id_conflict'/i);
// Authenticated identity owns actorId even when devices differ.
assert.match(api,/actor_mismatch/);assert.match(api,/p_actor_id:String\(user\.id\)/);
// A rejected racing event must leave the normal replay queue and enter explicit conflict quarantine.
assert.match(queue,/syncState:'conflict'/);assert.match(queue,/syncState!=='conflict'/);assert.match(queue,/supersedeConflict/);
console.log('V2 same-employee two-device race authority gate: ok');
