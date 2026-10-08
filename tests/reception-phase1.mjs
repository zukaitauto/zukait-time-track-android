import fs from "node:fs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const source = fs.readFileSync(
  "app/src/main/assets/v2/features/insurance/reception.js",
  "utf8",
);
const html = fs.readFileSync("app/src/main/assets/offline_test.html", "utf8");
const api = fs.readFileSync("supabase/functions/workshop-api/index.ts", "utf8");
assert.match(html, /script src="v2\/features\/insurance\/reception.js/);
assert.match(api, /p_actor_id:String\(user.id\),p_command:command/);
const dom = new JSDOM('<div id="managerView"></div><div id="modal"></div>', {
  url: "https://test.invalid",
  runScripts: "outside-only",
});
const w = dom.window,
  commands = [],
  records = new Map(),
  requests = new Map();
let failCreate = false,
  failMove = false,
  createCount = 0;
w.me = { id: "MGR001", role: "Manager" };
w.zukaitAuth = { getToken: () => "test-session" };
w.openModal = (h) => (w.document.getElementById("modal").innerHTML = h);
w.closeModal = () => (w.document.getElementById("modal").innerHTML = "");
w.alert = () => {};
w.fetch = async (_url, args) => {
  assert.equal(args.headers["x-zukait-session"], "test-session");
  const b = JSON.parse(args.body);
  assert.equal(b.action, "reception");
  const c = b.command;
  commands.push(c);
  let result = { ok: true };
  if (c.operation === "CAPABILITIES")
    result = { ok: true, allowed: true, manager: true };
  if (c.operation === "MASTER")
    result = { ok: true, companies: [{ id: 1, name: "Liva Insurance" }] };
  if (c.operation === "LIST")
    result = { ok: true, rows: [...records.values()] };
  if (c.operation === "CREATE") {
    if (requests.has(c.request_id)) result = requests.get(c.request_id);
    else {
      const record = {
        rc_no: "RC" + String(++createCount).padStart(4, "0"),
        sequence_no: createCount,
        insurance_id: 1,
        insurance_company: "Liva Insurance",
        details: c.details,
        location: "VIW",
        approval_status: "WAITING",
        revision: 1,
        received_at: "2026-10-08T20:00:00Z",
        can_edit: true,
      };
      records.set(record.rc_no, record);
      result = { ok: true, record };
      requests.set(c.request_id, result);
    }
    if (failCreate) {
      failCreate = false;
      throw Error("Network lost after commit");
    }
  }
  if (c.operation === "GET")
    result = {
      ok: true,
      record: records.get(c.rc_no),
      movements: [
        {
          from_location: null,
          to_location: "VIW",
          occurred_at: "2026-10-08T20:00:00Z",
          actor_id: "MGR001",
          reason: "Vehicle received",
        },
      ],
      audit: [],
    };
  if (c.operation === "MOVE") {
    if (failMove) throw Error("Movement not confirmed");
    const old = records.get(c.rc_no);
    result = {
      ok: true,
      record: { ...old, location: c.location, revision: old.revision + 1 },
    };
    records.set(c.rc_no, result.record);
  }
  return { ok: true, json: async () => structuredClone(result) };
};
w.eval(source);
const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
};
const click = async (action) => {
  const el = w.document.querySelector('[data-rc-action="' + action + '"]');
  assert.ok(el, "missing " + action);
  el.click();
  await settle();
};
const value = (name, v) => {
  w.document.querySelector('[name="' + name + '"]').value = v;
};
const submit = async (id) => {
  w.document
    .getElementById(id)
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await settle();
};
await settle();
assert.equal(w.document.querySelectorAll("[data-rc-menu]").length, 1);
await w.zukaitReception.open();
await click("new");
assert.equal(w.document.querySelectorAll("#rc-form input[required]").length, 2);
assert.equal(
  w.document.querySelectorAll("#rc-form input[type=checkbox]").length,
  9,
);
assert.equal(
  w.document.querySelectorAll("#rc-form input[type=file]").length,
  0,
);
assert.match(
  w.document.getElementById("rc-root").textContent,
  /Unticked means not recorded/,
);
value("make", "Toyota");
value("model", "Camry");
value("insurance_id", "1");
value("damage", "<script>unsafe</script>");
failCreate = true;
await submit("rc-form");
assert.match(w.document.getElementById("rc-error").textContent, /Network lost/);
assert.equal(records.size, 1);
const firstId = commands.find((c) => c.operation === "CREATE").request_id;
await submit("rc-form");
assert.equal(records.size, 1);
assert.equal(
  commands.filter((c) => c.operation === "CREATE").at(-1).request_id,
  firstId,
);
assert.match(w.document.getElementById("rc-root").textContent, /RC0001/);
assert.equal(w.document.querySelectorAll("#rc-root script").length, 0);
assert.match(
  w.document.getElementById("rc-root").textContent,
  /<script>unsafe<\/script>/,
);
await click("movement");
value("reason", "Waiting for parts");
failMove = true;
await submit("rc-move");
assert.equal(records.get("RC0001").location, "VIW");
assert.match(
  w.document.getElementById("rc-error").textContent,
  /Movement not confirmed/,
);
failMove = false;
await submit("rc-move");
assert.equal(records.get("RC0001").location, "VWC");
assert.match(w.document.getElementById("rc-root").textContent, /With customer/);
let pdf = null,
  printed = null;
w.AndroidBridge = {
  shareHtmlAsPdf: (s, n) => (pdf = { s, n }),
  printHtmlNamed: (s, n) => (printed = { s, n }),
};
await click("pdf");
assert.equal(pdf.n, "RC0001.pdf");
assert.match(pdf.s, /Customer Signature/);
assert.match(pdf.s, /Reception Staff Signature/);
assert.match(pdf.s, /&lt;script&gt;unsafe/);
assert.doesNotMatch(pdf.s, /<script>unsafe/);
await click("print");
assert.equal(printed.n, "RC0001");
await click("home");
await click("new");
value("make", "Toyota");
value("model", "Camry");
value("insurance_id", "1");
value("damage", "<script>unsafe</script>");
await submit("rc-form");
assert.equal(
  records.size,
  2,
  "a deliberately new identical checklist needs a new request id",
);
const sample = structuredClone(records.get("RC0001"));
sample.details = {
  make: "Toyota",
  model: "Camry",
  year: "2015",
  customer: "Sample Customer",
  contact: "90000000",
  registration: "12345 A",
  vin: "JTNB1234567890123",
  odometer: "125000",
  odometer_unit: "KM",
  claim: "CL-001",
  damage: "Front bumper and right fender damaged.",
  tools: ["spare_tyre", "jack", "wheel_spanner", "floor_mats"],
  fuel: "Half",
  warnings: "No warning lights recorded.",
  remarks: "Customer waiting for insurance approval.",
};
if (process.env.ZUKAIT_RECEPTION_QA_HTML)
  fs.writeFileSync(
    process.env.ZUKAIT_RECEPTION_QA_HTML,
    w.zukaitReception.documentHtml(sample),
  );
w.me = null;
await settle();
dom.window.close();
console.log(
  "Reception UI: optional fields, accessories, escaped output, retry identity, server-confirmed movements, native print/PDF and separate new checklists passed.",
);
