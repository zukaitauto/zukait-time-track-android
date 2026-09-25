import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const cloud=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const queue=fs.readFileSync('app/src/main/assets/v2/core/offline_queue.js','utf8');
assert.match(sql,/event_id text primary key/i);assert.match(sql,/on conflict \(event_id\) do nothing/i);assert.match(sql,/zukait_v2_commit_event/i);assert.match(sql,/grant execute[^;]+service_role/is);assert.match(sql,/revoke all[^;]+anon,authenticated/is);
assert.match(api,/action === "v2_commit_event"/);assert.match(api,/actor_mismatch/);assert.match(api,/String\(event\.actorId\) !== String\(user\.id\)/);assert.match(api,/admin\.rpc\("zukait_v2_commit_event"/);
assert.match(cloud,/async function flushV2EventQueue/);assert.match(cloud,/for\(const event of q\.pending\(\)\)/);assert.match(cloud,/q\.markSynced\(event\.eventId/);assert.match(cloud,/catch\(e\).*break;/s);assert.match(queue,/rows\.some\(x=>x\.eventId===event\.eventId\)/);assert.match(queue,/syncState:'synced'/);
// Same event ID must be the retry identity from local queue through server primary key.
assert.match(cloud,/v2CommitEvent\(event\)/);assert.match(api,/p_event_id:String\(event\.eventId\)/);
console.log('V2 idempotent event write/retry contract: ok');
