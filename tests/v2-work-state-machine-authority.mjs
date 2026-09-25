import fs from "node:fs";
const sql=fs.readFileSync("supabase/ARCHITECTURE_V2_OPERATIONAL_PROJECTIONS.sql","utf8");
const must=[
 "p_event_type='WORK_PAUSE' and cur.status<>'ACTIVE' then raise exception 'work_not_active'",
 "p_event_type='WORK_FINISH' and cur.status not in ('ACTIVE','PAUSED') then raise exception 'work_not_finishable'",
 "p_event_type='ID001_STOP' and (cur.kind<>'ID001' or cur.status<>'ACTIVE') then raise exception 'id001_not_active'",
 "cur.kind='WORK' and p_event_type in ('ID001_STOP','ID001_START') then raise exception 'work_command_kind_mismatch'",
 "cur.kind='ID001' and p_event_type in ('WORK_PAUSE','WORK_RESUME','WORK_FINISH','WORK_START') then raise exception 'id001_command_kind_mismatch'",
 "if found then raise exception 'work_session_exists'; end if;"
];
for(const s of must){if(!sql.includes(s))throw new Error("missing state-machine guard: "+s)}
if(sql.includes("if found and cur.status not in ('FINISHED','STOPPED') then raise exception 'work_session_exists'"))throw new Error("closed session reuse remains allowed");
console.log("V2 work-session state-machine guards: OK");
