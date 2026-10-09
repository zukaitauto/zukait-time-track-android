import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
import { webcrypto } from "node:crypto";
let allowedSingleKey = "test-key", allowedKeyMap = "";
let serve,
  actor = {
    user_id: "MGR001",
    display_name: "Manager",
    role: "Manager",
    department: "",
    active: true,
  },
  rpcResult = { data: { ok: true }, error: null },
  lastRpc;
const admin = {
  from: (table) => {
    assert.equal(table, "staff_sessions");
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({
        data: actor
          ? {
              user_id: actor.user_id,
              revoked_at: null,
              last_seen_at: new Date().toISOString(),
              staff_credentials: actor,
            }
          : null,
      }),
    };
    return chain;
  },
  rpc: async (name, args) => {
    lastRpc = { name, args };
    return rpcResult;
  },
};
const source = fs
  .readFileSync("supabase/functions/workshop-api/index.ts", "utf8")
  .replace(/^import[^\n]*\n/gm, "");
const code = stripTypeScriptTypes(source);
vm.runInNewContext(code, {
  Deno: {
    env: { get: (k) => (k === "SUPABASE_PUBLISHABLE_KEY" ? allowedSingleKey : k === "SUPABASE_PUBLISHABLE_KEYS" ? allowedKeyMap : "") },
    serve: (f) => (serve = f),
  },
  createClient: () => admin,
  crypto: webcrypto,
  TextEncoder,
  Response,
  console,
  Date,
});
async function call(body, headers = {}) {
  const res = await serve(
    new Request("https://test.invalid", {
      method: "POST",
      headers: {
        apikey: "test-key",
        "x-zukait-session": "test-session",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}
let r = await call({
  action: "reception",
  command: { operation: "CREATE" },
  user: { id: "EMP019" },
  p_actor_id: "EMP019",
});
assert.equal(r.status, 200);
assert.deepEqual(JSON.parse(JSON.stringify(lastRpc)), {
  name: "zukait_reception_command",
  args: { p_actor_id: "MGR001", p_command: { operation: "CREATE" } },
});
r = await call({ action: "reception", command: [] });
assert.equal(r.status, 400);
r = await call({
  action: "reception",
  command: { operation: "CREATE", details: { remarks: "x".repeat(25000) } },
});
assert.equal(r.status, 400);
rpcResult = { data: null, error: { message: "reception_manager_required" } };
r = await call({ action: "reception", command: { operation: "EDIT" } });
assert.equal(r.status, 403);
rpcResult = { data: null, error: { message: "reception_stale_revision" } };
r = await call({ action: "reception", command: { operation: "EDIT" } });
assert.equal(r.status, 409);
rpcResult = { data: null, error: { message: "reception_not_found" } };
r = await call({ action: "reception", command: { operation: "GET" } });
assert.equal(r.status, 404);
// Exercise the actual Edge handler with a server-verified Receptionist session.
// The DB mock permits only session reads and Reception RPCs: a downstream
// workshop read/write would throw, turning a missing guard into a test failure.
actor = {...actor, user_id: "QA_RC001", role: "Receptionist", department: "Reception"};
const sensitive = {
  ok: true, duplicate: true, allowed: true, manager: true,
  record: {rc_no: "QA-RC", revision: 3, job_card: "QA-JC", details: {
    make: "QA", remarks: "Checklist observation", finalInvoiceAmount: 999},
    decision: {approved_amount: 999}, cancellation_review: {expenses: [999]}},
  rows: [{rc_no: "QA-RC", details: {make: "QA", expenses: [999]}, decision: {amount:999}}],
  companies: [{id: 1, name: "QA insurance", active: true, private: "SECRET"}],
  movements: [{id: 1, to_location: "VWC", reason: "Customer movement", secret: "SECRET"}],
  audit: [{id: 1, operation: "CREATE", reason: "Checklist", before_data: {amount:999}, after_data: {amount:999}},
    {id:2, operation:"RECORD_APPROVAL", reason:"SECRET", after_data:{amount:999}}],
  insurance: {approval_valid:true, can_prepare:true, can_revoke:true, estimates:[{amount:999}], approvals:[{approved_amount:999}]},
  job_creation: {can_create:true, transfers:[{list_no:"SECRET"}]},
  preliminary_parts: {items:[{price:999}]}, additional: {approvals:[{amount:999}]},
  cancellation: {review:{expenses:999}}, workshop_state: {expenses:[999]}, staff: [{password_hash:"SECRET"}],
};
rpcResult = {data:sensitive, error:null};
for (const op of ["CAPABILITIES", "MASTER", "LIST", "GET", "CREATE", "EDIT", "MOVE", "CREATE_JOB", "CREATE_DIRECT_JOB", "CREATE_EXTERNAL_JOB"]) {
  lastRpc = null;
  r = await call({action:"reception", command:{operation:op}, user:{id:"MGR001", role:"Manager"}});
  assert.equal(r.status, 200, op);
  assert.equal(lastRpc.args.p_actor_id, "QA_RC001", op);
  assert.equal(r.body.manager, false);
  assert.deepEqual(r.body.insurance, {can_prepare:false, can_revoke:false, approval_valid:true});
  assert.deepEqual(r.body.job_creation, {can_create:true});
  assert.equal(r.body.record.details.remarks, "Checklist observation");
  assert.equal(r.body.movements[0].to_location, "VWC");
  assert.equal(r.body.audit.length, 1);
  assert.ok(!JSON.stringify(r.body).includes("999"), op + " financial leak");
  assert.ok(!JSON.stringify(r.body).includes("SECRET"), op + " private leak");
}
const actions = [...source.matchAll(/action === ["']([^"']+)["']/g)].map(m=>m[1]);
let denials = 0;
for (const action of new Set([...actions, "load", "save", "qc_delivery", "unknown", "Reception", " reception"])) {
  if (action === "reception") continue;
  lastRpc = null;
  r = await call({action, operation:"DELIVER", command:{operation:"GET"}, user:{role:"Manager"}, role:"Manager"});
  assert.equal(r.status, 403, action);
  assert.equal(r.body.code, "receptionist_forbidden", action);
  assert.equal(lastRpc, null, action);
  denials++;
}
for (const operation of ["STAFF", "ACCESS", "CLOSE", "CANCEL_JOB", "RECORD_APPROVAL", "RECORD_EXTERNAL_APPROVAL", "REVOKE_APPROVAL", "LINK_ESTIMATE",
  "SAVE_PRELIMINARY", "ADDITIONAL_REQUEST", "DELIVER", "GET ", "get", null, {}, ["GET"]]) {
  lastRpc = null;
  r = await call({action:"reception", command:{operation}, user:{role:"Manager"}});
  assert.equal(r.status, 403, JSON.stringify(operation));
  assert.equal(lastRpc, null);
  denials++;
}
r = await call({}); // The default action must not load shared state.
assert.equal(r.status, 403);
lastRpc = null;
rpcResult = {data:null, error:{message:"reception_job_forbidden"}};
r = await call({action:"reception", command:{operation:"CREATE_JOB"}});
assert.equal(r.status, 403); // Edge allowlist never overrides SQL authorization.
actor = {...actor, role:"Manager"};
rpcResult = {data:sensitive, error:null};
r = await call({action:"reception", command:{operation:"GET"}});
assert.deepEqual(r.body, sensitive); // Existing authorized roles retain their response.
console.log(`Receptionist API: 10 allowed operations, ${denials + 1} forbidden requests, server identity, response privacy and SQL guard preservation passed.`);
actor = null;
r = await call({ action: "reception", command: { operation: "LIST" } });
assert.equal(r.status, 401);
r = await call(
  { action: "reception", command: { operation: "LIST" } },
  { apikey: "wrong" },
);
assert.equal(r.status, 401);
console.log(
  "Reception API: verified-session identity, actor spoofing rejection, input limits, revoked sessions and conflict/permission status mapping passed.",
);


actor = {user_id:"QA-MGR",display_name:"QA Manager",role:"Manager",department:"Reception",active:true};
rpcResult = {data:{ok:true},error:null};
allowedSingleKey = "";
allowedKeyMap = "";
r = await call({action:"reception",command:{operation:"CAPABILITIES"}},{apikey:"sb_publishable_unrelated"});
assert.equal(r.status,401,"No configured allowlist must reject a prefixed key");
r = await call({action:"reception",command:{operation:"CAPABILITIES"}});
assert.equal(r.status,401,"No configured allowlist must reject even a previously valid key");
allowedKeyMap = "{malformed";
r = await call({action:"reception",command:{operation:"CAPABILITIES"}});
assert.equal(r.status,401,"Malformed key map must fail closed");
allowedKeyMap = JSON.stringify({default:"test-key"});
r = await call({action:"reception",command:{operation:"CAPABILITIES"}});
assert.equal(r.status,200,"Supabase-provided publishable key map must allow its exact key");
r = await call({action:"reception",command:{operation:"CAPABILITIES"}},{apikey:"sb_publishable_unrelated"});
assert.equal(r.status,401,"Configured key map must deny other keys");
console.log("Workshop Edge publishable API key: missing/malformed allowlist denied; exact configured JSON key accepted; arbitrary prefix denied.");
