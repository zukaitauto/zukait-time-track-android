
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
  const { data: session } = await admin.from("staff_sessions")
    .select("user_id,revoked_at").eq("token_hash", hash).maybeSingle();
  if (!session || session.revoked_at) return null;
  const { data: staff } = await admin.from("staff_credentials")
    .select("user_id,display_name,role,department,active")
    .eq("user_id", session.user_id).maybeSingle();
  if (!staff || !staff.active) return null;
  await admin.from("staff_sessions").update({ last_seen_at: new Date().toISOString() })
    .eq("token_hash", hash);
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
    if (!allowed.has(k) && !same(oldData[k], newData[k])) return false;
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

function threeWayMerge(base: any, remote: any, local: any): any {
  if (same(local, base)) return cloneValue(remote);
  if (same(remote, base)) return cloneValue(local);

  if (Array.isArray(base) || Array.isArray(remote) || Array.isArray(local)) {
    const b = Array.isArray(base) ? base : [];
    const r = Array.isArray(remote) ? remote : [];
    const l = Array.isArray(local) ? local : [];
    const all = [...b, ...r, ...l];
    const idBased = all.every(x => x == null || (typeof x === "object" && !Array.isArray(x) && x.id != null));
    if (!idBased) return cloneValue(local);

    const bm = new Map(b.filter((x:any)=>x?.id!=null).map((x:any)=>[String(x.id),x]));
    const rm = new Map(r.filter((x:any)=>x?.id!=null).map((x:any)=>[String(x.id),x]));
    const lm = new Map(l.filter((x:any)=>x?.id!=null).map((x:any)=>[String(x.id),x]));
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
      out[k] = threeWayMerge(bv, rv, lv);
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

    if (action === "v2_event_history") {
      const requested = Number(body?.limit || 100);
      const limit = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 100, 500));
      const before = body?.before ? String(body.before) : null;
      const entityId = body?.entity_id ? String(body.entity_id) : null;
      const eventType = body?.event_type ? String(body.event_type) : null;
      const { data, error } = await admin.rpc("zukait_v2_event_page", {
        p_before: before,
        p_limit: limit,
        p_entity_id: entityId,
        p_event_type: eventType
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const nextCursor = rows.length === limit && rows.length
        ? String(rows[rows.length - 1].server_time || "")
        : null;
      return reply({ ok: true, rows, next_cursor: nextCursor, limit, user });
    }

    if (action === "v2_report_page" || action === "v2_search_jobcards") {
      const requested = Number(body?.limit || (action === "v2_search_jobcards" ? 50 : 100));
      const limit = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 100, 500));
      const before = body?.before ? String(body.before) : null;
      const report = String(body?.report || "").toUpperCase();
      const query = String(body?.query || "").trim();
      const filters = body?.filters && typeof body.filters === "object" ? body.filters : {};
      if (action === "v2_report_page" && !["WIP","AUDIT","CYCLE_TIME","EFFICIENCY","REPEAT","ID001","OVERTIME","PARTS_DELAY","CONSUMABLES_VARIANCE","JOB_COST","COMPLETION_TARGET"].includes(report)) {
        return reply({ ok:false, code:"unsupported_report" },400);
      }
      if (action === "v2_search_jobcards" && !query) return reply({ ok:true, rows:[], next_cursor:null, limit, user });
      const { data, error } = await admin.rpc("zukait_v2_report_page", {
        p_report: action === "v2_search_jobcards" ? "JOB_SEARCH" : report,
        p_before: before,
        p_limit: limit,
        p_filters: action === "v2_search_jobcards" ? { ...filters, query } : filters
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const nextCursor = rows.length === limit && rows.length ? String(rows[rows.length - 1]?.sort_time || "") : null;
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

        const unsafeIdeal = (candidate.assign || []).some((a: any) =>
          a && a.job === "ID001" && !a.cancelled && !a.completed && Number(a.idealSafeVersion || 0) < 1
        );
        if (unsafeIdeal) {
          return reply({ ok: false, code: "id001_update_required", revision: current.revision, data: current.data }, 409);
        }

        if (user.role === "Employee" && !validateEmployeeChange(user.id, current.data, candidate)) {
          return reply({ ok: false, code: "forbidden_change" }, 403);
        }

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
          return reply({
            ok: true,
            // Backward compatibility: legacy clients only understand "revision".
            // When the server had to rebase, keep that field at the client's base
            // so its existing poller is forced to reload the authoritative state.
            revision: rebased ? originalExpected : committedRevision,
            server_revision: committedRevision,
            data: rebased ? candidate : undefined,
            force_pull: rebased,
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
