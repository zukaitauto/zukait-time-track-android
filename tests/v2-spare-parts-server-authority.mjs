import fs from'node:fs';import assert from'node:assert/strict';
const sql=fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8');
const report=fs.readFileSync('supabase/ARCHITECTURE_V2_REPORTING.sql','utf8');
const workflow=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/workflow.js','utf8');
const main=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(sql,/p_event_type like 'SPARE_PART%'/);
assert.match(sql,/raise exception 'invalid_spare_part_event'/);
assert.match(sql,/p_event_type='SPARE_PART_STATUS_CHANGED'/);
assert.match(sql,/raise exception 'invalid_spare_part_transition'/);
assert.match(report,/q\.report='PARTS_DELAY'.*e\.event_type like 'SPARE_PART%'/s);
assert.match(workflow,/if\(to==='SUPERVISOR_VERIFIED'\)return role==='Supervisor'\|\|role==='Manager'/,'Supervisor verification authority missing');
assert.match(workflow,/if\(to==='DENTER_CHECKED'\)return false/,'legacy DENTER_CHECKED must not be creatable');
assert.doesNotMatch(workflow,/role==='Denter'\|\|role==='Manager'/,'Denter must not have transition authority');
assert.match(workflow,/function notifySupervisor/);assert.match(main,/function denterView/);assert.match(main,/Notify Supervisor/);assert.match(main,/async function openList\(no\)/,'Parts List detail must use the server-authoritative async handler');assert.match(main,/v2-pl-read-head/,'Parts List detail must render the dedicated read-only grid');assert.match(main,/v2-pl-supervisor-head/,'Supervisor Parts List must use the compact role-specific grid');
assert.doesNotMatch(main,/const add=canManage\(\)\?/,'Parts List detail must not restore role-specific part-entry controls');assert.match(main,/function canManage\(\)\{return \['Manager','Supervisor'\]\.includes\(role\(\)\)\}/,'Supervisor list-edit authority missing or Purchaser leaked into it');assert.match(main,/function canPurchase\(\)\{return \['Manager','Purchaser'\]\.includes\(role\(\)\)\}/,'Purchaser commercial authority missing');assert.match(main,/function addItem\([^)]*\)\{if\(!canManage\(\)\)return \{ok:false,reason:'FORBIDDEN'\}/,'direct addItem must reject Denter and Purchaser');assert.match(main,/async function createFromUI\(\)\{if\(!canManage\(\)\)/,'UI create must reject Denter and Purchaser');
console.log('V2 spare-parts server event authority gate: ok');
assert.match(main,/Array\.isArray\(j\?\.assignedEmployees\)&&j\.assignedEmployees\.map\(String\)\.includes\(uid\)/,'Denter assignment scope must fail closed when assignment data is unavailable');

assert.match(api,/eventType==="SPARE_PART_MANAGER_CORRECTED"/,'API must explicitly recognize Manager parts corrections');
assert.ok(api.includes('callerRole!=="Manager"'),'Manager parts correction must require Manager role');
assert.ok(api.includes('spare_manager_correction_forbidden_or_invalid'),'Manager correction rejection code must remain explicit');
assert.ok(api.includes('allowedStatuses=new Set(["LISTED","ENQUIRY","QUOTED","ORDERED","RECEIVED"'),'Manager correction status allowlist must remain server-side');
assert.ok(api.includes('"FITTED","RETURNED","UNAVAILABLE","CUSTOMER_SETTLEMENT"]'),'Manager correction final statuses must remain server-side');
assert.match(api,/!String\(p\.reason\|\|""\)\.trim\(\)/,'Manager correction reason must be required server-side');

assert.ok(sql.includes("p_event_type='SPARE_PART_MANAGER_CORRECTED'"),'SQL must recognize Manager correction revision lane');
assert.ok(sql.includes("prior.event_type='SPARE_PART_MANAGER_CORRECTED'"),'Manager correction revision check must compare only Manager corrections');
assert.ok(sql.includes("coalesce(prior.revision,0)>=p_revision"),'same or older Manager correction revisions must be rejected');
assert.ok(sql.includes("stale_spare_manager_correction_revision"),'stale Manager correction must have explicit server rejection');
assert.doesNotMatch(sql,/p_event_type in \([^)]*SPARE_PART_STATUS_CHANGED[^)]*SPARE_PART_MANAGER_CORRECTED/,'ordinary status transitions must not share Manager correction revision lane');

assert.ok(sql.includes("p_event_type='SPARE_PART_MANAGER_CORRECTED' and exists"),'Server projection must guard concurrent Manager corrections');
assert.ok(sql.includes("e.event_type='SPARE_PART_MANAGER_CORRECTED'"),'Manager correction stale check must be isolated to Manager correction lane');
assert.ok(sql.includes("coalesce(e.revision,0)>=coalesce(p_revision,0)"),'Manager correction stale check must reject equal or older revisions');
assert.ok(sql.includes("stale_spare_manager_correction"),'SQL must raise a dedicated stale Manager correction conflict');
assert.ok(api.includes('message.includes("stale_spare_manager_correction")'),'API must recognize stale Manager correction conflicts');
assert.ok(api.includes('code:"stale_spare_manager_correction"},409'),'API must expose stale Manager correction as HTTP 409');

assert.doesNotMatch(main,/SUPERVISOR_VERIFIED:!item\.arrivalAccepted\?\['Confirm Arrived','ACCEPTED'/,'Purchaser must not re-confirm a Supervisor-confirmed arrival');
assert.ok(main.includes("targetRole:'Purchaser'"),'new Parts List/item events must target Purchaser');
assert.ok(main.includes("targetRole:to==='RECEIVED'?'Supervisor':null"),'Received event must target Supervisor');
assert.ok(main.includes("name:previous.name||''"),'Received notification event must retain the part name');
