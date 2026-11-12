
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
// Validate only mutations: legacy historical records are never rewritten here.
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
  const allowed=new Set(["jobs","assign","sessions","requests","lastActions","systemNotifications","notifications","overtimeNotices","leaves","leaveAudit","leaveNotifications","attentionDismissed","additionalActions","suggestedEdits","reworks","reworkLogs","reopenLogs","reassignLogs","reissueLogs","employeeChangeLogs","cancelledAssignments","jobEdits","jobVehicleEdits","consumables","paintPurchasing","paintCosting"]);
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
  if (!['Manager','Supervisor','Employee'].includes(user.role)) return false;
  if (user.role==='Employee') return validateEmployeeChange(user.id,oldData,newData);
  if (user.role==='Supervisor' && !validateSupervisorChange(user.id,oldData,newData)) return false;
  // Preserve existing audit entries for every role, including Manager corrections.
  for (const k of ['corrections','jobEdits','jobVehicleEdits','suggestedEdits','additionalActions','reworkLogs','reopenLogs','reassignLogs','reissueLogs','employeeChangeLogs','jobDeletes','deletedJobAudit','leaveAudit']) {
    if (!appendOnly(oldData[k] || [],newData[k] || [])) return false;
  }
  for (const k of ['consumables','paintPurchasing']) if (!appendOnly(oldData[k]?.audit || [],newData[k]?.audit || [])) return false;
  return true;
}


function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
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

    if (action === "v2_allocate_spare_part_list") {
      if (!["Manager","Supervisor","Purchaser"].includes(String(user.role || ""))) return reply({ok:false,code:"forbidden"},403);
      const jobCard=String(body?.job_card||"").trim().toUpperCase();
      if(!jobCard) return reply({ok:false,code:"job_card_required"},400);
      const {data,error}=await admin.rpc("zukait_v2_allocate_spare_part_list",{p_job_card:jobCard,p_actor_id:String(user.id)});
      if(error) throw error;
      const row=Array.isArray(data)?data[0]:data;
      if(!row?.list_no) return reply({ok:false,code:"allocation_failed"},409);
      return reply({ok:true,list:row,user});
    }

    if (action === "v2_commit_event") {
      const event = body?.event && typeof body.event === "object" ? body.event : null;
      if (!event || !String(event.eventId || "").trim() || !String(event.entityId || "").trim() || !String(event.type || "").trim()) {
        return reply({ ok:false, code:"bad_event" },400);
      }
      const eventId = String(event.eventId).trim();
      const entityId = String(event.entityId).trim();
      const eventType = String(event.type).trim();
      const callerRole=String(user.role||"");
      if (callerRole==="Denter" && eventType.startsWith("SPARE_PART") && eventType!=="SPARE_PART_DENTER_NOTICE") {
        return reply({ok:false,code:"denter_spare_parts_read_only"},403);
      }
      if (eventType==="SPARE_PART_DENTER_NOTICE" && callerRole!=="Denter") {
        return reply({ok:false,code:"denter_notice_forbidden"},403);
      }
      if (event.actorId && String(event.actorId) !== String(user.id)) return reply({ok:false,code:"actor_mismatch"},403);
      if (!await authorizeV2Event(user,event)) return reply({ok:false,code:"forbidden_event"},403);
      const { data, error } = await admin.rpc("zukait_v2_commit_event", {
        p_event_id:eventId, p_entity_id:entityId, p_actor_id:String(user.id),
        p_device_id:String(event.deviceId||""), p_event_type:eventType, p_client_time:event.clientTime||null,
        p_revision:event.serverRevision==null?null:Number(event.serverRevision),
        p_payload:event.payload && typeof event.payload==="object" ? event.payload : {}
      });
      if (error) {
        const message=String(error.message||"");
        if (message.includes("event_id_conflict")) return reply({ok:false,code:"event_id_conflict"},409);
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
      if (!["Manager","Supervisor"].includes(user.role)) return reply({ok:false,code:"forbidden"},403);
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
      if (action === "v2_report_page" && !["WIP","AUDIT","CYCLE_TIME","EFFICIENCY","REPEAT","ID001","OVERTIME","PARTS_DELAY","CONSUMABLES_VARIANCE","JOB_COST","COMPLETION_TARGET"].includes(report)) {
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

        const unsafeIdeal = (candidate.assign || []).some((a: any) =>
          a && a.job === "ID001" && !a.cancelled && !a.completed && Number(a.idealSafeVersion || 0) < 1
        );
        if (unsafeIdeal) {
          return reply({ ok: false, code: "id001_update_required", revision: current.revision, data: current.data }, 409);
        }

        if (!validateRoleChange(user, current.data, candidate)) {
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

