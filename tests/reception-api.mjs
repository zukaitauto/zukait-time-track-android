import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
import { webcrypto } from "node:crypto";
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
    env: { get: (k) => (k === "SUPABASE_PUBLISHABLE_KEY" ? "test-key" : "") },
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
