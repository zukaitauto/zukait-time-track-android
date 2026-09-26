import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/V156_ID001_PRELIMINARY_SERVER_DEPLOY.sql','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const sup=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8');

assert.match(migration,/create table if not exists public\.workshop_v2_preliminary_links/i,'deployment migration must create preliminary link authority table');
assert.match(migration,/session_id text primary key/i,'session must remain the unique preliminary-link authority key');
assert.match(migration,/for update/i,'preliminary link/reversal must lock the authority row');
assert.match(migration,/preliminary_session_already_linked/i,'duplicate link must be rejected');
assert.match(migration,/preliminary_link_not_active/i,'stale reversal must be rejected');
assert.match(migration,/preliminary_reversal_reason_required/i,'reversal reason must remain mandatory');
assert.match(migration,/ID001_PRELIMINARY_LINKED','deployment migration must wire link event into commit authority');
assert.match(migration,/zukait_v2_apply_preliminary_link_event/,'commit authority must project preliminary events');

assert.match(api,/eventType==="ID001_PRELIMINARY_LINKED".*\["Manager","Supervisor"\]/s,'server API must allow only Manager/Supervisor to link');
assert.match(api,/eventType==="ID001_PRELIMINARY_REVERSED".*callerRole!=="Manager"/s,'server API must keep reversal Manager-only');
assert.match(api,/preliminary_session_already_linked.*409/s,'duplicate link must return HTTP 409');
assert.match(api,/preliminary_link_not_active.*409/s,'stale reversal must return HTTP 409');

const linkStart=sup.indexOf('window.v143LinkPreliminaryWork=async function(no)');
const reverseStart=sup.indexOf('window.v143ReversePreliminaryWork=async function(sessionId,reason)');
assert.ok(linkStart>=0&&reverseStart>linkStart,'preliminary client functions missing');
const link=sup.slice(linkStart,reverseStart);
const reverse=sup.slice(reverseStart,sup.indexOf('window.v143CreateAndAssignJob=function()',reverseStart));
assert.ok(link.indexOf('!navigator.onLine') < link.indexOf('s.preliminaryLinkedJob=no'),'offline link must be blocked before local mutation');
assert.ok(reverse.indexOf('!navigator.onLine') < reverse.indexOf('delete s.preliminaryLinkedJob'),'offline reversal must be blocked before local mutation');
assert.match(sup,/async function v143SyncPreliminaryAuthority\(\).*zukaitCloud\?\.syncNow/s,'preliminary authority must have immediate shared-state reconciliation');
assert.match(link,/if\(count\|\|conflicts\)await v143SyncPreliminaryAuthority\(\)/,'successful or conflicting link must refresh shared state');
assert.match(reverse,/preliminary_link_not_active'\)\{await v143SyncPreliminaryAuthority\(\)/,'stale reversal must refresh shared state');
assert.match(reverse,/save\(\);await v143SyncPreliminaryAuthority\(\)/,'successful reversal must push shared state immediately');

console.log('V156 ID001 preliminary server deployment + offline/multidevice hardening: ok');
