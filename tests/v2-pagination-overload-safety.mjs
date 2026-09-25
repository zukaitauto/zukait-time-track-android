import fs from 'node:fs';
import assert from 'node:assert/strict';
const files={
 hist:fs.readFileSync('supabase/ARCHITECTURE_V2_BOUNDED_HISTORY.sql','utf8'),
 op:fs.readFileSync('supabase/ARCHITECTURE_V2_OPERATIONAL_PROJECTIONS.sql','utf8'),
 job:fs.readFileSync('supabase/ARCHITECTURE_V2_JOBCARD_PROJECTION.sql','utf8'),
 report:fs.readFileSync('supabase/ARCHITECTURE_V2_REPORTING.sql','utf8')
};
const expected=[
 [files.hist,/drop function if exists public\.zukait_v2_event_page\(timestamptz,integer,text,text\)/i,/zukait_v2_event_page\([\s\S]*p_before_id text default null/i],
 [files.op,/drop function if exists public\.zukait_v2_operational_report_page\(text,timestamptz,integer,jsonb\)/i,/zukait_v2_operational_report_page\([\s\S]*p_before_id text default null/i],
 [files.job,/drop function if exists public\.zukait_v2_jobcard_page\(text,timestamptz,integer,text\)/i,/zukait_v2_jobcard_page\([\s\S]*p_before_id text default null/i],
 [files.job,/drop function if exists public\.zukait_v2_wip_page\(timestamptz,integer,text,text\)/i,/zukait_v2_wip_page\([\s\S]*p_before_id text default null/i],
 [files.report,/drop function if exists public\.zukait_v2_report_page\(text,timestamptz,integer,jsonb\)/i,/zukait_v2_report_page\([\s\S]*p_before_id text default null/i]
];
for(const [sql,oldSig,newSig] of expected){assert.match(sql,oldSig);assert.match(sql,newSig);}
console.log('V2 pagination overload safety gate: ok');
