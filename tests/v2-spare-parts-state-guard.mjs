import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync(new URL('../supabase/V215_SPARE_PART_ACTIVE_STATE_GUARD.sql',import.meta.url),'utf8');
assert.match(sql,/workshop_v2_spare_part_state/);
assert.match(sql,/workshop_v2_spare_part_state_conflicts/);
assert.match(sql,/event_type='SPARE_PART_LISTED'/);
assert.match(sql,/latest_identity as/);
assert.match(sql,/latest_status as/);
assert.match(sql,/SPARE_PART_ITEM_EDITED.*deletedAt/s);
assert.match(sql,/delete from public\.workshop_v2_spare_part_state where part_id=pid/);
assert.match(sql,/not exists \(\s*select 1 from public\.workshop_v2_events d[\s\S]*deletedAt/);
assert.match(sql,/do \$\$/);
assert.doesNotMatch(sql,/do \$\nbegin/,'PL/pgSQL block delimiter must remain valid');
assert.match(sql,/status<>'RETURNED'/);
assert.match(sql,/having count\(\*\)>1/);
assert.match(sql,/unique guard index deferred until reviewed/);
assert.match(sql,/create unique index if not exists workshop_v2_spare_part_one_active_key/);
assert.match(sql,/duplicate_active_spare_part/);
assert.ok(sql.indexOf('insert into public.workshop_v2_spare_part_state_conflicts')<sql.indexOf('create unique index if not exists workshop_v2_spare_part_one_active_key'),'historical conflicts are detected before unique enforcement');
console.log('v2 spare parts state guard tests passed');

assert.match(sql,/p->>'from'[\s\S]*cur\.status/,'Live status projection must compare expected from-status with authoritative state');
assert.match(sql,/raise exception 'stale_spare_part_status'/,'Stale concurrent status transitions must be rejected');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(api,/stale_spare_part_status.*409/,'API must expose stale spare part transition as conflict');

assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\(ln\|\|'\|'\|\|k,0\)\)/,'New listed parts must serialize by list and normalized part key');
assert.match(sql,/upper\(st\)<>'RETURNED'[\s\S]*upper\(cur\.status\)='RETURNED'[\s\S]*duplicate_active_spare_part/,'Reactivation and Cancel Return must reject an active replacement');
assert.match(sql,/k<>cur\.part_key[\s\S]*duplicate_active_spare_part/,'Identity corrections must reject an active duplicate');
assert.match(sql,/do \$\$[\s\S]*end \$\$;/,'Migration PL/pgSQL block must use valid dollar quoting');

assert.match(sql,/e\.event_id listed_event_id/,'Initial listed events must supply the projection event id');
assert.match(sql,/coalesce\(s\.event_id,i\.event_id,l\.listed_event_id\)/,'Listed-only parts must not rebuild with a null event id');

assert.match(sql,/e\.event_type='SPARE_PART_FINAL_PRICE_RECORDED'[\s\S]*e\.event_id<>new\.event_id[\s\S]*stale_spare_final_price/,'AFTER INSERT price guard must exclude its own event');

assert.match(sql,/financial_snapshot[\s\S]*preReturnSnapshot[\s\S]*stale_spare_return_financial_snapshot/,'Manager Return must reject a stale undo financial snapshot under the row lock');
