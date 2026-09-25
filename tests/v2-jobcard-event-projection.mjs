import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
assert.match(sql,/p_event_type in \('JOB_CREATED','JOB_UPDATED','JOB_STAGE_CHANGED','JOB_COMPLETED','JOB_REOPENED'\)/);assert.match(sql,/perform public\.zukait_v2_upsert_jobcard/);assert.match(sql,/coalesce\(nullif\(p_payload->>'jobCard',''\),p_entity_id\)/);assert.match(sql,/when p_event_type='JOB_COMPLETED' then 'COMPLETED'/);assert.match(sql,/when p_event_type='JOB_REOPENED' then 'OPEN'/);assert.match(sql,/p_event_id/);assert.match(sql,/coalesce\(p_revision,0\)/);
const insertPos=sql.indexOf('if found then');const projectPos=sql.indexOf('perform public.zukait_v2_upsert_jobcard',insertPos);const duplicatePos=sql.indexOf('else',insertPos);assert.ok(projectPos>insertPos&&projectPos<duplicatePos,'projection must run only for newly inserted events');
console.log('V2 transactional Job Card event projection: ok');
