import { preserveJobTypeAuthority } from "./job_type_authority.js";
import "./paint_order_rules.js";
const paintOrderRules = (globalThis as any).zukaitPaintOrderRules;
import { qcTransition, preserveQcAuthority } from "./qc_delivery_rules.js";
import { timeManagementTransition } from "./time_management_rules.js";

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zukait-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}
function allowedApiKey(req: Request) {
  const supplied = req.headers.get("apikey") || "";
  if (!supplied) return false;
  const keys: string[] = [];
  const single = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (single) keys.push(single);
  try {
    const obj = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    for (const v of Object.values(obj)) if (typeof v === "string") keys.push(v);
  } catch (_) {}
  return keys.length ? keys.includes(supplied) : supplied.startsWith("sb_publishable_");
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sessionUser(token: string) {
  if (!token) return null;
  const hash = await sha256Hex(token);
  // One relational read keeps per-request revocation + active-account checks
  // authoritative while avoiding a second REST round trip on every heartbeat.
  const { data: session } = await admin.from("staff_sessions")
    .select("user_id,revoked_at,last_seen_at,staff_credentials!staff_sessions_user_id_fkey(user_id,display_name,role,department,active)")
    .eq("token_hash", hash).maybeSingle();
  if (!session || session.revoked_at) return null;
  const staffRaw = (session as any).staff_credentials;
  const staff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
  if (!staff || !staff.active || String(staff.user_id) !== String(session.user_id)) return null;
  // Revision probes can arrive every second from active phones. Keep session
  // liveness useful without turning every read into a database write.
  const lastSeen = session.last_seen_at ? Date.parse(String(session.last_seen_at)) : 0;
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen >= 60000) {
    await admin.from("staff_sessions").update({ last_seen_at: new Date().toISOString() })
      .eq("token_hash", hash);
  }
  return { id: staff.user_id, name: staff.display_name, role: staff.role, department: staff.department };
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function mapById(arr: any[]) {
  const m = new Map<string, any>();
  for (const x of arr || []) if (x && x.id != null) m.set(String(x.id), x);
  return m;
}
function immutableSame(a: any, b: any, keys: string[]) {
  return keys.every(k => same(a?.[k], b?.[k]));
}
function emptyCompatible(a: any, b: any) {
  const empty = (x: any): boolean => x == null || (Array.isArray(x) ? x.length === 0 :
    typeof x === "object" && Object.values(x).every(empty));
  return same(a,b) || (empty(a) && empty(b));
}
function changedFields(before: any, after: any, allowed: string[]) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...fields].every(k => allowed.includes(k) || same(before?.[k], after?.[k]));
}
function rowsValid(rows: any) {
  return Array.isArray(rows) && rows.every(x => x && typeof x === "object" && x.id != null) &&
    new Set(rows.map(x => String(x.id))).size === rows.length;
}
function appendOnly(before: any[], after: any[], own?: (x:any)=>boolean) {
  const remaining = (after || []).slice();
  for (const row of before || []) {
    const i = remaining.findIndex(x => same(x,row));
    if (i < 0) return false;
    remaining.splice(i,1);
  }
  return !own || remaining.every(own);
}
function validTime(value: any, serverNow = Date.now()) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= serverNow + 5*60000;
}
function muscatParts(at: number) {
  const d = new Date(at+4*3600000);
  return { day:d.toISOString().slice(0,10), friday:d.getUTCDay()===5, minute:d.getUTCHours()*60+d.getUTCMinutes(), base:Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-4*3600000 };
}
function closedDay(at: number, data: any) {
  const p=muscatParts(at);
  return p.friday || (data.workshopHolidays || []).some((h:any)=>String(typeof h==='string'?h:h?.date||h?.dateKey||h?.day||'').slice(0,10)===p.day);
}
function onLeave(emp: string, at: number, data: any) {
  const p=muscatParts(at);
  return (data.leaves || []).some((l:any)=>!l.cancelled && l.emp===emp && l.date===p.day &&
    (l.period==='FULL' || (l.period==='AM' && p.minute>=480 && p.minute<780) || (l.period==='PM' && p.minute>=900 && p.minute<1140)));
}
function assignmentFor(s: any, data: any) {
  return (data.assign || []).find((a:any)=>String(a.id)===String(s.assignmentId) && a.emp===s.emp && a.job===s.job) ||
    (!s.assignmentId ? (data.assign || []).filter((a:any)=>a.emp===s.emp && a.job===s.job && Number(a.assignedAt||0)<=s.start).sort((a:any,b:any)=>Number(b.assignedAt||0)-Number(a.assignedAt||0))[0] : null);
}
function validSessionChange(before: any, after: any, data: any, serverNow = Date.now()) {
  if (!validTime(after.start,serverNow) || (after.end!=null && (!validTime(after.end,serverNow) || after.end<after.start))) return false;
  const a=assignmentFor(after,data);
  if (!a || a.cancelled || (Number(a.assignedAt||0)>after.start)) return false;
  if (!!after.rework!==!!a.rework) return false;
  if (before) {
    if (!immutableSame(before,after,["id","emp","job","assignmentId","start"])) return false;
    // A closed session is historical. Corrections require Manager authority.
    if (before.end && !immutableSame(before,after,["end","paused","finished","rework"])) return false;
    if (before.finished && !after.finished) return false;
  } else {
    if (onLeave(after.emp,after.start,data)) return false;
    if (after.job==='ID001') {
      const m=muscatParts(after.start).minute;
      if (closedDay(after.start,data) || !((m>=480&&m<780)||(m>=900&&m<1140))) return false;
    }
    if (a.completed && (!after.finished || !after.end || Number(a.completedAt)!==after.end)) return false;
  }
  if (after.paused && (!after.end || after.finished || after.job==='ID001')) return false;
  if (after.finished && !after.end) return false;
  return true;
}
function validateEmployeeChange(emp: string, oldData: any, newData: any) {
  if (!oldData || !newData) return false;
  const allowed = new Set(["sessions","assign","jobs","requests","lastActions","systemNotifications","notifications","overtimeNotices","leaves","leaveAudit","leaveNotifications","offlineActionLog"]);
  for (const k of new Set([...Object.keys(oldData), ...Object.keys(newData)])) {
    if (!allowed.has(k) && !emptyCompatible(oldData[k],newData[k])) return false;
  }
  for (const k of ["assign","sessions","requests","leaves","leaveAudit","leaveNotifications","offlineActionLog"]) {
    if (!emptyCompatible(oldData[k],newData[k]) && !rowsValid(newData[k])) return false;
  }
  const oldA=mapById(oldData.assign || []), newA=mapById(newData.assign || []);
  if (oldA.size!==newA.size) return false;
  const assignmentFields=["completed","completedAt","pauseReason","pendingOfflineStart","pendingOfflineStartAt","pendingOfflinePause","pendingOfflinePauseAt","pendingOfflineFinish","pendingOfflineFinishAt","autoStopped","autoStopReason","autoStoppedForNormalWork","autoCompleted","autoCompletedReason"];
  for (const [id,before] of oldA) {
    const after=newA.get(id);
    if (!after) return false;
    if (same(before,after)) continue;
    if (before.emp!==emp || !changedFields(before,after,assignmentFields)) return false;
    if (before.completed && (!after.completed || !same(before.completedAt,after.completedAt))) return false;
    if (!before.completed && after.completed) {
      const ended=(newData.sessions || []).some((x:any)=>x.emp===emp && x.finished && x.end===after.completedAt && assignmentFor(x,newData)?.id===after.id);
      // An assigned but unstarted ID001 may be stopped before normal work starts.
      const stoppedUnstarted=after.job==='ID001' && after.autoStoppedForNormalWork && !(oldData.sessions || []).some((x:any)=>assignmentFor(x,oldData)?.id===before.id) &&
        (newData.sessions || []).some((x:any)=>x.emp===emp && x.job!=='ID001' && x.start===after.completedAt);
      if (!ended && !stoppedUnstarted) return false;
    }
  }
  const oldS=mapById(oldData.sessions || []), newS=mapById(newData.sessions || []);
  for (const [id,before] of oldS) {
    const after=newS.get(id);
    if (!after) return false;
    if (same(before,after)) continue;
    if (before.emp!==emp || !validSessionChange(before,after,newData)) return false;
  }
  for (const [id,after] of newS) if (!oldS.has(id) && (after.emp!==emp || !validSessionChange(null,after,newData))) return false;
  // Reject new overlaps; unchanged historical anomalies do not block unrelated saves.
  const own=[...newS.values()].filter(x=>x.emp===emp).sort((a,b)=>a.start-b.start);
  let maximumEnd=0, maximumChangedEnd=0;
  for (const session of own) {
    const changed=!same(oldS.get(String(session.id)),session);
    if ((changed && maximumEnd>session.start) || maximumChangedEnd>session.start) return false;
    const end=session.end || Infinity;
    maximumEnd=Math.max(maximumEnd,end);
    if(changed)maximumChangedEnd=Math.max(maximumChangedEnd,end);
  }
  // Finishing own work may derive a Job Card's completion status, never edit its metadata.
  const oldJobs=new Map((oldData.jobs || []).map((j:any)=>[j.no,j]));
  const newJobs=new Map((newData.jobs || []).map((j:any)=>[j.no,j]));
  if (oldJobs.size!==newJobs.size) return false;
  for (const [no,before] of oldJobs) {
    const after:any=newJobs.get(no);
    if (same(before,after)) continue;
    if (!after || !changedFields(before,after,["status","completedAt"])) return false;
    const assignments=(newData.assign || []).filter((a:any)=>a.job===no&&!a.cancelled);
    if (!assignments.some((a:any)=>a.emp===emp && !same(oldA.get(String(a.id)),a))) return false;
    if (after.status==='Completed') {
      if (!assignments.length || !assignments.every((a:any)=>a.completed) || after.completedAt!==Math.max(...assignments.map((a:any)=>Number(a.completedAt||0)))) return false;
    } else if (after.status!=='Open' || after.completedAt!=null) return false;
  }
  for (const k of ["requests","leaves","leaveAudit","leaveNotifications","offlineActionLog"]) {
    if (!appendOnly(oldData[k] || [],newData[k] || [],x=> {
      if (k==='leaveAudit') return x.by===emp && x.action==='ADD';
      if (x.emp!==emp) return false;
      if (k==='leaves') return x.by===emp && !x.cancelled && ['FULL','AM','PM'].includes(x.period) && /^\d{4}-\d{2}-\d{2}$/.test(x.date||'');
      if (k==='requests') return x.status==='New';
      if (k==='leaveNotifications') return x.by===emp;
      const a=newA.get(String(x.assignmentId));
      const session=(newData.sessions || []).find((v:any)=>v.emp===emp && assignmentFor(v,newData)?.id===a?.id && (x.sessionId==null || String(v.id)===String(x.sessionId)) && (x.type==='START'?v.start===x.at:v.end===x.at));
      return a?.emp===emp && a.job===x.job && !!session && ['START','PAUSE','FINISH','STOP_ID001'].includes(x.type) && validTime(x.at);
    })) return false;
  }
  for (const k of ["lastActions","overtimeNotices"]) {
    for (const id of new Set([...Object.keys(oldData[k]||{}),...Object.keys(newData[k]||{})])) {
      if (id!==emp && !same(oldData[k]?.[id],newData[k]?.[id])) return false;
    }
  }
  for (const k of ["systemNotifications","notifications"]) {
    const old=mapById(oldData[k] || []), next=mapById(newData[k] || []);
    for (const [id,before] of old) {
      const after=next.get(id);
      if (!after) return false;
      if (!same(before,after) && (before.target!==emp || !changedFields(before,after,["read","readAt"]))) return false;
    }
    for (const [id,x] of next) if (!old.has(id) && x.target!==emp && x.emp!==emp && newA.get(String(x.assignmentId))?.emp!==emp) return false;
  }
  return true;
}
function validateSupervisorChange(actor: string, oldData: any, newData: any) {
  const allowed=new Set(["jobs","assign","sessions","requests","lastActions","systemNotifications","notifications","overtimeNotices","leaves","leaveAudit","leaveNotifications","attentionDismissed","additionalActions","suggestedEdits","reworks","reworkLogs","reopenLogs","reassignLogs","reissueLogs","employeeChangeLogs","cancelledAssignments","jobEdits","jobVehicleEdits","consumables","paintPurchasing","paintCosting","estimates","estimateAudit"]);
  for (const k of new Set([...Object.keys(oldData),...Object.keys(newData)])) {
    if (!allowed.has(k) && !emptyCompatible(oldData[k],newData[k])) return false;
  }
  const jobFields=['status','completedAt','delivered','deliveredAt','deliveredBy','readyAt','readyBy','workflowStage','stage','updatedAt','updatedBy'];
  const oldJobs=new Map<string,any>((oldData.jobs || []).map((j:any)=>[String(j.no),j]));
  const newJobs=new Map<string,any>((newData.jobs || []).map((j:any)=>[String(j.no),j]));
  for(const [no,before] of oldJobs){
    const after=newJobs.get(no);
    if(!after)return false;
    if(!changedFields(before,after,jobFields)){
      const fields=['make','brand','model','year','reg','vehicle'];
      const audit=(newData.jobVehicleEdits || []).find((x:any)=>x.job===no && x.by===actor && !(oldData.jobVehicleEdits || []).some((old:any)=>same(old,x)) &&
        fields.filter(k=>k!=='brand').every(k=>same(x.after?.[k],after[k])) && x.before?.vehicle===before.vehicle && x.before?.reg===(before.reg||''));
      if(!audit || !changedFields(before,after,[...jobFields,...fields]))return false;
    }
  }
  for(const [no,j] of newJobs)if(!oldJobs.has(no) && j.createdBy!==actor && !(no==='ID001' && j.systemCard))return false;
  for(const k of ['leaves','leaveNotifications']){
    const old=mapById(oldData[k] || []), next=mapById(newData[k] || []);
    for(const [id,before] of old){
      const after=next.get(id);
      if(!after)return false;
      if(same(before,after))continue;
      const target=(oldData.users || []).find((u:any)=>u.id===after.emp);
      if(after.emp!==actor && target?.role!=='Employee')return false;
    }
    for(const [id,row] of next)if(!old.has(id)){
      const target=(oldData.users || []).find((u:any)=>u.id===row.emp);
      if(row.by!==actor || (row.emp!==actor && target?.role!=='Employee'))return false;
    }
  }
  const oldS=mapById(oldData.sessions || []), newS=mapById(newData.sessions || []);
  if (oldS.size!==newS.size) return false;
  for (const [id,before] of oldS) {
    const after=newS.get(id);
    if (!after) return false;
    if (!same(before,after) && (!immutableSame(before,after,["id","emp","job","assignmentId","start"]) ||
      (before.end && !same(before.end,after.end)) || !validTime(after.end) || after.end<after.start)) return false;
  }
  // Supervisors can issue/finalize material use; master prices and finalized corrections remain Manager-only.
  const oldC=oldData.consumables || {}, newC=newData.consumables || {};
  for (const k of ["materials","brands","prices"]) if (!emptyCompatible(oldC[k],newC[k])) return false;
  for (const k of ["issues","actuals"]) {
    const old=mapById(oldC[k] || []), next=mapById(newC[k] || []);
    for (const [id,before] of old) {
      const after=next.get(id);
      if (!after) return false;
      if (!same(before,after) && !(k==='actuals' && before.managerReopen && !before.locked && after.refinalizedBy===actor && after.locked && after.managerReopen===false)) return false;
    }
    for (const [id,x] of next) if (!old.has(id) && x.createdBy!==actor) return false;
  }
  for (const k of ["orders"]) {
    const old=mapById(oldData.paintPurchasing?.[k] || []), next=mapById(newData.paintPurchasing?.[k] || []);
    for (const [id,before] of old) {
      const after=next.get(id);
      if (!after || !immutableSame(before,after,["id","poNumber","jobCard","createdAt","createdBy","vendor","remarks","colorCode","voided"])) return false;
      if (before.receivedAt && (!same(before.lines,after.lines) || !same(before.receivedAt,after.receivedAt))) return false;
      if (!appendOnly(before.returns || [],after.returns || [],x=>x.returnedBy===actor)) return false;
    }
  }
  return true;
}
function validateRoleChange(user: any, oldData: any, newData: any) {
  if (!['Manager','Supervisor','Employee','Purchaser','Denter'].includes(user.role)) return false;
  if (['Purchaser','Denter'].includes(user.role)) {
    for(const k of new Set([...Object.keys(oldData),...Object.keys(newData)]))if(!['notifications','systemNotifications','lastActions'].includes(k)&&!emptyCompatible(oldData[k],newData[k]))return false;
  }
  if (user.role==='Employee') return validateEmployeeChange(user.id,oldData,newData);
  if (user.role==='Supervisor' && !validateSupervisorChange(user.id,oldData,newData)) return false;
  // Preserve existing audit entries for every role, including Manager corrections.
  for (const k of ['corrections','jobEdits','jobVehicleEdits','suggestedEdits','additionalActions','reworkLogs','reopenLogs','reassignLogs','reissueLogs','employeeChangeLogs','jobDeletes','deletedJobAudit','leaveAudit','estimateAudit']) {
    if (!appendOnly(oldData[k] || [],newData[k] || [])) return false;
  }
  for (const k of ['consumables','paintPurchasing']) if (!appendOnly(oldData[k]?.audit || [],newData[k]?.audit || [])) return false;
  return true;
}


function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}


// Full-state clients cannot undo a server-confirmed Manager correction or cancellation.
function preserveManagerTimeAuthority(candidate: any, current: any): any {
  for (const key of ['sessions','assign'] as const) {
    const rows = Array.isArray(candidate[key]) ? candidate[key] : [];
    for (const row of current[key] || []) {
      if (!(key === 'sessions' ? row.managerTimeRevision || row.managerTimeUpdatedAt : row.managerTimeCancellation && row.cancelled)) continue;
      const i = rows.findIndex((x:any) => String(x?.id) === String(row.id));
      if (i < 0) rows.push(cloneValue(row));
      else rows[i] = cloneValue(row);
    }
    candidate[key] = rows;
  }
  const audited = new Set((current.additionalActions || []).filter((x:any)=>x.managerTime).map((x:any)=>x.id));
  for (const row of current.corrections || []) if (row.command?.operation === 'CORRECT_SESSION') audited.add(row.id);
  for (const key of ['additionalActions','corrections','cancelledAssignments','suggestedEdits','reopenLogs'] as const) {
    const rows = Array.isArray(candidate[key]) ? candidate[key] : [];
    for (const row of current[key] || []) {
      if (!audited.has(row.id)) continue;
      const i = rows.findIndex((x:any)=>x?.id === row.id);
      if (i < 0) rows.push(cloneValue(row)); else rows[i] = cloneValue(row);
    }
    candidate[key] = rows;
  }
  return candidate;
}

function preserveAuthoritativeReopens(candidate: any, current: any): any {
  const serverAssignments=new Map((current?.assign||[]).filter((a:any)=>a?.id).map((a:any)=>[String(a.id),a]));
  candidate.assign=(candidate?.assign||[]).map((a:any)=>{
    const server:any=serverAssignments.get(String(a?.id||""));
    if(!server)return a;
    const serverRev=Number(server.timeManagementRevision||0),clientRev=Number(a.timeManagementRevision||0);
    const serverReopenAt=Number(server.lastReopenedAt||0),clientReopenAt=Number(a.lastReopenedAt||0);
    if((serverRev>clientRev||serverReopenAt>clientReopenAt)&&server.completed===false){
      return cloneValue(server);
    }
    return a;
  });
  return candidate;
}


// A delayed legacy client must not reopen work that another device already paused.
// Only synthetic overtime sessions absent from the current server snapshot are removed.
function preserveClosedSessions(candidate: any, current: any): any {
  const closed = new Map((current?.sessions || []).filter((s: any) => Number(s?.end || 0) > 0).map((s: any) => [String(s.id),s]));
  candidate.sessions = (candidate?.sessions || []).map((s: any) => {
    const authoritative: any = closed.get(String(s?.id || ""));
    // A stale device can also hold an earlier end value. Once the server has
    // closed this session, its terminal fields remain authoritative; a real
    // restart must create a new session ID.
    return authoritative
      ? {...s,end:authoritative.end,paused:authoritative.paused,autoPausedAt:authoritative.autoPausedAt,
         pauseReason:authoritative.pauseReason,closeReason:authoritative.closeReason}
      : s;
  });
  return candidate;
}

function reconcileAutoOvertime(candidate: any, current: any): any {
  const serverIds = new Set((current?.sessions || []).map((s: any) => String(s?.id || "")));
  const paused = [...(candidate?.sessions || []),...(current?.sessions || [])]
    .filter((s: any) => s?.paused === true && Number(s?.end || 0) > 0);
  const explicitResumes = (candidate?.sessions || []).filter((s: any) =>
    s && !s.autoOvertime && Number(s.start || 0) > 0);
  candidate.sessions = (candidate?.sessions || []).filter((s: any) => {
    if (!s?.autoOvertime || s?.end) return true;
    const start = Number(s.start || 0);
    // Older clients synthesize overtime without asking the employee, even on Cancel.
    // Keep the original duty session closed and paused; a deliberate Start creates
    // a separate, non-synthetic session when work actually continues.
    if (!serverIds.has(String(s.id || "")) && !s.overtimeApprovedAt) {
      const source = (candidate.sessions || []).find((p: any) =>
        p && String(p.id) !== String(s.id) &&
        String(p.emp) === String(s.emp) &&
        String(p.assignmentId || p.job) === String(s.assignmentId || s.job) &&
        Number(p.start || 0) < start &&
        Number(p.end || 0) === start);
      if (source) {
        source.paused = true;
        source.autoPausedAt = start;
        source.autoPauseReason = "Duty ended; employee must explicitly restart to work overtime";
      }
      return false;
    }
    const pause = paused.find((p: any) =>
      String(p.id) !== String(s.id) &&
      String(p.emp) === String(s.emp) &&
      String(p.assignmentId || p.job) === String(s.assignmentId || s.job) &&
      Number(p.start || 0) < start &&
      !explicitResumes.some((resume: any) =>
        String(resume.id) !== String(p.id) &&
        String(resume.emp) === String(s.emp) &&
        String(resume.assignmentId || resume.job) === String(s.assignmentId || s.job) &&
        Number(resume.start || 0) >= Number(p.end || 0) &&
        Number(resume.start || 0) <= start)
    );
    if (!pause) return true;
    if (!serverIds.has(String(s.id || ""))) return false;
    s.end = Math.max(start, Number(pause.end));
    s.paused = true;
    s.closeReason = "PAUSE_OVERRIDES_AUTO_OVERTIME";
    return true;
  });
  return candidate;
}

// Consumables is a nested append/correct/void domain. A stale full-state client
// may legitimately lack the module or carry older/empty arrays while saving an
// unrelated workshop action. Preserve every server record by ID; incoming rows
// with the same ID still win so Manager corrections/void flags remain valid.
function preserveConsumablesHistory(candidate: any, current: any): any {
  const existing = current?.consumables;
  if (!existing || typeof existing !== "object") return candidate;
  const incoming = candidate?.consumables && typeof candidate.consumables === "object"
    ? candidate.consumables : {};
  for (const key of ["materials","brands","prices","issues","actuals","audit"] as const) {
    const nextRows = Array.isArray(incoming?.[key]) ? incoming[key] : [];
    const serverRows = Array.isArray(existing?.[key]) ? existing[key] : [];
    const identity = (row:any) => row?.id ? "id:"+String(row.id) : "json:"+JSON.stringify(row);
    const byId = new Map(nextRows.map((row:any,index:number)=>[identity(row),index]));
    for (const row of serverRows) {
      const id = identity(row);
      if (!byId.has(id)) {
        byId.set(id,nextRows.length); nextRows.push(cloneValue(row)); continue;
      }
      if (!["issues","actuals","prices"].includes(key)) continue;
      const idx=byId.get(id)!;
      const incomingRow:any=nextRows[idx]||{};
      const serverCorrected=Number(row?.correctedAt||0),incomingCorrected=Number(incomingRow?.correctedAt||0);
      if (row?.voided || serverCorrected>incomingCorrected) nextRows[idx]=cloneValue(row);
    }
    if (nextRows.length || serverRows.length || Array.isArray(incoming?.[key])) incoming[key] = nextRows;
  }
  incoming.schemaVersion = Math.max(Number(incoming.schemaVersion||0), Number(existing.schemaVersion||0), 1);
  candidate.consumables = incoming;
  return candidate;
}


function validateConsumablesManagerCorrections(candidate,current,user) {
  const oldActuals=new Map((current?.consumables?.actuals||[]).filter((x:any)=>x?.id).map((x:any)=>[String(x.id),x]));
  const newActuals=new Map((candidate?.consumables?.actuals||[]).filter((x:any)=>x?.id).map((x:any)=>[String(x.id),x]));
  for(const [id,before] of oldActuals){
    const after:any=newActuals.get(id);
    if(!after || same(before,after)) continue;
    const protectedChange=!same(before?.lines,after?.lines)||Number(before?.totalCost||0)!==Number(after?.totalCost||0)||before?.voided!==after?.voided;
    if(!protectedChange) continue;
    if(String(user?.role||'')!=='Manager') return 'manager_required_to_correct_final_consumables';
    if(String(after?.correctedBy||after?.voidedBy||'')!==String(user?.id||'')) return 'consumables_correction_actor_invalid';
    if(!String(after?.correctionReason||after?.voidReason||'').trim()) return 'consumables_correction_reason_required';
  }
  const oldIssues=new Map((current?.consumables?.issues||[]).filter((x:any)=>x?.id).map((x:any)=>[String(x.id),x]));
  const newIssues=new Map((candidate?.consumables?.issues||[]).filter((x:any)=>x?.id).map((x:any)=>[String(x.id),x]));
  for(const [id,before] of oldIssues){
    const after:any=newIssues.get(id);
    if(!after || same(before,after)) continue;
    const protectedChange=!same(before?.lines,after?.lines)||String(before?.colourCode||'')!==String(after?.colourCode||'')||String(before?.mainPainterId||'')!==String(after?.mainPainterId||'')||String(before?.allottedSupervisorId||'')!==String(after?.allottedSupervisorId||'')||before?.voided!==after?.voided;
    if(!protectedChange) continue;
    if(String(user?.role||'')!=='Manager') return 'manager_required_to_correct_suggested_consumables';
    if(String(after?.correctedBy||after?.voidedBy||'')!==String(user?.id||'')) return 'suggested_consumables_correction_actor_invalid';
    if(!String(after?.correctionReason||after?.voidReason||'').trim()) return 'suggested_consumables_correction_reason_required';
  }
  return null;
}

// Paint purchasing is also an append/correct/void domain. Older app builds did
// not know about paintPurchasing/paintCosting, so an unrelated stale full-state
// save must never erase a PO, received-price update, return, audit row or costing.
function preservePaintPurchasingHistory(candidate: any, current: any): any {
  const existing = current?.paintPurchasing;
  const incoming = candidate?.paintPurchasing && typeof candidate.paintPurchasing === "object"
    ? candidate.paintPurchasing : {};
  if (existing && typeof existing === "object") {
    for (const key of ["orders","audit"] as const) {
      const nextRows = Array.isArray(incoming?.[key]) ? incoming[key] : [];
      const serverRows = Array.isArray(existing?.[key]) ? existing[key] : [];
      const identity = (row:any) => row?.id ? "id:"+String(row.id) : "json:"+JSON.stringify(row);
      const byId = new Map(nextRows.map((row:any,index:number)=>[identity(row),index]));
      for (const row of serverRows) {
        const id=identity(row);
        if (!byId.has(id)) {
          byId.set(id,nextRows.length);
          nextRows.push(cloneValue(row));
          continue;
        }
        if (key !== "orders") continue;
        const idx=byId.get(id)!;
        const incomingRow:any=nextRows[idx] || {};
        const serverCorrected=Number(row?.correctedAt||0),incomingCorrected=Number(incomingRow?.correctedAt||0);
        if (row?.voided || serverCorrected>incomingCorrected) {
          nextRows[idx]=cloneValue(row);
        }
      }
      if (nextRows.length || serverRows.length || Array.isArray(incoming?.[key])) incoming[key]=nextRows;
    }
    incoming.schemaVersion=Math.max(Number(incoming.schemaVersion||0),Number(existing.schemaVersion||0),1);
    candidate.paintPurchasing=incoming;
  }
  const serverCost=current?.paintCosting && typeof current.paintCosting==="object" ? current.paintCosting : {};
  const incomingCost=candidate?.paintCosting && typeof candidate.paintCosting==="object" ? candidate.paintCosting : {};
  if (Object.keys(serverCost).length || Object.keys(incomingCost).length) {
    candidate.paintCosting={...cloneValue(serverCost),...cloneValue(incomingCost)};
  }
  return candidate;
}


function validatePaintManagerCorrections(candidate,current,user) {
  const oldOrders=new Map((current?.paintPurchasing?.orders||[]).filter((o:any)=>o?.id).map((o:any)=>[String(o.id),o]));
  const newOrders=new Map((candidate?.paintPurchasing?.orders||[]).filter((o:any)=>o?.id).map((o:any)=>[String(o.id),o]));
  for(const [id,before] of oldOrders){
    const after:any=newOrders.get(id);
    if(!after) continue;
    if(before?.voided!==true && after?.voided===true){
      if(String(user?.role||'')!=='Manager' || String(after?.cancelledBy||'')!==String(user?.id||'') || !String(after?.cancelReason||'').trim()) return 'manager_required_to_cancel_paint_po';
    }
    const oldReturns=new Map((before?.returns||[]).filter((x:any)=>x?.id).map((x:any)=>[String(x.id),x]));
    const newReturns=new Map((after?.returns||[]).filter((x:any)=>x?.id).map((x:any)=>[String(x.id),x]));
    for(const [rid,oldReturn] of oldReturns){
      const next:any=newReturns.get(rid);
      if(!next || same(oldReturn,next)) continue;
      if(String(user?.role||'')!=='Manager') return 'manager_required_to_edit_paint_return';
      if(next?.voided===true){
        if(String(next?.cancelledBy||'')!==String(user?.id||'') || !String(next?.cancelReason||'').trim()) return 'paint_return_cancel_reason_required';
      }else{
        if(String(next?.correctedBy||'')!==String(user?.id||'') || !String(next?.correctionReason||'').trim()) return 'paint_return_correction_reason_required';
      }
    }
  }
  return null;
}

// Derived cost projection follows staff authorization so unrelated employee saves stay valid.
function reconcilePaintOrderCosts(candidate: any): any {
  for (const no of new Set((candidate.paintPurchasing?.orders || []).map((o:any)=>String(o?.jobCard || "")).filter(Boolean))) {
    const cost=paintOrderRules.costForJob(candidate.paintPurchasing.orders,no);
    candidate.paintCosting=candidate.paintCosting || {};
    const job=(candidate.jobs || []).find((j:any)=>String(j.no)===no);
    if (!cost) {
      delete candidate.paintCosting[no];
      if(job) job.paintCost=0;
      continue;
    }
    candidate.paintCosting[no]={...cost,updatedAt:candidate.paintCosting[no]?.updatedAt || Date.now()};
    if(job) job.paintCost=cost.netPaintCost;
  }
  return candidate;
}

// A full-state client can carry an old snapshot while saving an unrelated change.
// Keep prior records unless a Manager records an explicit, reasoned Job Card deletion.
function preserveLeaveAuthority(candidate: any, current: any, user: any): any {
  const incoming = Array.isArray(candidate?.leaves) ? candidate.leaves : [];
  const currentRows = Array.isArray(current?.leaves) ? current.leaves : [];
  const byId = new Map(incoming.filter((x:any)=>x?.id!=null).map((x:any)=>[String(x.id),x]));
  for (const serverRow of currentRows) {
    if (!serverRow?.id) continue;
    const id=String(serverRow.id), proposed:any=byId.get(id);
    if (!proposed) {
      // Leave deletion is never a valid workflow action. Cancellation is explicit
      // and audited, so a stale full-state client cannot make a leave disappear.
      incoming.push(cloneValue(serverRow));byId.set(id,incoming[incoming.length-1]);continue;
    }
    // Only a Manager may alter an existing leave record. Everyone else keeps the
    // server-confirmed version; Manager edits/cancellations remain explicit.
    if (!same(proposed,serverRow) && String(user?.role||"")!=="Manager") {
      const i=incoming.indexOf(proposed);if(i>=0)incoming[i]=cloneValue(serverRow);byId.set(id,incoming[i]);
    }
  }
  candidate.leaves=incoming;
  const audit=Array.isArray(candidate?.leaveAudit)?candidate.leaveAudit:[];
  const seen=new Set(audit.map((x:any)=>String(x?.id||"")||JSON.stringify(x)));
  for(const row of Array.isArray(current?.leaveAudit)?current.leaveAudit:[]){
    const id=String(row?.id||"")||JSON.stringify(row);if(!seen.has(id)){audit.push(cloneValue(row));seen.add(id)}
  }
  candidate.leaveAudit=audit;
  return candidate;
}

function preserveOperationalHistory(candidate: any, current: any, user: any): any {
  const earlier = new Set((current?.jobDeletes || []).map((x: any) => String(x?.job || "") + ":" + String(x?.deletedAt || "")));
  const deletedJobs = new Set((candidate?.jobDeletes || []).filter((x: any) =>
    user?.role === "Manager" && String(x?.deletedBy || "") === String(user?.id || "") &&
    String(x?.reason || "").trim() && !earlier.has(String(x?.job || "") + ":" + String(x?.deletedAt || ""))
  ).map((x: any) => String(x.job)));
  // An explicit Manager deletion wins even if another device edited the job
  // after the deleting device loaded its snapshot.
  if (deletedJobs.size) {
    for (const [key, job] of [["jobs", "no"], ["assign", "job"], ["sessions", "job"]] as const) {
      candidate[key] = (Array.isArray(candidate?.[key]) ? candidate[key] : [])
        .filter((record: any) => !deletedJobs.has(String(record?.[job] || "")));
    }
  }
  for (const [key, identity, job] of [
    ["jobs", "no", "no"], ["assign", "id", "job"], ["sessions", "id", "job"]
  ] as const) {
    const incoming = Array.isArray(candidate?.[key]) ? candidate[key] : [];
    const seen = new Set(incoming.map((x: any) => String(x?.[identity] || "")));
    for (const record of Array.isArray(current?.[key]) ? current[key] : []) {
      const id = String(record?.[identity] || "");
      if (id && !seen.has(id) && !deletedJobs.has(String(record?.[job] || ""))) {
        incoming.push(cloneValue(record));
        seen.add(id);
      }
    }
    candidate[key] = incoming;
  }
  // Audit entries are append-only. Some legacy audit arrays have no record ID,
  // so compare their full values when recovering them from a stale save.
  for (const key of ["dutyEndAudit", "jobVehicleEdits", "statusCorrections", "suggestedEdits", "jobEdits", "jobDeletes", "additionalActions"] as const) {
    const incoming = Array.isArray(candidate?.[key]) ? candidate[key] : [];
    const seen = new Set(incoming.map((x: any) => JSON.stringify(x)));
    for (const record of Array.isArray(current?.[key]) ? current[key] : []) {
      const identity = JSON.stringify(record);
      if (!seen.has(identity)) {
        incoming.push(cloneValue(record));
        seen.add(identity);
      }
    }
    if (incoming.length || Array.isArray(current?.[key])) candidate[key] = incoming;
  }
  const previousReopens = new Set((current?.reopenLogs || []).map((x: any) => String(x?.id || "")));
  const allowedReopens = new Set((candidate?.reopenLogs || []).filter((x: any) =>
    ["Supervisor", "Manager"].includes(String(user?.role || "")) &&
    String(x?.by || "") === String(user?.id || "") && x?.assignmentId && x?.id &&
    !previousReopens.has(String(x.id))
  ).map((x: any) => String(x.assignmentId)));
  const latestAssignments = new Map((current?.assign || []).filter((x: any) => x?.id).map((x: any) => [String(x.id), x]));
  candidate.assign = (candidate.assign || []).map((x: any) => {
    const earlier: any = latestAssignments.get(String(x?.id || ""));
    if (earlier?.completed === true && x?.completed !== true && !allowedReopens.has(String(x.id))) {
      return {...x, completed: true, completedAt: earlier.completedAt};
    }
    return x;
  });
  const completed = new Set(candidate.assign.filter((x: any) => x?.completed === true).map((x: any) => String(x.id)));
  candidate.sessions = (candidate.sessions || []).filter((s: any) =>
    s?.end != null || !completed.has(String(s?.assignmentId || "")) || allowedReopens.has(String(s.assignmentId))
  );
  return candidate;
}

function threeWayMerge(base: any, remote: any, local: any, path = ""): any {
  if (same(local, base)) return cloneValue(remote);
  if (same(remote, base)) return cloneValue(local);

  if (Array.isArray(base) || Array.isArray(remote) || Array.isArray(local)) {
    const b = Array.isArray(base) ? base : [];
    const r = Array.isArray(remote) ? remote : [];
    const l = Array.isArray(local) ? local : [];
    const all = [...b, ...r, ...l];
    const key=path==='jobs'?'no':'id';
    const keyed=all.every(x=>x==null || (typeof x==='object' && !Array.isArray(x) && x[key]!=null));
    const index=(rows:any[])=>{
      const counts=new Map<string,number>(), out=new Map<string,any>();
      for(const x of rows){
        if(x==null)continue;
        const raw=keyed?String(x[key]):JSON.stringify(x);
        const n=counts.get(raw)||0;counts.set(raw,n+1);
        out.set(keyed?raw:raw+'#'+n,x);
      }
      return out;
    };
    const bm=index(b),rm=index(r),lm=index(l);
    const ids = [...new Set([...bm.keys(), ...rm.keys(), ...lm.keys()])];
    const out:any[] = [];

    for (const id of ids) {
      const bv = bm.get(id), rv = rm.get(id), lv = lm.get(id);
      if (bv === undefined) {
        if (rv !== undefined && lv !== undefined) out.push(threeWayMerge({}, rv, lv, path));
        else if (lv !== undefined) out.push(cloneValue(lv));
        else if (rv !== undefined) out.push(cloneValue(rv));
        continue;
      }
      if (lv === undefined && rv === undefined) continue;
      if (lv === undefined) {
        if (same(rv, bv)) continue;
        out.push(cloneValue(rv));
        continue;
      }
      if (rv === undefined) {
        if (same(lv, bv)) continue;
        out.push(cloneValue(lv));
        continue;
      }
      out.push(threeWayMerge(bv, rv, lv, path));
    }
    return out;
  }

  const bObj = base && typeof base === "object";
  const rObj = remote && typeof remote === "object";
  const lObj = local && typeof local === "object";
  if (bObj && rObj && lObj) {
    const out:any = {};
    const keys = new Set([...Object.keys(base||{}), ...Object.keys(remote||{}), ...Object.keys(local||{})]);
    for (const k of keys) {
      const bv = base?.[k], rv = remote?.[k], lv = local?.[k];
      if (lv === undefined && rv === undefined) continue;
      if (lv === undefined) {
        if (same(rv, bv)) continue;
        out[k] = cloneValue(rv);
        continue;
      }
      if (rv === undefined) {
        if (same(lv, bv)) continue;
        out[k] = cloneValue(lv);
        continue;
      }
      out[k] = threeWayMerge(bv, rv, lv, path ? path+"."+k : k);
    }
    return out;
  }

  return cloneValue(local);
}

async function authorizeV2Event(user: any, event: any) {
  const type=String(event.type), payload=event.payload || {}, role=String(user.role);
  const employee=String(payload.employeeId || payload.emp || '');
  if (payload.actorId && String(payload.actorId)!==String(user.id)) return false;
  // Exact duplicate replays remain valid even after an assignment is finished.
  const {data: prior,error: priorError}=await admin.from('workshop_v2_events').select('actor_id').eq('event_id',String(event.eventId)).maybeSingle();
  if(priorError)throw priorError;
  if(prior)return String(prior.actor_id)===String(user.id);
  if (['WORK_START','WORK_PAUSE','WORK_RESUME','WORK_FINISH','ID001_START','ID001_STOP'].includes(type)) {
    if (!['Employee','Manager','Supervisor'].includes(role) || !employee || (role==='Employee' && employee!==String(user.id))) return false;
    const time=event.clientTime?Date.parse(event.clientTime):Date.now();
    if (!validTime(time)) return false;
    if (type==='WORK_START' || type==='ID001_START') {
      const {data: snapshot,error}=await admin.from('workshop_state').select('data').eq('id','main').single();
      if(error)throw error;
      const a=(snapshot?.data?.assign || []).find((a:any)=>String(a.id)===String(event.entityId) && a.emp===employee && a.job===String(payload.jobCard||payload.job||'') && !a.cancelled && !a.completed);
      // V2 assignments may not be represented in the legacy snapshot.
      const {data: v2,error: aError}=await admin.from('workshop_v2_assignments').select('assignment_id,employee_id,job_card,status,suggested_minutes,assigned_at').eq('assignment_id',String(event.entityId)).maybeSingle();
      if(aError)throw aError;
      const v2Match=v2 && v2.employee_id===employee && v2.job_card===String(payload.jobCard||payload.job||'') && v2.status==='ASSIGNED';
      if(!a && !v2Match)return false;
      const allocated=Number(a?.suggested ?? v2?.suggested_minutes ?? 0);
      if(type==='WORK_START' && Number(payload.suggestedMinutes||0)!==allocated)return false;
      if(a && time<Number(a.assignedAt||0))return false;
      return true;
    }
    const {data: current,error}=await admin.from('workshop_v2_work_sessions').select('employee_id,job_card').eq('session_id',String(event.entityId)).maybeSingle();
    if(error)throw error;
    return !!current && current.employee_id===employee && current.job_card===String(payload.jobCard||payload.job||'');
  }
  if (['PUBLIC_HOLIDAY_SET','PUBLIC_HOLIDAY_CLEARED'].includes(type)) return role==='Manager';
  if (['LEAVE_CREATED','LEAVE_UPDATED','LEAVE_CANCELLED'].includes(type)) {
    if (role==='Manager') return true;
    if (!employee || (role==='Employee' && (employee!==user.id || type!=='LEAVE_CREATED'))) return false;
    if (role==='Employee') return true;
    if (role!=='Supervisor') return false;
    const {data: target,error}=await admin.from('staff_credentials').select('role').eq('user_id',employee).maybeSingle();
    if(error)throw error;
    return employee===user.id || target?.role==='Employee';
  }
  if (type==='SPARE_PART_DENTER_NOTICE') return role==='Denter';
  if (type==='SPARE_PART_STATUS_CHANGED') {
    const to=String(payload.to||'');
    if (['ENQUIRY','QUOTED','ORDERED','RECEIVED'].includes(to)) return ['Manager','Purchaser'].includes(role);
    if (['SUPERVISOR_VERIFIED','SUPERVISOR_CONFIRMED'].includes(to)) return ['Manager','Supervisor'].includes(role);
    if (['FITTED','RETURNED','UNAVAILABLE','CUSTOMER_SETTLEMENT'].includes(to)) return ['Manager','Supervisor','Purchaser'].includes(role);
    return false;
  }
  if(type.startsWith('SPARE_PART'))return ['Manager','Supervisor','Purchaser'].includes(role);
  if(['CONSUMABLE_ISSUED','CONSUMABLE_ADDITIONAL','CONSUMABLE_ACTUAL'].includes(type))return ['Manager','Supervisor'].includes(role);
  if(type==='CONSUMABLE_VOIDED')return role==='Manager';
  return ['JOB_CREATED','JOB_UPDATED','JOB_STAGE_CHANGED','JOB_COMPLETED','JOB_REOPENED','JOB_ASSIGNED','REPEAT_ASSIGNED','REPEAT_COMPLETED','REPEAT_CANCELLED'].includes(type) && ['Manager','Supervisor'].includes(role);
}

async function baseStateForRevision(revision: number, currentRevision: number, currentData: any) {
  if (revision === currentRevision) return cloneValue(currentData);
  const { data, error } = await admin.from("workshop_state_history")
    .select("data").eq("revision", revision).maybeSingle();
  if (error) throw error;
  return data?.data ? cloneValue(data.data) : null;
}


function computeLiveStatus(data: any, revision: number, changedBy: string) {
  const users = Array.isArray(data?.users) ? data.users : [];
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const assignments = Array.isArray(data?.assign) ? data.assign : [];
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const assignmentById = new Map(assignments.filter((a:any)=>a?.id!=null).map((a:any)=>[String(a.id),a]));
  const jobByNo = new Map(jobs.filter((j:any)=>j?.no!=null).map((j:any)=>[String(j.no),j]));
  const assignmentOf = (s:any) => {
    if (!s) return null;
    if (s.assignmentId != null) {
      const direct = assignmentById.get(String(s.assignmentId));
      if (direct && !direct.cancelled) return direct;
    }
    return assignments
      .filter((a:any)=>a && a.emp===s.emp && a.job===s.job && !a.cancelled)
      .sort((a:any,b:any)=>(Number(b.assignedAt)||0)-(Number(a.assignedAt)||0))[0] || null;
  };
  return users.filter((u:any)=>u && u.role==="Employee").map((u:any)=>{
    const empSessions = sessions
      .filter((s:any)=>s && !s.cancelled && s.emp===u.id)
      .slice()
      .sort((a:any,b:any)=>(Number(b.start)||0)-(Number(a.start)||0) || String(b.id||"").localeCompare(String(a.id||"")));
    const open = empSessions.find((s:any)=>s.end==null) || null;
    let status = "Available";
    let s:any = null;
    let a:any = null;
    if (open) {
      s = open;
      a = assignmentOf(open);
      if (open.job==="ID001") status = "ID001";
      else if (!a || a.completed || a.cancelled) {
        s = null; a = null; status = "Available";
      } else {
        const overtime = open.overtime===true || open.autoOvertime===true || Number(open.overtimeStartedAt||0)>0;
        status = overtime ? "Overtime" : "Working";
      }
    } else {
      const latest = empSessions[0] || null;
      if (latest && latest.end!=null && latest.paused===true) {
        const pausedAssignment = assignmentOf(latest);
        if (pausedAssignment && !pausedAssignment.completed && !pausedAssignment.cancelled) {
          s = latest;
          a = pausedAssignment;
          status = "Paused";
        }
      }
    }
    const j:any = s ? (jobByNo.get(String(s.job)) || {}) : {};
    return {
      employee_id: String(u.id),
      employee_name: String(u.name || u.id),
      department: String(u.department || ""),
      status,
      job_no: s ? String(s.job || "") : "",
      assignment_id: a?.id != null ? String(a.id) : "",
      session_id: s?.id != null ? String(s.id) : "",
      session_start: s?.start != null ? Number(s.start) : null,
      suggested_minutes: a?.suggested != null ? Number(a.suggested) : 0,
      vehicle: String(j.vehicle || ""),
      registration: String(j.reg || ""),
      overtime: status==="Overtime",
      state_revision: revision,
      updated_by: changedBy
    };
  });
}

async function loadAuthoritativeLiveStatus() {
  const { data: current, error: stateError } = await admin.from("workshop_state")
    .select("revision,data,updated_at,updated_by").eq("id","main").single();
  if (stateError) throw stateError;
  const revision = Number(current.revision || 0);
  const expected = computeLiveStatus(current.data || {}, revision, String(current.updated_by || ""));
  const expectedIds = new Set(expected.map((x:any)=>String(x.employee_id)));
  let { data: rows, error } = await admin.from("workshop_live_status")
    .select("employee_id,employee_name,department,status,job_no,assignment_id,session_id,session_start,suggested_minutes,vehicle,registration,overtime,state_revision,updated_at,updated_by")
    .order("employee_name",{ascending:true});
  if (error) throw error;
  const comparable = (r:any) => ({
    employee_id: String(r?.employee_id || ""),
    employee_name: String(r?.employee_name || ""),
    department: String(r?.department || ""),
    status: String(r?.status || ""),
    job_no: String(r?.job_no || ""),
    assignment_id: String(r?.assignment_id || ""),
    session_id: String(r?.session_id || ""),
    session_start: r?.session_start == null ? null : Number(r.session_start),
    suggested_minutes: Number(r?.suggested_minutes || 0),
    vehicle: String(r?.vehicle || ""),
    registration: String(r?.registration || ""),
    overtime: r?.overtime === true,
    state_revision: Number(r?.state_revision || 0)
  });
  const expectedById = new Map(expected.map((x:any)=>[String(x.employee_id),x]));
  const stale = !rows || rows.length!==expected.length || rows.some((r:any)=>{
    const e = expectedById.get(String(r.employee_id));
    return !e || JSON.stringify(comparable(r)) !== JSON.stringify(comparable(e));
  });
  if (stale) {
    if (expected.length) {
      const { error: upsertError } = await admin.from("workshop_live_status").upsert(expected,{onConflict:"employee_id"});
      if (upsertError) throw upsertError;
    }
    const existingIds = new Set((rows||[]).map((r:any)=>String(r.employee_id)));
    const staleIds = [...existingIds].filter(id=>!expectedIds.has(id));
    if (staleIds.length) {
      const { error: deleteError } = await admin.from("workshop_live_status").delete().in("employee_id",staleIds);
      if (deleteError) throw deleteError;
    }
    const refreshed = await admin.from("workshop_live_status")
      .select("employee_id,employee_name,department,status,job_no,assignment_id,session_id,session_start,suggested_minutes,vehicle,registration,overtime,state_revision,updated_at,updated_by")
      .order("employee_name",{ascending:true});
    if (refreshed.error) throw refreshed.error;
    rows = refreshed.data || [];
  }
  return { revision, rows: rows || [], updated_at: current.updated_at, updated_by: current.updated_by };
}


function employeeTimeTransition(data:any,user:any,body:any,serverNow:number){
  if(String(user?.role||"")!=="Employee") return {ok:false,code:"employee_time_forbidden"};
  const type=String(body?.event_type||"").toUpperCase();
  if(!["START","PAUSE","FINISH","STOP_ID001"].includes(type)) return {ok:false,code:"employee_time_action_invalid"};
  const actionId=String(body?.action_id||"").trim();
  if(!actionId) return {ok:false,code:"employee_time_action_id_required"};
  const next=cloneValue(data||{});
  next.sessions=Array.isArray(next.sessions)?next.sessions:[];
  next.assign=Array.isArray(next.assign)?next.assign:[];
  next.jobs=Array.isArray(next.jobs)?next.jobs:[];
  next.employeeTimeActionAudit=Array.isArray(next.employeeTimeActionAudit)?next.employeeTimeActionAudit:[];
  next.lastActions=next.lastActions&&typeof next.lastActions==="object"?next.lastActions:{};

  const prior=next.employeeTimeActionAudit.find((x:any)=>String(x?.id||"")===actionId);
  if(prior) return {ok:true,duplicate:true,data:next,audit:prior,status:String(prior.status||"")};

  const emp=String(user.id);
  const requestedJob=String(body?.job||"").trim();
  const requestedAssignment=String(body?.assignment_id||"").trim();
  const requestedSession=String(body?.session_id||"").trim();
  const ownAssignments=next.assign.filter((a:any)=>a&&String(a.emp)===emp&&!a.cancelled);
  const openSessions=next.sessions.filter((s:any)=>s&&String(s.emp)===emp&&s.end==null&&!s.cancelled);
  const findAssignment=()=>ownAssignments.find((a:any)=>requestedAssignment&&String(a.id)===requestedAssignment)
    || ownAssignments.filter((a:any)=>!a.completed&&(!requestedJob||String(a.job)===requestedJob))
      .sort((a:any,b:any)=>Number(b.assignedAt||0)-Number(a.assignedAt||0))[0] || null;
  const findSession=()=>openSessions.find((s:any)=>requestedSession&&String(s.id)===requestedSession)
    || openSessions.find((s:any)=>!requestedJob||String(s.job)===requestedJob)
    || (requestedSession?next.sessions.find((s:any)=>s&&String(s.emp)===emp&&String(s.id)===requestedSession):null)
    || null;

  let session:any=null,assignment:any=null,status="";
  if(type==="START"){
    if(openSessions.length){
      const already=openSessions.find((s:any)=>(!requestedJob||String(s.job)===requestedJob)&&(!requestedAssignment||String(s.assignmentId||"")===requestedAssignment));
      if(already){
        session=already;
        assignment=ownAssignments.find((a:any)=>String(a.id)===String(already.assignmentId||""))||null;
        status=String(already.job)==="ID001"?"ID001":"Working";
      }else return {ok:false,code:"employee_time_already_active"};
    }else{
      assignment=findAssignment();
      if(!assignment||assignment.completed||assignment.cancelled) return {ok:false,code:"employee_time_assignment_not_open"};
      const job=String(assignment.job||requestedJob);
      const sid=String(body?.new_session_id||"").trim()||crypto.randomUUID();
      session={id:sid,assignmentId:String(assignment.id),job,emp,start:serverNow,end:null,paused:false,finished:false,rework:assignment.rework===true,v79Integrity:true,serverAuthoritative:true,serverStartedAt:serverNow};
      if(job==="ID001"){session.idealCard=true;session.idealSafeVersion=1}
      next.sessions.push(session);
      status=job==="ID001"?"ID001":"Working";
      next.lastActions[emp]={text:"Started "+job,at:serverNow};
    }
  }else{
    session=findSession();
    if(!session) return {ok:false,code:"employee_time_no_session"};
    assignment=ownAssignments.find((a:any)=>String(a.id)===String(session.assignmentId||""))
      || ownAssignments.filter((a:any)=>String(a.job)===String(session.job)).sort((a:any,b:any)=>Number(b.assignedAt||0)-Number(a.assignedAt||0))[0] || null;
    if(session.end!=null){
      if(type==="PAUSE"&&session.paused===true) status="Paused";
      else if((type==="FINISH"||type==="STOP_ID001")&&session.finished===true) status="Available";
      else return {ok:false,code:"employee_time_session_closed"};
    }else if(type==="PAUSE"){
      if(String(session.job)==="ID001") return {ok:false,code:"employee_time_id001_pause_forbidden"};
      session.end=serverNow;session.paused=true;session.finished=false;session.pauseReason=String(body?.reason||"").trim().slice(0,240);
      session.serverPausedAt=serverNow;session.serverAuthoritative=true;
      status="Paused";next.lastActions[emp]={text:"Paused "+String(session.job),at:serverNow};
    }else{
      if(type==="STOP_ID001"&&String(session.job)!=="ID001") return {ok:false,code:"employee_time_not_id001"};
      session.end=serverNow;session.finished=true;session.paused=false;session.serverFinishedAt=serverNow;session.serverAuthoritative=true;
      if(assignment){assignment.completed=true;assignment.completedAt=serverNow;assignment.cancelled=false}
      if(String(session.job)!=="ID001"){
        const related=next.assign.filter((a:any)=>a&&!a.cancelled&&String(a.job)===String(session.job));
        const done=related.length>0&&related.every((a:any)=>a.completed===true);
        const j=next.jobs.find((j:any)=>j&&String(j.no)===String(session.job));
        if(j){j.status=done?"Completed":"Open";if(done)j.completedAt=Math.max(...related.map((a:any)=>Number(a.completedAt||0)),serverNow);else delete j.completedAt}
      }
      status="Available";next.lastActions[emp]={text:(String(session.job)==="ID001"?"Stopped ":"Finished ")+String(session.job),at:serverNow};
    }
  }

  const audit={
    id:actionId,type,emp,job:String(session?.job||requestedJob||""),assignmentId:String(assignment?.id||session?.assignmentId||requestedAssignment||""),
    sessionId:String(session?.id||requestedSession||""),clientAt:Number(body?.client_time||0)||null,serverAt:serverNow,status,
    confirmed:true,deviceId:String(body?.device_id||"").slice(0,160)
  };
  next.employeeTimeActionAudit.push(audit);
  if(next.employeeTimeActionAudit.length>5000)next.employeeTimeActionAudit=next.employeeTimeActionAudit.slice(-5000);
  return {ok:true,data:next,audit,status,session,assignment};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ ok: false, code: "method" }, 405);
  if (!allowedApiKey(req)) return reply({ ok: false, code: "bad_api_key" }, 401);

  const token = req.headers.get("x-zukait-session") || "";
  const user = await sessionUser(token);
  if (!user) return reply({ ok: false, code: "invalid_session" }, 401);

  try {
    const body = await req.json();
    const action = String(body?.action || "load");

    if (action === "employee_time_action") {
      for(let attempt=0;attempt<8;attempt++){
        const {data:current,error:readError}=await admin.from("workshop_state").select("revision,data").eq("id","main").single();
        if(readError)throw readError;
        const result:any=employeeTimeTransition(current.data,user,body,Date.now());
        if(!result.ok)return reply({ok:false,code:result.code,server_time:Date.now()},result.code==="employee_time_forbidden"?403:409);
        if(result.duplicate)return reply({ok:true,duplicate:true,status:result.status,audit:result.audit,server_revision:current.revision,server_time:Date.now()});
        const nextRevision=Number(current.revision||0)+1;
        const live=computeLiveStatus(result.data,nextRevision,String(user.id));
        const {data:committed,error:commitError}=await admin.rpc("zukait_commit_workshop_state_v2",{
          p_expected_revision:Number(current.revision||0),p_data:result.data,p_changed_by:String(user.id),p_live:live
        });
        if(commitError)throw commitError;
        if(committed?.ok){
          const row=live.find((x:any)=>String(x.employee_id)===String(user.id))||null;
          return reply({ok:true,status:row?.status||result.status,job_no:row?.job_no||"",session_id:row?.session_id||"",assignment_id:row?.assignment_id||"",audit:result.audit,server_revision:committed.revision||nextRevision,server_time:Date.now()});
        }
        if(committed?.code!=="conflict")return reply({ok:false,code:committed?.code||"employee_time_commit_failed"},409);
      }
      return reply({ok:false,code:"employee_time_conflict"},409);
    }

    if (action === "time_management") {
      for (let attempt=0;attempt<8;attempt++) {
        const {data:current,error:readError}=await admin.from("workshop_state").select("revision,data").eq("id","main").single();
        if(readError)throw readError;
        const result=timeManagementTransition(current.data,user,body,Date.now());
        if(!result.ok)return reply({ok:false,code:result.code},result.code==="time_permission_denied"?403:409);
        if(result.duplicate)return reply({ok:true,audit:result.audit,duplicate:true,server_revision:current.revision});
        const next=Number(current.revision||0)+1;
        const {data:committed,error:commitError}=await admin.rpc("zukait_commit_workshop_state_v2",{p_expected_revision:Number(current.revision||0),p_data:result.data,p_changed_by:user.id,p_live:computeLiveStatus(result.data,next,user.id)});
        if(commitError)throw commitError;
        if(committed?.ok)return reply({ok:true,audit:result.audit,server_revision:committed.revision||next});
        if(committed?.code!=="conflict")return reply({ok:false,code:committed?.code||"time_commit_failed"},409);
      }
      return reply({ok:false,code:"time_conflict"},409);
    }

    if (action === "qc_delivery") {
      for (let attempt=0;attempt<8;attempt++) {
        const {data:current,error:readError}=await admin.from("workshop_state").select("revision,data").eq("id","main").single();
        if(readError)throw readError;
        const result=qcTransition(current.data,user,body,Date.now());
        if(!result.ok)return reply({ok:false,code:result.code},result.code==="qc_permission_denied"?403:409);
        const next=Number(current.revision||0)+1;
        const {data:committed,error:commitError}=await admin.rpc("zukait_commit_workshop_state_v2",{p_expected_revision:Number(current.revision||0),p_data:result.data,p_changed_by:user.id,p_live:computeLiveStatus(result.data,next,user.id)});
        if(commitError)throw commitError;
        if(committed?.ok)return reply({ok:true,job:result.job,server_revision:committed.revision||next});
      }
      return reply({ok:false,code:"qc_conflict"},409);
    }

    if (action === "revision") {
      const { data, error } = await admin.from("workshop_state")
        .select("revision,updated_at,updated_by").eq("id","main").single();
      if (error) throw error;
      return reply({ ok:true, ...data, server_time:Date.now(), user });
    }

    if (action === "load") {
      const { data, error } = await admin.from("workshop_state")
        .select("revision,data,updated_at,updated_by").eq("id","main").single();
      if (error) throw error;
      return reply({ ok: true, ...data, user });
    }

    if (action === "live_status") {
      const live = await loadAuthoritativeLiveStatus();
      const rows = String(user.role || "") === "Employee"
        ? (live.rows || []).filter((r:any)=>String(r?.employee_id || "") === String(user.id || ""))
        : live.rows;
      return reply({ ok: true, ...live, rows, server_time: Date.now(), user });
    }

    if (action === "v2_pilot_status") {
      if (String(user.role || "") !== "Manager") return reply({ok:false,code:"forbidden"},403);
      const deviceId=String(body?.device_id||"").trim();
      if(!deviceId) return reply({ok:false,code:"device_id_required"},400);
      const {data,error}=await admin.from("workshop_v2_pilot").select("device_id,actor_id,active,claimed_at").eq("id","manager-pilot").maybeSingle();
      if(error) throw error;
      return reply({ok:true,claimed:!!data,active:data?.active===true,is_pilot:!!data&&data.active===true&&String(data.device_id)===deviceId,claimed_at:data?.claimed_at||null,user});
    }

    if (action === "v2_pilot_claim") {
      if (String(user.role || "") !== "Manager") return reply({ok:false,code:"forbidden"},403);
      const deviceId=String(body?.device_id||"").trim();
      if(!deviceId) return reply({ok:false,code:"device_id_required"},400);
      const {data,error}=await admin.rpc("zukait_v2_claim_manager_pilot",{p_device_id:deviceId,p_actor_id:String(user.id)});
      if(error) throw error;
      const row=Array.isArray(data)?data[0]:data;
      return reply({ok:true,is_pilot:row?.is_pilot===true,active:row?.active===true,claimed_at:row?.claimed_at||null,user});
    }

    if (action === "v2_allocate_spare_part_list") {
      if (!["Manager","Supervisor"].includes(String(user.role || ""))) return reply({ok:false,code:"forbidden"},403);
      const jobCard=String(body?.job_card||"").trim().toUpperCase();
      const clientKey=String(body?.client_key||"").trim();
      if(!jobCard) return reply({ok:false,code:"job_card_required"},400);
      if(!clientKey) return reply({ok:false,code:"client_key_required"},400);
      const {data:workshop,error:workshopError}=await admin.from("workshop_state").select("data").eq("id","main").single();
      if(workshopError) throw workshopError;
      const existingJob=(Array.isArray(workshop?.data?.jobs)?workshop.data.jobs:[]).find((j:any)=>String(j?.no||"").trim().toUpperCase()===jobCard);
      if(!existingJob) return reply({ok:false,code:"job_card_not_found"},404);
      const {data,error}=await admin.rpc("zukait_v2_allocate_spare_part_list",{p_job_card:jobCard,p_actor_id:String(user.id),p_client_key:clientKey});
      if(error){console.error("spare_part_allocator_failed",error);return reply({ok:false,code:"spare_part_allocator_unavailable"},503);}
      const row=Array.isArray(data)?data[0]:data;
      if(!row?.list_no) return reply({ok:false,code:"allocation_failed"},409);
      return reply({ok:true,list:{...row,vehicle:existingJob.vehicle||existingJob.make||"",model:existingJob.model||"",year:existingJob.year||"",registration:existingJob.reg||existingJob.registration||""},user});
    }

    if (action === "v2_allocate_estimate_no") {
      if (!["Manager","Supervisor"].includes(String(user.role || ""))) return reply({ok:false,code:"forbidden"},403);
      const clientKey=String(body?.client_key||"").trim();
      if(!clientKey) return reply({ok:false,code:"client_key_required"},400);
      const {data,error}=await admin.rpc("zukait_v2_allocate_estimate_no",{p_actor_id:String(user.id),p_client_key:clientKey});
      if(error) throw error;
      const row=Array.isArray(data)?data[0]:data;
      if(!row?.estimate_no) return reply({ok:false,code:"allocation_failed"},409);
      return reply({ok:true,estimate:row,user});
    }

    if (action === "v2_commit_event") {
      const event = body?.event && typeof body.event === "object" ? body.event : null;
      if (!event || !String(event.eventId || "").trim() || !String(event.entityId || "").trim() || !String(event.type || "").trim()) {
        return reply({ ok:false, code:"bad_event" },400);
      }
      const eventId = String(event.eventId).trim();
      const entityId = String(event.entityId).trim();
      const eventType = String(event.type).trim();
      if (["WORK_START","WORK_PAUSE","WORK_RESUME","WORK_FINISH","ID001_START","ID001_STOP","PUBLIC_HOLIDAY_SET","PUBLIC_HOLIDAY_CLEARED","LEAVE_CREATED","LEAVE_UPDATED","LEAVE_CANCELLED"].includes(eventType) && !await authorizeV2Event(user,event))return reply({ok:false,code:"event_forbidden"},403);
      const callerRole=String(user?.role||"");
      if (eventType==="JOB_CREATED" && !["Manager","Supervisor"].includes(callerRole)) {
        return reply({ok:false,code:"job_create_forbidden"},403);
      }
      if (callerRole==="Denter" && eventType.startsWith("SPARE_PART") && eventType!=="SPARE_PART_DENTER_NOTICE") {
        return reply({ok:false,code:"denter_spare_parts_read_only"},403);
      }
      if (eventType==="SPARE_PART_DENTER_NOTICE" && callerRole!=="Denter") {
        return reply({ok:false,code:"denter_notice_forbidden"},403);
      }
      if (eventType==="SPARE_PART_LIST_CREATED") {
        const p=event.payload && typeof event.payload==="object" && !Array.isArray(event.payload) ? event.payload : {};
        const allowedKeys=new Set(["jobCard","partId","listNo","vehicle","registration","model","year","customer","targetRole"]);
        const invalidKey=Object.keys(p).some(k=>!allowedKeys.has(k));
        const invalidIdentity=!String(p.jobCard||"").trim()||!String(p.listNo||"").trim()||String(p.partId||"")!==String(p.listNo||"");
        const invalidTargetRole=String(p.targetRole||"")!=="Purchaser";
        const invalidYear=p.year!=null&&p.year!==""&&(!/^\d{4}$/.test(String(p.year))||Number(p.year)<1900||Number(p.year)>2100);
        if (!["Manager","Supervisor"].includes(callerRole) || invalidKey || invalidIdentity || invalidTargetRole || invalidYear) {
          return reply({ok:false,code:"spare_list_create_forbidden_or_invalid"},403);
        }
      }
      if (eventType==="SPARE_PART_LISTED") {
        const p=event.payload && typeof event.payload==="object" && !Array.isArray(event.payload) ? event.payload : {};
        const allowedKeys=new Set(["partId","listNo","jobCard","name","partNo","qty","targetRole"]);
        const invalidKey=Object.keys(p).some(k=>!allowedKeys.has(k));
        const qty=Number(p.qty);
        const invalidIdentity=!String(p.partId||"").trim()||!String(p.listNo||"").trim()||!String(p.jobCard||"").trim();
        const invalidName=!String(p.name||"").trim();
        const invalidQty=!Number.isInteger(qty)||qty<=0||qty>100000;
        const invalidTargetRole=String(p.targetRole||"")!=="Purchaser";
        if (!["Manager","Supervisor"].includes(callerRole) || invalidKey || invalidIdentity || invalidName || invalidQty || invalidTargetRole) {
          return reply({ok:false,code:"spare_part_create_forbidden_or_invalid"},403);
        }
      }
      if (eventType==="SPARE_PART_ITEM_EDITED") {
        const p=event.payload && typeof event.payload==="object" ? event.payload : {};
        const before=p.before && typeof p.before==="object" && !Array.isArray(p.before) ? p.before : {};
        const after=p.after && typeof p.after==="object" && !Array.isArray(p.after) ? p.after : {};
        const allowedPayloadKeys=new Set(["partId","listNo","jobCard","reason","before","after"]);
        const allowedAfterKeys=new Set(["deletedAt","deletedBy"]);
        const invalidPayloadKey=Object.keys(p).some(k=>!allowedPayloadKeys.has(k));
        const invalidAfterKey=Object.keys(after).some(k=>!allowedAfterKeys.has(k));
        const deletionOnly=Object.keys(after).length>0&&Object.keys(after).every(k=>allowedAfterKeys.has(k));
        const invalidDeletedAt=!String(after.deletedAt||"").trim()||Number.isNaN(Date.parse(String(after.deletedAt||"")));
        const invalidDeletedBy=String(after.deletedBy||"")!==String(user.id);
        if (!["Manager","Supervisor"].includes(callerRole) || !String(p.partId||"") || !String(p.listNo||"") || !String(p.jobCard||"") || !String(p.reason||"").trim() || !Object.keys(before).length || invalidPayloadKey || invalidAfterKey || !deletionOnly || invalidDeletedAt || invalidDeletedBy) {
          return reply({ok:false,code:"spare_item_edit_forbidden_or_invalid"},403);
        }
      }
      if (eventType==="SPARE_PART_MANAGER_CORRECTED" || eventType==="SPARE_PART_SUPERVISOR_CORRECTED") {
        const p=event.payload && typeof event.payload==="object" ? event.payload : {};
        const before=p.before && typeof p.before==="object" ? p.before : {};
        const after=p.after && typeof p.after==="object" ? p.after : {};
        const allowedStatuses=new Set(["LISTED","ENQUIRY","QUOTED","ORDERED","RECEIVED","SUPERVISOR_VERIFIED","SUPERVISOR_CONFIRMED","FITTED","RETURNED","UNAVAILABLE","CUSTOMER_SETTLEMENT"]);
        const allowedAfterKeys=new Set(["name","partNo","qty","supplier","purchaseAmount","finalPrice","purchaseRecordedAt","status"]);
        const allowedBeforeKeys=new Set(["name","partNo","qty","supplier","purchaseAmount","status","editRevision","updatedAt","updatedBy","managerCorrectionReason","correctedByRole","receivedQty","supervisorVerifiedAt","denterCheckedAt","confirmedAt","fittedAt"]);
        const invalidAfterKey=Object.keys(after).some(k=>!allowedAfterKeys.has(k));
        const invalidBeforeKey=Object.keys(before).some(k=>!allowedBeforeKeys.has(k));
        const purchaseAmount=after.purchaseAmount==null?null:Number(after.purchaseAmount);
        const qtyAfter=Number(after.qty);
        const invalidPurchaseAmount=purchaseAmount!=null&&(!Number.isFinite(purchaseAmount)||purchaseAmount<0||purchaseAmount>1000000);
        const invalidQty=Object.prototype.hasOwnProperty.call(after,"qty")&&(!Number.isInteger(qtyAfter)||qtyAfter<=0||qtyAfter>100000);
        const invalidPurchaseDate=after.purchaseRecordedAt!=null&&after.purchaseRecordedAt!==""&&Number.isNaN(Date.parse(String(after.purchaseRecordedAt)));
        const price=after.finalPrice==null?null:Number(after.finalPrice);
        const beforeStatus=String(before.status||""),afterStatus=String(after.status||"");
        const qty=Number(after.qty??before.qty??0),receivedQty=Number(after.receivedQty??before.receivedQty??0);
        const promotesReceipt=["SUPERVISOR_VERIFIED","SUPERVISOR_CONFIRMED","FITTED"].includes(afterStatus)&&!["SUPERVISOR_VERIFIED","SUPERVISOR_CONFIRMED","FITTED"].includes(beforeStatus);
        const incompletePromotion=promotesReceipt&&(!(Number.isFinite(qty)&&qty>0)||!(Number.isFinite(receivedQty)&&receivedQty>=qty));
        const directReturnedRestore=beforeStatus==="RETURNED"&&afterStatus!=="RETURNED";
        const missingVerification=afterStatus==="SUPERVISOR_CONFIRMED"&&!["SUPERVISOR_CONFIRMED","FITTED"].includes(beforeStatus)&&!before.supervisorVerifiedAt&&!before.denterCheckedAt;
        const missingConfirmation=afterStatus==="FITTED"&&beforeStatus!=="FITTED"&&(!before.confirmedAt||(!before.supervisorVerifiedAt&&!before.denterCheckedAt));
        if (!((eventType==="SPARE_PART_MANAGER_CORRECTED" && callerRole==="Manager") || (eventType==="SPARE_PART_SUPERVISOR_CORRECTED" && callerRole==="Supervisor")) || !String(p.partId||"") || !String(p.listNo||"") || !String(p.jobCard||"") || !String(p.reason||"").trim() || !p.before || !p.after || invalidAfterKey || invalidBeforeKey || invalidPurchaseAmount || invalidQty || invalidPurchaseDate || !allowedStatuses.has(afterStatus) || (price!=null&&(!Number.isFinite(price)||price<0||price>1000000)) || directReturnedRestore || incompletePromotion || missingVerification || missingConfirmation) {
          return reply({ok:false,code:"spare_manager_correction_forbidden_or_invalid"},403);
        }
      }
      if (eventType==="SPARE_PART_RETURN_CANCELLED") {
        const p=event.payload && typeof event.payload==="object" ? event.payload : {};
        const before=p.before && typeof p.before==="object" ? p.before : {};
        const after=p.after && typeof p.after==="object" ? p.after : {};
        const allowedAfterKeys=new Set(["status","receivedQty","receivedAt","receivedBy","lastReceivedQty","partialReceipt","arrivalAccepted","arrivalAcceptedAt","supervisorVerifiedAt","supervisorVerifiedBy","denterCheckedAt","denterCheckedBy","confirmedAt","confirmedBy","fittedAt","fittedBy","purchaseAmount","purchaseRecordedAt","purchaseAmountRevision","billAmount","supplierCost","quoteAmount","price","supplier","quotationOffers","commercialRevision"]);
        const allowedRestoredStatuses=new Set(["LISTED","ENQUIRY","QUOTED","ORDERED","RECEIVED","SUPERVISOR_VERIFIED","DENTER_CHECKED","SUPERVISOR_CONFIRMED","FITTED","UNAVAILABLE","CUSTOMER_SETTLEMENT"]);
        const invalidAfterKey=Object.keys(after).some(k=>!allowedAfterKeys.has(k));
        const invalidNumeric=["receivedQty","lastReceivedQty","purchaseAmount","billAmount","supplierCost","quoteAmount","price"].some(k=>after[k]!=null&&(!Number.isFinite(Number(after[k]))||Number(after[k])<0||Number(after[k])>1000000));
        if (callerRole!=="Manager" || !String(p.partId||"") || !String(p.listNo||"") || !String(p.jobCard||"") || !String(p.reason||"").trim() || String(before.status||"")!=="RETURNED" || !allowedRestoredStatuses.has(String(after.status||"")) || invalidAfterKey || invalidNumeric) {
          return reply({ok:false,code:"spare_return_cancel_forbidden_or_invalid"},403);
        }
        const {data:latestStatusEvent,error:returnEventError}=await admin.from("workshop_v2_events").select("payload,event_type").eq("entity_id",String(p.partId)).eq("event_type","SPARE_PART_STATUS_CHANGED").order("server_time",{ascending:false}).order("event_id",{ascending:false}).limit(1).maybeSingle();
        if(returnEventError) throw returnEventError;
        const latestStatusPayload=latestStatusEvent?.payload&&typeof latestStatusEvent.payload==="object"?latestStatusEvent.payload:null;
        if(!latestStatusPayload||String(latestStatusPayload.to||"")!=="RETURNED") return reply({ok:false,code:"spare_return_cancel_cycle_mismatch"},409);
        const snap=latestStatusPayload.preReturnSnapshot && typeof latestStatusPayload.preReturnSnapshot==="object" ? latestStatusPayload.preReturnSnapshot : null;
        const same=(a:any,b:any)=>JSON.stringify(a??null)===JSON.stringify(b??null);
        const financialKeys=["purchaseAmount","purchaseRecordedAt","purchaseAmountRevision","billAmount","supplierCost","quoteAmount","price","supplier","quotationOffers","commercialRevision"];
        if(!snap || financialKeys.some(k=>!same(after[k],snap[k]))) return reply({ok:false,code:"spare_return_cancel_financial_mismatch"},409);
      }
      if (eventType==="SPARE_PART_ARRIVAL_ACCEPTED") {
        const p=event.payload && typeof event.payload==="object" ? event.payload : {};
        const allowedKeys=new Set(["partId","listNo","jobCard"]);
        if (!["Manager","Purchaser"].includes(callerRole) || !String(p.partId||"") || !String(p.listNo||"") || !String(p.jobCard||"") || Object.keys(p).some(k=>!allowedKeys.has(k))) {
          return reply({ok:false,code:"spare_arrival_acceptance_forbidden"},403);
        }
        const {data:arrivalState,error:arrivalStateError}=await admin.from("workshop_v2_spare_part_state").select("part_id,list_no,job_card,status").eq("part_id",String(p.partId)).maybeSingle();
        if(arrivalStateError) throw arrivalStateError;
        const arrivalEligibleStatuses=new Set(["SUPERVISOR_VERIFIED","DENTER_CHECKED","SUPERVISOR_CONFIRMED","FITTED"]);
        if(!arrivalState||String(arrivalState.list_no||"")!==String(p.listNo)||String(arrivalState.job_card||"")!==String(p.jobCard)||!arrivalEligibleStatuses.has(String(arrivalState.status||"").toUpperCase())) return reply({ok:false,code:"spare_arrival_acceptance_not_eligible"},409);
      }
      if (eventType==="SPARE_PART_FINAL_PRICE_RECORDED") {
        const p=event.payload && typeof event.payload==="object" ? event.payload : {};
        const price=Number(p.finalPrice);
        const invalidExpected=p.expectedPurchaseAmount!=null&&(!Number.isFinite(Number(p.expectedPurchaseAmount))||Number(p.expectedPurchaseAmount)<0||Number(p.expectedPurchaseAmount)>1000000);
        const allowedKeys=new Set(["partId","listNo","jobCard","finalPrice","expectedPurchaseAmount"]);
        if (!["Manager","Supervisor"].includes(callerRole) || !String(p.partId||"") || !String(p.listNo||"") || !String(p.jobCard||"") || !Number.isFinite(price) || price<=0 || price>1000000 || invalidExpected || Object.keys(p).some(k=>!allowedKeys.has(k))) {
          return reply({ok:false,code:"spare_final_price_forbidden_or_invalid"},403);
        }
        const {data:partState,error:partStateError}=await admin.from("workshop_v2_spare_part_state").select("part_id,list_no,job_card,status").eq("part_id",String(p.partId)).maybeSingle();
        if(partStateError) throw partStateError;
        const invoiceEligibleStatuses=new Set(["SUPERVISOR_VERIFIED","DENTER_CHECKED","SUPERVISOR_CONFIRMED","FITTED"]);
        if(!partState||String(partState.list_no||"")!==String(p.listNo)||String(partState.job_card||"")!==String(p.jobCard)||!invoiceEligibleStatuses.has(String(partState.status||"").toUpperCase())){
          return reply({ok:false,code:"spare_final_price_not_eligible"},409);
        }
      }
      if (eventType==="SPARE_PART_COMMERCIAL_UPDATED") {
        const p=event.payload && typeof event.payload==="object" ? event.payload : {};
        const allowedKeys=new Set(["partId","listNo","jobCard","supplier","quoteAmount","purchaseAmount","quotationOffers"]);
        const invalidKey=Object.keys(p).some(k=>!allowedKeys.has(k));
        const invalidMoney=["quoteAmount","purchaseAmount"].some(k=>p[k]!=null&&p[k]!==""&&(!Number.isFinite(Number(p[k]))||Number(p[k])<0||Number(p[k])>1000000));
        const offers=p.quotationOffers;
        const invalidOffers=offers!=null&&(!Array.isArray(offers)||offers.length>3||offers.some((o:any)=>{
          if(!o||typeof o!=="object"||Array.isArray(o)) return true;
          if(Object.keys(o).some(k=>!["supplier","amount","at"].includes(k))) return true;
          if(!String(o.supplier||"").trim()||!Number.isFinite(Number(o.amount))||Number(o.amount)<0||Number(o.amount)>1000000) return true;
          return o.at!=null&&o.at!==""&&Number.isNaN(Date.parse(String(o.at)));
        }));
        if (!["Manager","Purchaser"].includes(callerRole) || !String(p.partId||"") || !String(p.listNo||"") || !String(p.jobCard||"") || invalidKey || invalidMoney || invalidOffers) {
          return reply({ok:false,code:"spare_commercial_forbidden_or_invalid"},403);
        }
      }
      if (eventType==="SPARE_PART_STATUS_CHANGED") {
        const p=event.payload && typeof event.payload==="object" && !Array.isArray(event.payload) ? event.payload : {};
        const allowedKeys=new Set(["partId","listNo","jobCard","name","from","to","reason","receivedQty","lastReceivedQty","targetRole","preReturnSnapshot","returnedQty"]);
        const invalidKey=Object.keys(p).some(k=>!allowedKeys.has(k));
        const invalidIdentity=!String(p.partId||"").trim()||!String(p.listNo||"").trim()||!String(p.jobCard||"").trim();
        const invalidQty=["receivedQty","lastReceivedQty","returnedQty"].some(k=>p[k]!=null&&(!Number.isFinite(Number(p[k]))||Number(p[k])<0||Number(p[k])>100000));
        const invalidTargetRole=p.targetRole!=null&&p.targetRole!==""&&!["Supervisor","Purchaser"].includes(String(p.targetRole));
        if(invalidKey||invalidIdentity||invalidQty||invalidTargetRole) return reply({ok:false,code:"spare_transition_payload_invalid"},400);
        const from=String(p.from||"").toUpperCase(),to=String(p.to||"").toUpperCase();
        const allowedTransitions=new Map([
          ["LISTED",new Set(["ENQUIRY","UNAVAILABLE"])],["ENQUIRY",new Set(["QUOTED","ORDERED","LISTED","UNAVAILABLE"])],["QUOTED",new Set(["ORDERED","ENQUIRY","UNAVAILABLE"])],
          ["ORDERED",new Set(["RECEIVED","ENQUIRY","RETURNED","UNAVAILABLE"])],["RECEIVED",new Set(["RECEIVED","ORDERED","SUPERVISOR_VERIFIED","RETURNED"])],
          ["SUPERVISOR_VERIFIED",new Set(["SUPERVISOR_CONFIRMED","RETURNED"])],["DENTER_CHECKED",new Set(["SUPERVISOR_CONFIRMED","RETURNED"])],
          ["SUPERVISOR_CONFIRMED",new Set(["FITTED","RETURNED"])],["FITTED",new Set(["RETURNED"])],["UNAVAILABLE",new Set(["CUSTOMER_SETTLEMENT"])],["RETURNED",new Set(["ENQUIRY","UNAVAILABLE"])]
        ]);
        if(!allowedTransitions.get(from)?.has(to)) return reply({ok:false,code:"spare_transition_sequence_invalid"},409);
        const purchaserTargets=new Set(["ENQUIRY","QUOTED","ORDERED","RECEIVED","RETURNED","UNAVAILABLE"]);
        const supervisorTargets=new Set(["SUPERVISOR_VERIFIED","SUPERVISOR_CONFIRMED","FITTED","RETURNED","UNAVAILABLE","CUSTOMER_SETTLEMENT"]);
        const arrivalRejected=from==="RECEIVED"&&to==="ORDERED";
        if(p.targetRole==="Purchaser"&&!arrivalRejected)return reply({ok:false,code:"spare_transition_payload_invalid"},400);
        if(arrivalRejected&&["Supervisor","Manager"].includes(callerRole)&&!String(p.reason||"").trim())return reply({ok:false,code:"spare_arrival_rejection_reason_required"},400);
        const allowed = (callerRole==="Supervisor"&&arrivalRejected) || callerRole==="Manager" || (callerRole==="Purchaser" && purchaserTargets.has(to)) || (callerRole==="Supervisor" && supervisorTargets.has(to));
        if(!allowed) return reply({ok:false,code:"spare_transition_forbidden"},403);
        if(to==="RETURNED"){
          if(["SUPERVISOR_VERIFIED","DENTER_CHECKED","SUPERVISOR_CONFIRMED","FITTED"].includes(from)&&callerRole!=="Manager") return reply({ok:false,code:"spare_return_manager_required"},403);
          const snapshot=event?.payload?.preReturnSnapshot;
          const allowedSnapshotKeys=new Set(["status","receivedQty","receivedAt","receivedBy","lastReceivedQty","partialReceipt","arrivalAccepted","arrivalAcceptedAt","supervisorVerifiedAt","supervisorVerifiedBy","denterCheckedAt","denterCheckedBy","confirmedAt","confirmedBy","fittedAt","fittedBy","purchaseAmount","purchaseRecordedAt","purchaseAmountRevision","billAmount","supplierCost","quoteAmount","price","supplier","quotationOffers","commercialRevision"]);
          const allowedSnapshotStatuses=new Set(["LISTED","ENQUIRY","QUOTED","ORDERED","RECEIVED","SUPERVISOR_VERIFIED","DENTER_CHECKED","SUPERVISOR_CONFIRMED","FITTED","UNAVAILABLE","CUSTOMER_SETTLEMENT"]);
          const hasSnapshot=snapshot!=null;
          const snapshotInvalid=hasSnapshot&&(typeof snapshot!=="object"||Array.isArray(snapshot)||Object.keys(snapshot).some(k=>!allowedSnapshotKeys.has(k))||!allowedSnapshotStatuses.has(String(snapshot.status||"")));
          const snapshotNumericInvalid=hasSnapshot&&!snapshotInvalid&&["receivedQty","lastReceivedQty","purchaseAmount","billAmount","supplierCost","quoteAmount","price"].some(k=>snapshot[k]!=null&&(!Number.isFinite(Number(snapshot[k]))||Number(snapshot[k])<0||Number(snapshot[k])>1000000));
          if(snapshotInvalid||snapshotNumericInvalid) return reply({ok:false,code:"spare_return_snapshot_invalid"},403);
        }
      }
      if (eventType==="ID001_PRELIMINARY_LINKED" && !["Manager","Supervisor"].includes(callerRole)) return reply({ok:false,code:"preliminary_link_forbidden"},403);
      if (eventType==="ID001_PRELIMINARY_REVERSED" && callerRole!=="Manager") return reply({ok:false,code:"preliminary_reverse_forbidden"},403);
      if (event.actorId && String(event.actorId) !== String(user.id)) return reply({ok:false,code:"actor_mismatch"},403);
      const { data, error } = await admin.rpc("zukait_v2_commit_event", {
        p_event_id:eventId, p_entity_id:entityId, p_actor_id:String(user.id),
        p_device_id:String(event.deviceId||""), p_event_type:eventType, p_client_time:event.clientTime||null,
        p_revision:event.serverRevision==null?null:Number(event.serverRevision),
        p_payload:event.payload && typeof event.payload==="object" ? event.payload : {}
      });
      if (error) {
        const message=String(error.message||"");
        if (message.includes("stale_jobcard_revision")) return reply({ok:false,code:"job_card_exists"},409);
        if (message.includes("preliminary_session_already_linked")) return reply({ok:false,code:"preliminary_session_already_linked"},409);
        if (message.includes("preliminary_link_not_active")) return reply({ok:false,code:"preliminary_link_not_active"},409);
        if (message.includes("event_id_conflict")) return reply({ok:false,code:"event_id_conflict"},409);
        if (message.includes("stale_spare_manager_correction")) return reply({ok:false,code:"stale_spare_manager_correction"},409);
         if (message.includes("stale_spare_return_financial_snapshot")) return reply({ok:false,code:"stale_spare_return_financial_snapshot"},409);
        if (message.includes("stale_spare_final_price")) return reply({ok:false,code:"stale_spare_final_price"},409);
        if (message.includes("spare_final_price_not_eligible")) return reply({ok:false,code:"spare_final_price_not_eligible"},409);
        if (message.includes("duplicate_active_spare_part")) return reply({ok:false,code:"duplicate_active_spare_part"},409);
        if (message.includes("stale_spare_part_status")) return reply({ok:false,code:"stale_spare_part_status"},409);
        if (message.includes("spare_receipt_incomplete")) return reply({ok:false,code:"spare_receipt_incomplete"},409);
        if (message.includes("spare_arrival_acceptance_not_eligible")) return reply({ok:false,code:"spare_arrival_acceptance_not_eligible"},409);
        if (message.includes("spare_quantity_below_received")) return reply({ok:false,code:"spare_quantity_below_received"},409);
        if (message.includes("spare_verified_quantity_increase_requires_reopen")) return reply({ok:false,code:"spare_verified_quantity_increase_requires_reopen"},409);
        if (message.includes("spare_returned_quantity_mismatch")) return reply({ok:false,code:"spare_returned_quantity_mismatch"},409);
        if (message.includes("spare_return_restore_quantity_invalid")) return reply({ok:false,code:"spare_return_restore_quantity_invalid"},409);
        if (message.includes("spare_return_cancel_financial_mismatch")) return reply({ok:false,code:"spare_return_cancel_financial_mismatch"},409);
        if (message.includes("spare_return_cancel_cycle_mismatch")) return reply({ok:false,code:"spare_return_cancel_cycle_mismatch"},409);
        if (message.includes("stale_work_revision")) return reply({ok:false,code:"stale_work_revision"},409);
        if (message.includes("employee_already_active")) return reply({ok:false,code:"employee_already_active"},409);
        if (message.includes("stale_assignment_revision")) return reply({ok:false,code:"stale_assignment_revision"},409);
        if (message.includes("work_session_exists")) return reply({ok:false,code:"work_session_exists"},409);
        if (message.includes("work_not_paused")) return reply({ok:false,code:"work_not_paused"},409);
        throw error;
      }
      const row=Array.isArray(data)?data[0]:data;
      return reply({ok:true,event_id:row?.event_id||eventId,server_time:row?.server_time||null,server_revision:row?.revision??null,inserted:row?.inserted===true,user});
    }

    if (action === "v2_event_history") {
      const requested = Number(body?.limit || 100);
      const limit = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 100, 500));
      const before = body?.before ? String(body.before) : null;
      const beforeId = body?.before_id ? String(body.before_id) : null;
      const entityId = body?.entity_id ? String(body.entity_id) : null;
      const eventType = body?.event_type ? String(body.event_type) : null;
      const { data, error } = await admin.rpc("zukait_v2_event_page", {
        p_before: before,
        p_limit: limit,
        p_entity_id: entityId,
        p_event_type: eventType,
        p_before_id: beforeId
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const last=rows[rows.length-1];
      const nextCursor = rows.length === limit && last?.server_time && last?.event_id ? { before:String(last.server_time), before_id:String(last.event_id) } : null;
      return reply({ ok: true, rows, next_cursor: nextCursor, limit, user });
    }




    if (action === "v2_upsert_jobcard") {
      if (!["Manager","Supervisor"].includes(String(user.role)))return reply({ok:false,code:"forbidden"},403);
      const j=body?.jobcard||{};
      if(!String(j.jobCard||"").trim()) return reply({ok:false,code:"job_card_required"},400);
      const revision=Math.max(0,Number(j.revision||0));
      const {data,error}=await admin.rpc("zukait_v2_upsert_jobcard",{
        p_job_card:String(j.jobCard).trim(),p_registration:String(j.registration||""),p_vin:String(j.vin||""),p_vehicle_make:String(j.vehicleMake||""),p_vehicle_model:String(j.vehicleModel||""),
        p_vehicle_year:j.vehicleYear==null?null:Number(j.vehicleYear),p_workflow_stage:String(j.workflowStage||"CREATED"),p_status:String(j.status||"OPEN"),
        p_revision:revision,p_event_id:j.eventId?String(j.eventId):null,p_completed_at:j.completedAt||null
      });
      if(error) throw error;
      return reply({ok:true,jobcard:data,user});
    }

    if (action === "v2_report_page" || action === "v2_search_jobcards") {
      const requested = Number(body?.limit || (action === "v2_search_jobcards" ? 50 : 100));
      const limit = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 100, 500));
      const before = body?.before ? String(body.before) : null;
      const beforeId = body?.before_id ? String(body.before_id) : null;
      const report = String(body?.report || "").toUpperCase();
      const query = String(body?.query || "").trim();
      const filters = body?.filters && typeof body.filters === "object" ? body.filters : {};
      if (action === "v2_report_page" && !["WIP","AUDIT","CYCLE_TIME","EFFICIENCY","REPEAT","ID001","OVERTIME","PARTS_DELAY","SPARE_PARTS","CONSUMABLES_VARIANCE","JOB_COST","COMPLETION_TARGET"].includes(report)) {
        return reply({ ok:false, code:"unsupported_report" },400);
      }
      if (action === "v2_search_jobcards" && !query) return reply({ ok:true, rows:[], next_cursor:null, limit, user });
      const { data, error } = action === "v2_search_jobcards"
        ? await admin.rpc("zukait_v2_jobcard_page", { p_query: query, p_before: before, p_limit: limit, p_status: null, p_before_id: beforeId })
        : report === "WIP" || report === "COMPLETION_TARGET"
          ? await admin.rpc("zukait_v2_wip_page", { p_before: before, p_limit: limit, p_stage: filters.stage || null, p_risk: report === "COMPLETION_TARGET" ? (filters.risk || null) : null, p_before_id: beforeId })
          : ["ID001","OVERTIME","REPEAT","JOB_COST","EFFICIENCY"].includes(report)
            ? await admin.rpc("zukait_v2_operational_report_page_cursor", { p_report: report, p_before: before, p_limit: limit, p_filters: filters, p_before_id: beforeId })
            : await admin.rpc("zukait_v2_report_page", { p_report: report, p_before: before, p_limit: limit, p_filters: filters, p_before_id: beforeId });
      if (error) throw error;
      let rows = Array.isArray(data) ? data : [];
      if (action === "v2_report_page" && report === "SPARE_PARTS" && !["Manager","Purchaser"].includes(String(user?.role||""))) {
        const financialKeys=new Set(["purchaseAmount","purchaseRecordedAt","purchaseAmountRevision","billAmount","supplierCost","quoteAmount","price","supplier","quotationOffers","commercialRevision","finalPrice","preReturnSnapshot"]);
        // Supervisors enter invoice amounts and must read them back after refresh.
        // Keep quotation, supplier and other commercial fields private.
        if(String(user?.role||"")==="Supervisor"){
          for(const key of ["purchaseAmount","purchaseRecordedAt","purchaseAmountRevision","finalPrice"])financialKeys.delete(key);
        }
        const scrub=(value:any):any=>{
          if(Array.isArray(value)) return value.map(scrub);
          if(!value||typeof value!=="object") return value;
          const out:any={};
          for(const [k,v] of Object.entries(value)) if(!financialKeys.has(k)) out[k]=scrub(v);
          return out;
        };
        rows=rows.map((row:any)=>scrub(row));
      }
      const cursorValue = action === "v2_search_jobcards" || report === "WIP" || report === "COMPLETION_TARGET"
        ? rows[rows.length - 1]?.updated_at
        : rows[rows.length - 1]?.sort_time || rows[rows.length - 1]?.updated_at;
      const lastRow=rows[rows.length-1];
      const cursorId = action === "v2_search_jobcards" || report === "WIP" || report === "COMPLETION_TARGET" ? lastRow?.job_card : ["ID001","OVERTIME","REPEAT","JOB_COST","EFFICIENCY"].includes(report) ? lastRow?.session_id : lastRow?.event_id;
      const nextCursor = rows.length === limit && cursorValue && cursorId ? { before:String(cursorValue), before_id:String(cursorId) } : null;
      return reply({ ok:true, rows, next_cursor:nextCursor, limit, report:action === "v2_search_jobcards" ? "JOB_SEARCH" : report, user });
    }

    if (action === "save") {
      const originalExpected = Number(body.expected_revision);
      const originalProposed = body.data;
      if (!Number.isFinite(originalExpected) || !originalProposed || typeof originalProposed !== "object") {
        return reply({ ok: false, code: "bad_request" }, 400);
      }

      // Multi-version compatibility authority:
      // stale full-state clients are rebased on the server using the exact historical
      // snapshot they originally edited. This prevents revision-conflict ping-pong
      // between old/new app versions and multiple devices.
      let baseData:any = null;
      let lastCurrent:any = null;

      for (let attempt = 0; attempt < 8; attempt++) {
        const { data: current, error: currentError } = await admin.from("workshop_state")
          .select("revision,data").eq("id","main").single();
        if (currentError) throw currentError;
        lastCurrent = current;

        let candidate:any;
        const currentRevision = Number(current.revision || 0);
        if (currentRevision === originalExpected) {
          candidate = cloneValue(originalProposed);
        } else {
          if (!baseData) baseData = await baseStateForRevision(originalExpected, currentRevision, current.data);
          if (!baseData) {
            // Very old revisions created before history was enabled still fall back
            // to the legacy client conflict path once. The next retry will use a
            // revision that exists in history.
            return reply({ ok: false, code: "conflict", revision: current.revision, data: current.data }, 409);
          }
          candidate = threeWayMerge(baseData, current.data, originalProposed);
        }

        candidate = preservePaintPurchasingHistory(preserveConsumablesHistory(preserveOperationalHistory(reconcileAutoOvertime(preserveClosedSessions(candidate, current.data), current.data), current.data, user), current.data), current.data);
        const consumablesCorrectionIssue=validateConsumablesManagerCorrections(candidate,current.data,user);
        if(consumablesCorrectionIssue) return reply({ok:false,code:"consumables_correction_forbidden",message:consumablesCorrectionIssue,revision:current.revision,data:current.data},403);
        candidate = preserveLeaveAuthority(candidate, current.data, user);
        candidate = preserveManagerTimeAuthority(candidate, current.data);
      candidate = preserveAuthoritativeReopens(candidate, current.data);
        candidate = preserveJobTypeAuthority(candidate, current.data, user);

        const paintCorrectionIssue=validatePaintManagerCorrections(candidate,current.data,user);
        if (paintCorrectionIssue) return reply({ok:false,code:"paint_correction_forbidden",message:paintCorrectionIssue,revision:current.revision,data:current.data},403);

        const paintOrderIssue=paintOrderRules.validateNewOrders(candidate.paintPurchasing?.orders || [],current.data?.paintPurchasing?.orders || []);
        if (paintOrderIssue) return reply({ok:false,code:"paint_po_invalid",message:paintOrderIssue,revision:current.revision,data:current.data},409);

        // Keep profiles whose credentials are still active. Inactive staff may be
        // intentionally removed; an old full-state save must not remove active staff.
        const proposedUsers = Array.isArray(candidate.users) ? candidate.users : [];
        const presentUsers = new Set(proposedUsers.map((u: any) => String(u?.id || "")));
        const missingUsers = (Array.isArray(current.data?.users) ? current.data.users : [])
          .filter((u: any) => u?.id && !presentUsers.has(String(u.id)));
        if (missingUsers.length) {
          const { data: activeStaff, error: staffError } = await admin.from("staff_credentials")
            .select("user_id").eq("active", true)
            .in("user_id", missingUsers.map((u: any) => String(u.id)));
          if (staffError) throw staffError;
          const activeIds = new Set((activeStaff || []).map((x: any) => String(x.user_id)));
          for (const profile of missingUsers) {
            if (activeIds.has(String(profile.id))) proposedUsers.push(cloneValue(profile));
          }
          candidate.users = proposedUsers;
        }

        const unsafeIdeal = (candidate.assign || []).some((a: any) =>
          a && a.job === "ID001" && !a.cancelled && !a.completed && Number(a.idealSafeVersion || 0) < 1
        );
        if (unsafeIdeal) {
          return reply({ ok: false, code: "id001_update_required", revision: current.revision, data: current.data }, 409);
        }

        if (!validateRoleChange(user, current.data, candidate)) {
          return reply({ ok: false, code: "forbidden_change" }, 403);
        }

        candidate = preserveQcAuthority(candidate, current.data);
        candidate = reconcilePaintOrderCosts(candidate);

        const next = currentRevision + 1;
        const live = computeLiveStatus(candidate, next, user.id);
        const { data: committed, error } = await admin.rpc("zukait_commit_workshop_state_v2", {
          p_expected_revision: currentRevision,
          p_data: candidate,
          p_changed_by: user.id,
          p_live: live
        });
        if (error) throw error;

        if (committed?.ok) {
          const committedRevision = Number(committed.revision || next);
          const rebased = currentRevision !== originalExpected;
          const reconciled = !same(candidate, originalProposed);
          return reply({
            ok: true,
            // Backward compatibility: legacy clients only understand "revision".
            // When the server had to rebase, keep that field at the client's base
            // so its existing poller is forced to reload the authoritative state.
            revision: rebased ? originalExpected : committedRevision,
            server_revision: committedRevision,
            data: rebased || reconciled ? candidate : undefined,
            force_pull: rebased || reconciled,
            updated_by: user.id,
            rebased,
            original_revision: originalExpected,
            committed_from_revision: currentRevision,
            attempts: attempt + 1
          });
        }

        if (committed?.code !== "conflict") {
          return reply({ ok: false, code: committed?.code || "save_failed" }, 409);
        }
        // Another device committed between our read and RPC. Loop entirely on the
        // server and rebase the same original user change onto the newest state.
      }

      const latest = lastCurrent || (await admin.from("workshop_state").select("revision,data").eq("id","main").single()).data;
      return reply({ ok: false, code: "conflict_busy", revision: latest?.revision, data: latest?.data }, 409);
    }

    if (action === "backup") {
      if (user.role !== "Manager") return reply({ ok:false, code:"forbidden" }, 403);
      const { data: current, error } = await admin.from("workshop_state")
        .select("revision,data").eq("id","main").single();
      if (error) throw error;
      const { data: created, error: backupError } = await admin.from("workshop_backups").insert({
        created_by: user.id,
        revision: current.revision,
        data: current.data
      }).select("id,created_at,revision").single();
      if (backupError) throw backupError;
      return reply({ ok:true, backup:created });
    }

    if (action === "backup_list") {
      if (user.role !== "Manager") return reply({ ok:false, code:"forbidden" }, 403);
      const { data, error } = await admin.from("workshop_backups")
        .select("id,created_at,created_by,revision").order("created_at",{ascending:false}).limit(20);
      if (error) throw error;
      return reply({ ok:true, backups:data || [] });
    }

    return reply({ ok:false, code:"unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return reply({ ok:false, code:"server_error" }, 500);
  }
});

