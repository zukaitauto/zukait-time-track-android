
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
  // No prefix-based fallback: this API is called with verify_jwt=false.
  // Supabase supplies modern project keys through SUPABASE_PUBLISHABLE_KEYS.
  // Missing or malformed allowlists must fail closed, not accept arbitrary keys.
  return keys.length > 0 && keys.includes(supplied);
}

function b64ToBytes(s: string) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
function bytesToB64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function bytesToB64Url(bytes: Uint8Array) {
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function derive(password: string, saltB64: string, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: b64ToBytes(saltB64), iterations, hash: "SHA-256" },
    key, 256
  );
  return bytesToB64(new Uint8Array(bits));
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function newSalt() {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
}
async function createSession(userId: string) {
  const token = bytesToB64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const { error } = await admin.from("staff_sessions").insert({
    token_hash: tokenHash,
    user_id: userId,
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    revoked_at: null
  });
  if (error) throw error;
  return token;
}
async function revokeSessions(userId: string) {
  const { error } = await admin.from("staff_sessions").update({
    revoked_at: new Date().toISOString()
  }).eq("user_id", userId).is("revoked_at", null);
  if (error) throw error;
}
async function verifySession(token: string) {
  if (!token) return null;
  const hash = await sha256Hex(token);
  const { data: session, error } = await admin.from("staff_sessions")
    .select("user_id,revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !session || session.revoked_at) return null;

  const { data: staff, error: staffError } = await admin.from("staff_credentials")
    .select("user_id,display_name,role,department,active,must_change")
    .eq("user_id", session.user_id)
    .maybeSingle();
  if (staffError || !staff || !staff.active || (staff.role==='Accountant'&&staff.must_change)) return null;

  await admin.from("staff_sessions").update({ last_seen_at: new Date().toISOString() })
    .eq("token_hash", hash);

  return {
    tokenHash: hash,
    user: { id: staff.user_id, name: staff.display_name, role: staff.role, department: staff.department }
  };
}
async function authUser(userId: string, password: string) {
  let id = String(userId || "").trim().toUpperCase();
  // Existing staff may have legacy punctuation in their immutable login ID.
  // New Accountant aliases remain strictly validated by account management.
  if(!id||id.length>200||/[\u0000-\u001f\u007f]/.test(id))return {ok:false,code:"invalid"};
  let { data, error } = await admin.from("staff_credentials")
    .select("user_id,display_name,role,department,login_id,password_hash,password_salt,password_iterations,active,must_change,failed_attempts,locked_until")
    .eq("user_id", id).maybeSingle();
  if(error)throw error;
  if(!data){const alias=await admin.from('staff_credentials').select('user_id,display_name,role,department,login_id,password_hash,password_salt,password_iterations,active,must_change,failed_attempts,locked_until').eq('login_id',id).maybeSingle();if(alias.error)throw alias.error;data=alias.data;}
  if(data?.login_id&&data.login_id!==id)return {ok:false,code:'invalid'};
  if(data)id=data.user_id;
  if (!data || !data.active) return { ok: false, code: "invalid" };

  if (data.locked_until && new Date(data.locked_until).getTime() > Date.now()) {
    return { ok: false, code: "locked", locked_until: data.locked_until };
  }

  const candidate = await derive(String(password || ""), data.password_salt, data.password_iterations);
  if (!safeEqual(candidate, data.password_hash)) {
    const failed = Number(data.failed_attempts || 0) + 1;
    const locked = failed >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
    await admin.from("staff_credentials").update({
      failed_attempts: locked ? 0 : failed,
      locked_until: locked,
      updated_at: new Date().toISOString()
    }).eq("user_id", id);
    return { ok: false, code: locked ? "locked" : "invalid", locked_until: locked };
  }

  await admin.from("staff_credentials").update({
    failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString()
  }).eq("user_id", id);

  return {
    ok: true,
    user: { id: data.user_id, name: data.display_name, role: data.role, department: data.department },
    must_change: !!data.must_change
  };
}
async function passwordFields(newPassword: string) {
  if (typeof newPassword !== "string" || newPassword.length < 8) return null;
  const salt = newSalt();
  const iterations = 210000;
  const hash = await derive(newPassword, salt, iterations);
  return { password_hash: hash, password_salt: salt, password_iterations: iterations };
}
async function setPassword(userId: string, newPassword: string, mustChange: boolean) {
  const fields = await passwordFields(newPassword);
  if (!fields) return { ok: false, code: "weak" };
  const { error } = await admin.from("staff_credentials").update({
    ...fields, must_change: mustChange, failed_attempts: 0, locked_until: null,
    updated_at: new Date().toISOString()
  }).eq("user_id", String(userId || "").trim().toUpperCase());
  if (error) throw error;
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ ok: false, code: "method" }, 405);
  if (!allowedApiKey(req)) return reply({ ok: false, code: "bad_api_key" }, 401);

  try {
    const body = await req.json();
    const action = String(body?.action || "login");

    if (action === "login") {
      const result = await authUser(body.user_id, body.password);
      if (!result.ok) return reply(result, result.code === "locked" ? 423 : 401);
      const session_token = await createSession(result.user!.id);
      return reply({ ...result, session_token });
    }

    if (action === "session") {
      const s = await verifySession(String(body.session_token || ""));
      if (!s) return reply({ ok: false, code: "invalid_session" }, 401);
      return reply({ ok: true, user: s.user });
    }

    if (action === "logout") {
      const token = String(body.session_token || "");
      const hash = token ? await sha256Hex(token) : "";
      if (hash) await admin.from("staff_sessions").update({ revoked_at: new Date().toISOString() })
        .eq("token_hash", hash);
      return reply({ ok: true });
    }

    if (action === "verify_password") {
      const auth = await authUser(body.user_id, body.password);
      if (!auth.ok) return reply(auth, auth.code === "locked" ? 423 : 401);
      return reply({ ok: true, user: auth.user });
    }

    if (action === "change_password") {
      const auth = await authUser(body.user_id, body.current_password);
      if (!auth.ok) return reply(auth, auth.code === "locked" ? 423 : 401);
      const changed = await setPassword(auth.user!.id, body.new_password, false);
      if (!changed.ok) return reply(changed, 400);
      await revokeSessions(auth.user!.id);
      const session_token = await createSession(auth.user!.id);
      return reply({ ok: true, session_token });
    }

    if(action==='manager_accountant'){
      if(Object.keys(body).some(k=>!['action','session_token','request_id','command'].includes(k)))return reply({ok:false,code:'invalid_account_command'},400);
      const session=await verifySession(String(body.session_token||''));if(!session||session.user.role!=='Manager')return reply({ok:false,code:'manager_required'},403);
      const c=body.command;if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['operation','target_id','login_id','name','temporary_password','active','reason','audit_offset'].includes(k))||!['LIST','CREATE','RESET','RENAME','ACTIVE'].includes(c.operation))return reply({ok:false,code:'invalid_account_command'},400);
      if(c.audit_offset!==undefined&&(!Number.isInteger(c.audit_offset)||c.audit_offset<0||c.audit_offset>1000000))return reply({ok:false,code:'invalid_account_command'},400);
      if(c.operation!=='LIST'&&(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id||'')||typeof c.reason!=='string'||c.reason.trim().length<3||c.reason.length>2000))return reply({ok:false,code:'invalid_account_command'},400);
      const canonical=(v:any):any=>v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
      const hkey=await crypto.subtle.importKey('raw',new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const fingerprint=[...new Uint8Array(await crypto.subtle.sign('HMAC',hkey,new TextEncoder().encode(JSON.stringify(canonical(body)))))].map(x=>x.toString(16).padStart(2,'0')).join('');
      const command:any={...c,target_id:String(c.target_id||'').trim().toUpperCase(),login_id:c.login_id?String(c.login_id).trim().toUpperCase():undefined};delete command.temporary_password;
      if(['CREATE','RESET'].includes(c.operation)){const fields=await passwordFields(String(c.temporary_password||''));if(!fields)return reply({ok:false,code:'weak'},400);Object.assign(command,fields);}
      if(c.operation==='CREATE'&&(!String(c.name||'').trim()||String(c.name).length>200))return reply({ok:false,code:'invalid_name'},400);
      const result=await admin.rpc('zukait_manager_accountants',{p_actor_id:session.user.id,p_request_id:body.request_id||null,p_fingerprint:fingerprint,p_command:command});
      if(result.error){const msg=String(result.error.message);const code=['manager_required','request_conflict','login_id_exists','invalid_login_id','accountant_not_found','invalid_account_command','invalid_active_flag'].find(x=>msg.includes(x));return reply({ok:false,code:code||'accountant_accounts_unavailable'},code==='manager_required'?403:code==='request_conflict'||code==='login_id_exists'?409:code?400:503);}
      return reply(result.data);
    }

    if (action === "manager_reset") {
      const manager = await authUser(body.manager_id, body.manager_password);
      if (!manager.ok) return reply(manager, manager.code === "locked" ? 423 : 401);
      if (manager.user?.role !== "Manager") return reply({ ok: false, code: "forbidden" }, 403);
      const target = String(body.target_id || "").trim().toUpperCase();
      const { data: exists } = await admin.from("staff_credentials").select("user_id,role")
        .eq("user_id", target).maybeSingle();
      if (!exists) return reply({ ok: false, code: "not_found" }, 404);
      if(exists.role==='Accountant')return reply({ok:false,code:'use_accountant_accounts'},400);
      const changed = await setPassword(target, body.new_password, true);
      if (!changed.ok) return reply(changed, 400);
      await revokeSessions(target);
      return reply({ ok: true, target_id: target });
    }

    if (action === "manager_create") {
      const manager = await authUser(body.manager_id, body.manager_password);
      if (!manager.ok) return reply(manager, manager.code === "locked" ? 423 : 401);
      if (manager.user?.role !== "Manager") return reply({ ok: false, code: "forbidden" }, 403);

      const id = String(body.user_id || "").trim().toUpperCase();
      const name = String(body.display_name || "").trim();
      const role = String(body.role || "");
      if(role==='Accountant')return reply({ok:false,code:'use_accountant_accounts'},400);
      const department = role === "Receptionist" ? "Reception" : role === "Accountant" ? "Accounts" : String(body.department || "").trim();
      if (!/^[A-Z0-9_-]+$/.test(id) || !name || !["Employee","Supervisor","Purchaser","Receptionist","Accountant"].includes(role) || !department) {
        return reply({ ok: false, code: "invalid_user" }, 400);
      }
      const fields = await passwordFields(String(body.password || ""));
      if (!fields) return reply({ ok: false, code: "weak" }, 400);
      const { data: existing } = await admin.from("staff_credentials").select("user_id")
        .eq("user_id", id).maybeSingle();
      if (existing) return reply({ ok: false, code: "exists" }, 409);

      const { error } = await admin.from("staff_credentials").insert({
        user_id: id, display_name: name, role, department, ...fields,
        active: true, must_change: true, failed_attempts: 0, locked_until: null
      });
      if (error) throw error;
      return reply({ ok: true, user: { id, name, role, department } });
    }

    return reply({ ok: false, code: "unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return reply({ ok: false, code: "server_error" }, 500);
  }
});

