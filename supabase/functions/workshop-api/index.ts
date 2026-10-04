import "./paint_order_rules.js";
const paintOrderRules = (globalThis as any).zukaitPaintOrderRules;
import { qcTransition, preserveQcAuthority } from "./qc_delivery_rules.js";
import { timeManagementTransition } from "./time_management_rules.js";
import { managerTimeCorrectionTransition } from "./manager_time_correction_rules.js";

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
function validateEmployeeChange(emp: string, oldData: any, newData: any) {
  if (!oldData || !newData) return false;
  const allowed = new Set(["sessions","assign","requests","lastActions","systemNotifications","notifications","overtimeNotices","leaves","leaveAudit"]);
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const k of allKeys) {
    if (k === "jobs") continue;
    if (!allowed.has(k) && !same(oldData[k], newData[k])) return false;
  }

  // Employees never receive general Job Card edit permission. Legacy Finish may
  // only project assignment completion into that same JC's status/completedAt.
  const oldJ = new Map((oldData.jobs || []).map((j:any)=>[String(j?.no||""),j]));
  const newJ = new Map((newData.jobs || []).map((j:any)=>[String(j?.no||""),j]));
  if (oldJ.size !== newJ.size) return false;
  for (const [no,before] of oldJ) {
    const after:any = newJ.get(no); if (!after) return false;
    const strip=(j:any)=>{const x=cloneValue(j)||{};delete x.status;delete x.completedAt;return x};
    if (!same(strip(before),strip(after))) return false;
    if (same(before,after)) continue;
    const assignments=(newData.assign||[]).filter((a:any)=>!a?.cancelled&&String(a?.job||"")===no);
    const mine=assignments.some((a:any)=>String(a?.emp||"")===String(emp)&&a?.completed===true);
    if (!mine || !assignments.length) return false;
    const done=assignments.every((a:any)=>a?.completed===true);
    const expectedStatus=done?"Completed":"Open";
    if (String(after?.status||"")!==expectedStatus) return false;
    if (done) {
      const expectedAt=Math.max(...assignments.map((a:any)=>Number(a?.completedAt)||0));
      if (!(expectedAt>0) || Number(after?.completedAt||0)!==expectedAt) return false;
    } else if (after?.completedAt !== undefined && after?.completedAt !== null) return false;
  }

  const oldA = mapById(oldData.assign || []);
  const newA = mapById(newData.assign || []);
  if (oldA.size !== newA.size) return false;
  for (const [id, before] of oldA) {
    const after = newA.get(id);
    if (!after) return false;
    if (before.emp !== emp) {
      if (!same(before, after)) return false;
    } else {
      if (!immutableSame(before, after, [
        "id","job","emp","suggested","rework","assignedBy","assignedAt",
        "mistakeEmp","repeatReason","repeatSameEmployee","cancelled"
      ])) return false;
    }
  }

  const oldS = mapById(oldData.sessions || []);
  const newS = mapById(newData.sessions || []);
  for (const [id, before] of oldS) {
    const after = newS.get(id);
    if (!after) return false;
    if (before.emp !== emp) {
      if (!same(before, after)) return false;
    } else if (!immutableSame(before, after, ["id","emp","job","assignmentId","start"])) {
      return false;
    }
  }
  for (const [id, after] of newS) {
    if (!oldS.has(id) && after.emp !== emp) return false;
  }

  const oldR = mapById(oldData.requests || []);
  const newR = mapById(newData.requests || []);
  for (const [id, before] of oldR) {
    const after = newR.get(id);
    if (!after || !same(before, after)) return false;
  }
  for (const [id, after] of newR) {
    if (!oldR.has(id) && after.emp !== emp) return false;
  }

  const oldL = mapById(oldData.leaves || []);
  const newL = mapById(newData.leaves || []);
  for (const [id, before] of oldL) { const after = newL.get(id); if (!after || !same(before, after)) return false; }
  for (const [id, after] of newL) { if (!oldL.has(id) && (after.emp !== emp || after.by !== emp || after.cancelled === true)) return false; }
  const oldLA = mapById(oldData.leaveAudit || []);
  const newLA = mapById(newData.leaveAudit || []);
  for (const [id, before] of oldLA) { const after = newLA.get(id); if (!after || !same(before, after)) return false; }
  for (const [id, after] of newLA) { if (!oldLA.has(id) && (after.by !== emp || after.action !== "ADD")) return false; }

  const oldLast = oldData.lastActions || {};
  const newLast = newData.lastActions || {};
  for (const k of new Set([...Object.keys(oldLast), ...Object.keys(newLast)])) {
    if (k !== emp && !same(oldLast[k], newLast[k])) return false;
  }
  return true;
}


function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}


// A delayed legacy client must not reopen work that another device already paused.
// Only synthetic overtime sessions absent from the current server snapshot are removed.
function preserveClosedSessions(candidate: any, current: any): any {
  const closed = new Map((current?.sessions || []).filter((s: any) => Number(s?.end || 0) > 0 || Number(s?.managerStartCorrectedAt || 0) > 0).map((s: any) => [String(s.id),s]));
  candidate.sessions = (candidate?.sessions || []).map((s: any) => {
    const authoritative: any = closed.get(String(s?.id || ""));
    // A stale device can also hold an earlier end value. Once the server has
    // closed this session, its terminal fields remain authoritative; a real
    // restart must create a new session ID.
    return authoritative
      ? {...s,
         ...(Number(authoritative.end || 0) > 0 ? {end:authoritative.end,paused:authoritative.paused,autoPausedAt:authoritative.autoPausedAt,
           pauseReason:authoritative.pauseReason,closeReason:authoritative.closeReason} : {}),
         ...(Number(authoritative.managerStartCorrectedAt)>0?{start:authoritative.start,managerStartCorrectedAt:authoritative.managerStartCorrectedAt,managerStartCorrectedBy:authoritative.managerStartCorrectedBy}: {})}
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
    const seen = new Set(nextRows.map(identity));
    for (const row of serverRows) {
      const id = identity(row);
      if (!seen.has(id)) { nextRows.push(cloneValue(row)); seen.add(id); }
    }
    if (nextRows.length || serverRows.length || Array.isArray(incoming?.[key])) incoming[key] = nextRows;
  }
  incoming.schemaVersion = Math.max(Number(incoming.schemaVersion||0), Number(existing.schemaVersion||0), 1);
  candidate.consumables = incoming;
  return candidate;
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
        if (!byId.has(id)) { byId.set(id,nextRows.length); nextRows.push(cloneValue(row)); }
        else if (key === "orders" && row?.voided) nextRows[byId.get(id)!] = cloneValue(row);
      }
      if (nextRows.length || serverRows.length || Array.isArray(incoming?.[key])) incoming[key]=nextRows;
    }
    incoming.schemaVersion=Math.max(Number(incoming.schemaVersion||0),Number(existing.schemaVersion||0),1);
    candidate.paintPurchasing=incoming;
  }
  const serverCost=current?.paintCosting && typeof current.paintCosting==="object" ? current.paintCosting : {};
  const incomingCost=candidate?.paintCosting && typeof candidate.paintCosting==="object" ? candidate.paintCosting : {};
  if (Object.keys(serverCost).length || Object.keys(incomingCost).length) {
    // Existing server costing survives clients that do not know this module;
    // an incoming value for the same JC is still allowed to update it.
    candidate.paintCosting={...cloneValue(serverCost),...cloneValue(incomingCost)};
  }
  return candidate;
}

// Derived cost projection follows staff authorization so unrelated employee saves stay valid.
function reconcilePaintOrderCosts(candidate: any): any {
  for (const no of new Set((candidate.paintPurchasing?.orders || []).map((o:any)=>String(o?.jobCard || "")).filter(Boolean))) {
    const cost=paintOrderRules.costForJob(candidate.paintPurchasing.orders,no);
    if (!cost) continue;
    candidate.paintCosting=candidate.paintCosting || {};
    candidate.paintCosting[no]={...cost,updatedAt:candidate.paintCosting[no]?.updatedAt || Date.now()};
    const job=(candidate.jobs || []).find((j:any)=>String(j.no)===no);
    if(job) job.paintCost=cost.netPaintCost;
  }
  return candidate;
}

// A full-state client can carry an old snapshot while saving an unrelated change.
// Keep prior records unless a Manager records an explicit, reasoned Job Card deletion.
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

function threeWayMerge(base: any, remote: any, local: any, field = ""): any {
  if (same(local, base)) return cloneValue(remote);
  if (same(remote, base)) return cloneValue(local);

  if (Array.isArray(base) || Array.isArray(remote) || Array.isArray(local)) {
    const b = Array.isArray(base) ? base : [];
    const r = Array.isArray(remote) ? remote : [];
    const l = Array.isArray(local) ? local : [];
    const all = [...b, ...r, ...l];
    // Job Cards use "no", while assignments and sessions use "id".
    // Without this key, an edit to one Job Card replaces the entire remote list.
    const identity = field === "jobs" ? "no" : "id";
    const keyed = all.every(x => x == null || (typeof x === "object" && !Array.isArray(x) && x[identity] != null));
    if (!keyed) return cloneValue(local);

    const bm = new Map(b.filter((x:any)=>x?.[identity]!=null).map((x:any)=>[String(x[identity]),x]));
    const rm = new Map(r.filter((x:any)=>x?.[identity]!=null).map((x:any)=>[String(x[identity]),x]));
    const lm = new Map(l.filter((x:any)=>x?.[identity]!=null).map((x:any)=>[String(x[identity]),x]));
    const ids = [...new Set([...bm.keys(), ...rm.keys(), ...lm.keys()])];
    const out:any[] = [];

    for (const id of ids) {
      const bv = bm.get(id), rv = rm.get(id), lv = lm.get(id);
      if (bv === undefined) {
        if (rv !== undefined && lv !== undefined) out.push(threeWayMerge({}, rv, lv));
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
      out.push(threeWayMerge(bv, rv, lv));
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
      out[k] = threeWayMerge(bv, rv, lv, k);
    }
    return out;
  }

  return cloneValue(local);
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
      .filter((s:any)=>s && s.emp===u.id)
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

    if (action === "manager_time_correction") {
      for (let attempt=0;attempt<8;attempt++) {
        const {data:current,error:readError}=await admin.from("workshop_state").select("revision,data").eq("id","main").single();
        if(readError)throw readError;
        const result=managerTimeCorrectionTransition(current.data,user,body,Date.now());
        if(!result.ok)return reply({ok:false,code:result.code},result.code==="manager_time_permission_denied"?403:409);
        if(result.duplicate)return reply({ok:true,audit:result.audit,duplicate:true,server_revision:current.revision});
        const next=Number(current.revision||0)+1;
        const {data:committed,error:commitError}=await admin.rpc("zukait_commit_workshop_state_v2",{p_expected_revision:Number(current.revision||0),p_data:result.data,p_changed_by:user.id,p_live:computeLiveStatus(result.data,next,user.id)});
        if(commitError)throw commitError;
        if(committed?.ok)return reply({ok:true,audit:result.audit,server_revision:committed.revision||next});
        if(committed?.code!=="conflict")return reply({ok:false,code:committed?.code||"manager_time_commit_failed"},409);
      }
      return reply({ok:false,code:"manager_time_conflict"},409);
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
      return reply({ ok: true, ...live, server_time: Date.now(), user });
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
      if (eventType==="SPARE_PART_LIST_CREATED" && !["Manager","Supervisor"].includes(callerRole)) {
        return reply({ok:false,code:"spare_list_create_forbidden"},403);
      }
      if (eventType==="SPARE_PART_LISTED" && !["Manager","Supervisor"].includes(callerRole)) {
        return reply({ok:false,code:"spare_list_edit_forbidden"},403);
      }
      if (eventType==="SPARE_PART_ITEM_EDITED" && !["Manager","Supervisor"].includes(callerRole)) {
        return reply({ok:false,code:"spare_item_edit_forbidden"},403);
      }
      if (eventType==="SPARE_PART_MANAGER_CORRECTED" || eventType==="SPARE_PART_SUPERVISOR_CORRECTED") {
        const p=event.payload && typeof event.payload==="object" ? event.payload : {};
        const after=p.after && typeof p.after==="object" ? p.after : {};
        const allowedStatuses=new Set(["LISTED","ENQUIRY","QUOTED","ORDERED","RECEIVED","SUPERVISOR_VERIFIED","SUPERVISOR_CONFIRMED","FITTED","RETURNED","UNAVAILABLE","CUSTOMER_SETTLEMENT"]);
        const price=after.finalPrice==null?null:Number(after.finalPrice);
        if (!((eventType==="SPARE_PART_MANAGER_CORRECTED" && callerRole==="Manager") || (eventType==="SPARE_PART_SUPERVISOR_CORRECTED" && callerRole==="Supervisor")) || !String(p.partId||"") || !String(p.listNo||"") || !String(p.jobCard||"") || !String(p.reason||"").trim() || !p.before || !p.after || !allowedStatuses.has(String(after.status||"")) || (price!=null&&(!Number.isFinite(price)||price<0||price>1000000))) {
          return reply({ok:false,code:"spare_manager_correction_forbidden_or_invalid"},403);
        }
      }
      if (eventType==="SPARE_PART_ARRIVAL_ACCEPTED") {
        const p=event.payload && typeof event.payload==="object" ? event.payload : {};
        const allowedKeys=new Set(["partId","listNo","jobCard"]);
        if (!["Manager","Purchaser"].includes(callerRole) || !String(p.partId||"") || !String(p.listNo||"") || !String(p.jobCard||"") || Object.keys(p).some(k=>!allowedKeys.has(k))) {
          return reply({ok:false,code:"spare_arrival_acceptance_forbidden"},403);
        }
      }
      if (eventType==="SPARE_PART_FINAL_PRICE_RECORDED") {
        const p=event.payload && typeof event.payload==="object" ? event.payload : {};
        const price=Number(p.finalPrice);
        const allowedKeys=new Set(["partId","listNo","jobCard","finalPrice"]);
        if (!["Manager","Supervisor"].includes(callerRole) || !String(p.partId||"") || !String(p.listNo||"") || !String(p.jobCard||"") || !Number.isFinite(price) || price<0 || price>1000000 || Object.keys(p).some(k=>!allowedKeys.has(k))) {
          return reply({ok:false,code:"spare_final_price_forbidden_or_invalid"},403);
        }
      }
      if (eventType==="SPARE_PART_COMMERCIAL_UPDATED" && !["Manager","Purchaser"].includes(callerRole)) {
        return reply({ok:false,code:"spare_commercial_forbidden"},403);
      }
      if (eventType==="SPARE_PART_STATUS_CHANGED") {
        const to=String(event?.payload?.to||"");
        const purchaserTargets=new Set(["ENQUIRY","QUOTED","ORDERED","RECEIVED","RETURNED","UNAVAILABLE"]);
        const supervisorTargets=new Set(["SUPERVISOR_VERIFIED","SUPERVISOR_CONFIRMED","FITTED","RETURNED","UNAVAILABLE","CUSTOMER_SETTLEMENT"]);
        const allowed = callerRole==="Manager" || (callerRole==="Purchaser" && purchaserTargets.has(to)) || (callerRole==="Supervisor" && supervisorTargets.has(to));
        if(!allowed) return reply({ok:false,code:"spare_transition_forbidden"},403);
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
      const j=body?.jobcard||{};
      if(!String(j.jobCard||"").trim()) return reply({ok:false,code:"job_card_required"},400);
      const revision=Math.max(0,Number(j.revision||0));
      const {data,error}=await admin.rpc("zukait_v2_upsert_jobcard",{
        p_job_card:String(j.jobCard).trim(),p_registration:String(j.registration||""),p_vehicle_make:String(j.vehicleMake||""),p_vehicle_model:String(j.vehicleModel||""),
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
            ? await admin.rpc("zukait_v2_operational_report_page", { p_report: report, p_before: before, p_limit: limit, p_filters: filters, p_before_id: beforeId })
            : await admin.rpc("zukait_v2_report_page", { p_report: report, p_before: before, p_limit: limit, p_filters: filters, p_before_id: beforeId });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
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

        if (user.role === "Employee" && !validateEmployeeChange(user.id, current.data, candidate)) {
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
