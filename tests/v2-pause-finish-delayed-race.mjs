import fs from'node:fs';import assert from'node:assert/strict';
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_OPERATIONAL_PROJECTIONS.sql','utf8');
const eventSql=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const queue=fs.readFileSync('app/src/main/assets/v2/core/offline_queue.js','utf8');
// Same session: whichever device commits the newer revision first becomes server truth.
// A delayed PAUSE/FINISH/RESUME carrying the old revision must not overwrite it.
assert.match(sql,/select \* into cur from public\.workshop_v2_work_sessions where session_id=p_entity_id for update/i);
assert.match(sql,/if found and coalesce\(p_revision,0\)<=cur\.revision then raise exception 'stale_work_revision'/i);
assert.match(sql,/elsif p_event_type='WORK_PAUSE'/i);
assert.match(sql,/elsif p_event_type='WORK_RESUME'/i);
assert.match(sql,/elsif p_event_type in \('WORK_FINISH','ID001_STOP'\)/i);
assert.match(sql,/if cur\.status<>'PAUSED' then raise exception 'work_not_paused'/i);
// Exact retry remains idempotent, but changing a previously used event identity is rejected.
assert.match(eventSql,/if found then/i);assert.match(eventSql,/raise exception 'event_id_conflict'/i);
// API exposes deterministic conflict codes so the client quarantines, refreshes and creates a new event identity.
assert.match(api,/code:"stale_work_revision"/);assert.match(api,/code:"work_not_paused"/);
assert.match(queue,/function markConflict/);assert.match(queue,/function supersedeConflict/);
assert.match(queue,/replacement\.eventId===eventId/);
console.log('V2 pause/finish delayed-device race gate: ok');
