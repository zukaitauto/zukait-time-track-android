(function () {
  "use strict";
  const API =
      "https://pjknotnjkufadqavcmii.supabase.co/functions/v1/workshop-api",
    KEY = "sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A";
  const tools = [
    ["spare_tyre", "Spare tyre"],
    ["jack", "Jack"],
    ["wheel_spanner", "Wheel spanner"],
    ["tool_kit", "Tool kit"],
    ["spare_key", "Spare key"],
    ["warning_triangle", "Warning triangle"],
    ["first_aid_kit", "First aid kit"],
    ["floor_mats", "Floor mats"],
    ["other", "Other accessories"],
  ];
  const fields = [
    ["make", "Vehicle Make", true],
    ["model", "Vehicle Model", true],
    ["customer", "Customer Name"],
    ["contact", "Contact Number"],
    ["registration", "Registration Number"],
    ["year", "Model Year"],
    ["vin", "VIN / Chassis"],
    ["odometer", "KM / Miles Reading"],
    ["claim", "Claim Number / Gate Pass"],
  ];
  const textFields = [
    ["damage", "Damage Description"],
    ["other_accessories", "Other Accessories"],
    ["warnings", "Dashboard Warning Lights"],
    ["remarks", "Other Remarks"],
  ];
  const labels = {
    WAITING: "Waiting for approval",
    APPROVED: "Approved",
    VIW: "VIW · In workshop",
    VWC: "VWC · With customer",
    CTL: "CTL",
    CASH_LOSS: "Cash Loss",
    CANCELLED: "Cancelled",
    JOB_CREATED: "Job Card created",
  };
  let current = null,
    companies = [],
    busy = false,
    pending = null,
    listRequest = 0,
    rows = [],
    caps = { allowed: false, manager: false },
    capUser = "",
    capBusy = false;
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const user = () => (typeof me !== "undefined" ? me : window.me);
  const uid = () => crypto.randomUUID();
  const stamp = (v) =>
    v
      ? new Date(v).toLocaleString("en-GB", {
          timeZone: "Asia/Muscat",
          hour12: true,
        })
      : "—";
  function style() {
    if (document.getElementById("rc-style")) return;
    const e = document.createElement("style");
    e.id = "rc-style";
    e.textContent = `
.rc{font-size:17px;color:#18324a;background:#f3f8fc;padding:16px;border-radius:20px}.rc *{box-sizing:border-box}.rc h3{font-size:24px;margin:8px 0 16px}.rc h4{font-size:19px;margin:12px 0}.rc button{font-size:16px!important;min-height:46px;margin:0!important;border-radius:12px!important}.rc input,.rc select,.rc textarea{font-size:17px!important;width:100%;min-height:46px;background:white;color:#18324a;border:1px solid #b7cbd9;border-radius:10px;padding:10px;margin-top:6px}.rc label{display:block;font-weight:700}.rc textarea{min-height:95px;resize:vertical}.rc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.rc-box{padding:14px;border:1px solid #d2e1eb;background:#fff;border-radius:15px;margin-top:12px;overflow-wrap:anywhere}.rc-actions{display:flex;flex-wrap:wrap;gap:9px;margin:12px 0}.rc-badge{display:inline-block;border-radius:20px;background:#e0eff8;color:#174b6b;padding:6px 11px;margin:3px;font-size:15px;font-weight:800}.rc-badge[data-value=VWC]{background:#fff0c9;color:#765000}.rc-badge[data-value=VIW]{background:#d9f5ea;color:#125340}.rc-badge[data-value=CTL],.rc-badge[data-value=CANCELLED]{background:#fee2e2;color:#8c2632}.rc-check{display:flex!important;gap:10px;align-items:center;font-weight:600!important}.rc-check input{width:24px!important;min-height:24px!important;margin:0}.rc-error{color:#9c2434;font-weight:700}.rc small{font-size:14px;color:#45627a}.rc-menu{background:linear-gradient(145deg,#e1f5f4,#f3faff)!important;color:#164e63!important;border:1px solid #afd8dc!important;box-shadow:0 6px 16px #163b5415}.rc-history{max-height:360px;overflow:auto}.rc summary{cursor:pointer;padding:10px;font-weight:700}@media(max-width:480px){.rc{padding:10px}.rc-grid{gap:9px}.rc-actions button{flex:1 1 40%}.rc-wide{grid-column:1/-1}}`;
    document.head.appendChild(e);
  }
  function shell(title, body) {
    style();
    openModal(
      '<section class="rc" id="rc-root"><div class="rc-actions"><button data-rc-action="home">Reception List</button><button data-rc-action="close">Close</button></div><h3>' +
        esc(title) +
        '</h3><div id="rc-error" class="rc-error" role="alert"></div>' +
        body +
        "</section>",
    );
    document.getElementById("rc-root").addEventListener("click", dispatch);
  }
  function error(e) {
    const el = document.getElementById("rc-error");
    if (el) el.textContent = e.message || String(e);
  }
  async function call(command) {
    const token = window.zukaitAuth?.getToken?.();
    if (!token) throw Error("Please sign in.");
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: KEY,
        "x-zukait-session": token,
      },
      body: JSON.stringify({ action: "reception", command }),
    });
    const r = await res.json();
    if (!res.ok || !r.ok) {
      const msgs = {
        reception_stale_revision:
          "This checklist changed on another device. Open the list and reload it before editing.",
        reception_manager_required: "Only the Manager can perform this action.",
        reception_forbidden:
          "Reception access is not designated for your account.",
        reception_handover_required:
          "Confirm vehicle handover using VWC and enter the recipient before closing CTL or Cash Loss.",
        reception_unavailable: "Reception backend is not available yet.",
        reception_linked_identity_requires_phase2:
          "Linked vehicle corrections require the Phase 2 integration.",
      };
      throw Error(
        msgs[r.code] ||
          String(r.code || "Server could not confirm this action.").replaceAll(
            "_",
            " ",
          ),
      );
    }
    return r;
  }
  async function master() {
    companies = (await call({ operation: "MASTER" })).companies || [];
  }
  function badge(v) {
    return (
      '<span class="rc-badge" data-value="' +
      esc(v) +
      '">' +
      esc(labels[v] || v) +
      "</span>"
    );
  }
  function badges(r) {
    return (
      badge(r.location) +
      (r.outcome
        ? badge(r.outcome)
        : badge(r.job_card ? "JOB_CREATED" : r.approval_status))
    );
  }
  function input(k, label, value = "", required = false, type = "text") {
    return (
      "<label>" +
      esc(label) +
      (required ? " *" : "") +
      '<input name="' +
      k +
      '" type="' +
      type +
      '" maxlength="' +
      (k === "year" ? 4 : k === "vin" ? 64 : 2000) +
      '" value="' +
      esc(value) +
      '" ' +
      (required ? "required" : "") +
      "></label>"
    );
  }
  function select(k, label, values, value) {
    return (
      '<label class="' + (k === "insurance_id" ? "rc-wide" : "") + '">' +
      esc(label) +
      '<select name="' +
      k +
      '">' +
      values
        .map(
          ([v, l]) =>
            '<option value="' +
            esc(v) +
            '" ' +
            (String(v) === String(value) ? "selected" : "") +
            ">" +
            esc(l) +
            "</option>",
        )
        .join("") +
      "</select></label>"
    );
  }
  async function home() {
    current = null;
    shell(
      "Insurance Reception",
      '<div class="rc-actions"><button data-rc-action="new">+ New Checklist</button>' +
        (caps.manager
          ? '<button data-rc-action="staff">Reception Access</button>'
          : "") +
        '</div><div class="rc-grid">' +
        input("search", "Search RC / Reg / Customer / Insurance / VIN") +
        select(
          "filter",
          "Status",
          [["ALL", "All"], ...Object.entries(labels)],
          "ALL",
        ) +
        '</div><div id="rc-results" aria-live="polite"></div><button data-rc-action="more" id="rc-more" hidden>Load more</button>',
    );
    const root = document.getElementById("rc-root");
    root.querySelector("[name=search]").addEventListener("input", () => {
      clearTimeout(home.timer);
      home.timer = setTimeout(() => loadList(false).catch(error), 250);
    });
    root
      .querySelector("[name=filter]")
      .addEventListener("change", () => loadList(false).catch(error));
    await loadList(false);
  }
  async function loadList(more) {
    const el = document.getElementById("rc-results");
    if (!el) return;
    const seq = ++listRequest,
      search = document.querySelector("#rc-root [name=search]").value,
      filter = document.querySelector("#rc-root [name=filter]").value;
    const r = await call({
      operation: "LIST",
      search,
      filter,
      ...(more && rows.length
        ? { before_sequence: rows.at(-1).sequence_no }
        : {}),
    });
    if (seq !== listRequest || !el.isConnected) return;
    rows = more ? [...rows, ...r.rows] : r.rows;
    el.innerHTML =
      rows
        .map(
          (x) =>
            '<article class="rc-box"><h4>' +
            esc(x.rc_no) +
            " · " +
            esc(
              [x.details.make, x.details.model, x.details.year]
                .filter(Boolean)
                .join(" "),
            ) +
            "</h4>" +
            badges(x) +
            "<p>" +
            esc(x.details.registration || "Registration not recorded") +
            "<br>" +
            esc(x.insurance_company) +
            "<br>" +
            esc(x.details.customer || "Customer not recorded") +
            '</p><button data-rc-action="view" data-rc="' +
            esc(x.rc_no) +
            '">Open Checklist</button></article>',
        )
        .join("") || "<p>No reception checklists found.</p>";
    document.getElementById("rc-more").hidden = r.rows.length < 100;
  }
  async function editor(no) {
    pending = null;
    await master();
    if (no) await fetchRecord(no);
    else current = null;
    const d = current?.record.details || {},
      r = current?.record;
    const options = [
      ["", "Select Insurance Company"],
      ...companies.map((c) => [c.id, c.name]),
    ];
    if (r && !companies.some((c) => c.id === r.insurance_id))
      options.push([r.insurance_id, r.insurance_company]);
    shell(
      r ? "Edit " + r.rc_no : "New Reception Checklist",
      '<form id="rc-form"><p>* Only Insurance Company, Make and Model are required.</p><div class="rc-grid">' +
        select(
          "insurance_id",
          "Insurance Company *",
          options,
          r?.insurance_id || "",
        ) +
        fields.map(([k, l, req]) => input(k, l, d[k], req)).join("") +
        select(
          "odometer_unit",
          "Reading Unit",
          [
            ["KM", "KM"],
            ["Miles", "Miles"],
          ],
          d.odometer_unit || "KM",
        ) +
        '</div><div class="rc-box"><h4>Tools and Accessories</h4><p><small>Tick recorded accessories individually. Unticked means not recorded.</small></p><div class="rc-grid">' +
        tools
          .map(
            ([k, l]) =>
              '<label class="rc-check"><input type="checkbox" name="tools" value="' +
              k +
              '" ' +
              ((d.tools || []).includes(k) ? "checked" : "") +
              ">" +
              l +
              "</label>",
          )
          .join("") +
        '</div></div><div class="rc-box">' +
        select(
          "fuel",
          "Fuel Level",
          [
            ["", "Not recorded"],
            ...["Empty", "Quarter", "Half", "Three quarters", "Full"].map(
              (v) => [v, v],
            ),
          ],
          d.fuel || "",
        ) +
        textFields
          .map(
            ([k, l]) =>
              "<label>" +
              l +
              '<textarea name="' +
              k +
              '" maxlength="2000">' +
              esc(d[k] || "") +
              "</textarea></label>",
          )
          .join("") +
        '</div><div class="rc-actions"><button type="submit">Save Checklist</button></div></form>',
    );
    document.querySelector("#rc-form [name=insurance_id]").required = true;
    document.getElementById("rc-form").addEventListener("submit", saveForm);
  }
  async function fetchRecord(no) {
    current = await call({ operation: "GET", rc_no: no });
    return current;
  }
  async function view(no) {
    await fetchRecord(no);
    const r = current.record,
      d = r.details;
    shell(
      r.rc_no + " · Reception Checklist",
      badges(r) +
        '<div class="rc-actions">' +
        (r.can_edit ? '<button data-rc-action="edit">Edit</button>' : "") +
        (!r.outcome
          ? '<button data-rc-action="movement">Record Vehicle Movement</button>'
          : "") +
        (!r.job_card && !r.outcome
          ? '<button data-rc-action="outcome">Close Insurance Case</button>'
          : "") +
        '<button data-rc-action="print">Print</button><button data-rc-action="pdf">Share PDF</button></div><div class="rc-grid"><div class="rc-box"><h4>Customer & Vehicle</h4>' +
        [
          ["Insurance", r.insurance_company],
          ...fields.map(([k, l]) => [l, d[k]]),
          ["Received", stamp(r.received_at)],
          ["Job Card", r.job_card],
        ]
          .map(
            ([l, v]) =>
              "<p><small>" +
              esc(l) +
              "</small><br><b>" +
              esc(v || "Not recorded") +
              "</b></p>",
          )
          .join("") +
        '</div><div class="rc-box"><h4>Reception Observations</h4>' +
        textFields
          .map(
            ([k, l]) =>
              "<p><small>" +
              l +
              "</small><br>" +
              esc(d[k] || "Not recorded") +
              "</p>",
          )
          .join("") +
        "<p>Fuel: " +
        esc(d.fuel || "Not recorded") +
        "</p><h4>Tools & Accessories</h4>" +
        tools
          .map(
            ([k, l]) =>
              "<p>" +
              ((d.tools || []).includes(k) ? "✓ " : "□ ") +
              l +
              " · " +
              ((d.tools || []).includes(k) ? "Recorded" : "Not recorded") +
              "</p>",
          )
          .join("") +
        "</div></div>" +
        (r.decision
          ? '<div class="rc-box"><h4>Case Decision</h4>' +
            esc(r.decision.reason) +
            "<p>Handover to: " +
            esc(r.decision.handover_to || "Not recorded") +
            "</p><p>" +
            esc(stamp(r.decision.at)) +
            " · " +
            esc(r.decision.by) +
            "</p></div>"
          : "") +
        '<div class="rc-box"><h4>Vehicle Movement History</h4><div class="rc-history">' +
        current.movements
          .map(
            (m) =>
              "<p><b>" +
              esc(m.from_location || "Received") +
              " → " +
              esc(m.to_location) +
              "</b><br>" +
              esc(stamp(m.occurred_at)) +
              " · " +
              esc(m.actor_id) +
              "<br>" +
              esc(m.reason) +
              (m.expected_return_date
                ? "<br>Expected return: " + esc(m.expected_return_date)
                : "") +
              "</p>",
          )
          .join("") +
        '</div></div><div class="rc-box"><h4>Audit History</h4><div class="rc-history">' +
        current.audit
          .map(
            (a) =>
              "<details><summary>" +
              esc(a.operation) +
              " · " +
              esc(stamp(a.at)) +
              " · " +
              esc(a.actor_id) +
              "</summary><p>" +
              esc(a.reason || "") +
              '</p><pre style="white-space:pre-wrap;font-size:13px">Before: ' +
              esc(JSON.stringify(a.before_data, null, 2)) +
              "\nAfter: " +
              esc(JSON.stringify(a.after_data, null, 2)) +
              "</pre></details>",
          )
          .join("") +
        "</div></div>",
    );
  }
  async function mutate(command) {
    if (busy) return null;
    busy = true;
    const encoded = JSON.stringify(command);
    if (!pending || pending.encoded !== encoded)
      pending = { encoded, request_id: uid() };
    try {
      return await call({ ...command, request_id: pending.request_id });
    } finally {
      busy = false;
    }
  }
  async function saveForm(e) {
    e.preventDefault();
    const f = new FormData(e.target),
      details = {};
    fields.forEach(([k]) => (details[k] = String(f.get(k) || "")));
    textFields.forEach(([k]) => (details[k] = String(f.get(k) || "")));
    details.tools = f.getAll("tools");
    details.odometer_unit = String(f.get("odometer_unit"));
    details.fuel = String(f.get("fuel") || "");
    if (window.zukaitNormalizeVehicle) {
      const v =
        window.zukaitNormalizeVehicle(details.make, details.model, "") || {};
      details.make = v.make || details.make;
      details.model = v.model || details.model;
    }
    try {
      const r = await mutate({
        operation: current ? "EDIT" : "CREATE",
        insurance_id: Number(f.get("insurance_id")),
        details,
        ...(current
          ? {
              rc_no: current.record.rc_no,
              expected_revision: current.record.revision,
            }
          : {}),
      });
      if (r) await view(r.record.rc_no);
    } catch (x) {
      error(x);
    }
  }
  function movement() {
    const r = current.record;
    const to = r.location === "VIW" ? "VWC" : "VIW";
    shell(
      r.rc_no + " · Vehicle Movement",
      '<form id="rc-move">' +
        badge(r.location) +
        " → " +
        badge(to) +
        "<p>Times are recorded in Oman time. Leave the date/time empty to use server time.</p>" +
        input(
          "occurred_at",
          "Movement Date & Time (Oman)",
          "",
          false,
          "datetime-local",
        ) +
        input(
          "expected_return_date",
          "Expected Return Date (optional)",
          "",
          false,
          "date",
        ) +
        input("reason", "Reason", "", true) +
        '<div class="rc-actions"><button type="submit">Confirm ' +
        to +
        "</button></div></form>",
    );
    document.getElementById("rc-move").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target),
        date = String(f.get("occurred_at") || "");
      try {
        const out = await mutate({
          operation: "MOVE",
          rc_no: r.rc_no,
          expected_revision: r.revision,
          location: to,
          reason: String(f.get("reason")),
          occurred_at: date ? new Date(date + "+04:00").toISOString() : null,
          expected_return_date:
            to === "VWC" ? String(f.get("expected_return_date") || "") : "",
        });
        if (out) await view(r.rc_no);
      } catch (x) {
        error(x);
      }
    });
  }
  function outcome() {
    const r = current.record;
    shell(
      r.rc_no + " · Close Insurance Case",
      '<form id="rc-outcome"><p>CTL and Cash Loss require a recorded handover (VWC). Closing a reception case does not record delivery or workshop income.</p>' +
        select(
          "outcome",
          "Case Outcome",
          [
            ["CTL", "CTL"],
            ["CASH_LOSS", "Cash Loss"],
            ["CANCELLED", "Cancelled"],
          ],
          "CTL",
        ) +
        input("reason", "Decision / Reason", "", true) +
        input("handover_to", "Handover Recipient (CTL / Cash Loss)") +
        '<div class="rc-actions"><button type="submit">Confirm Case Closure</button></div></form>',
    );
    document
      .getElementById("rc-outcome")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
          const out = await mutate({
            operation: "CLOSE",
            rc_no: r.rc_no,
            expected_revision: r.revision,
            outcome: String(f.get("outcome")),
            reason: String(f.get("reason")),
            handover_to: String(f.get("handover_to")),
          });
          if (out) await view(r.rc_no);
        } catch (x) {
          error(x);
        }
      });
  }
  async function staff() {
    const r = await call({ operation: "STAFF" });
    shell(
      "Designated Reception Staff",
      r.staff
        .map(
          (s) =>
            '<div class="rc-box"><b>' +
            esc(s.name) +
            "</b> · " +
            esc(s.role) +
            '<div class="rc-actions">' +
            (["Manager", "Supervisor"].includes(s.role)
              ? "Access included with role"
              : '<button data-rc-action="access" data-user="' +
                esc(s.id) +
                '" data-active="' +
                String(!s.designated) +
                '">' +
                (s.designated
                  ? "Remove Reception Access"
                  : "Designate Reception Access") +
                "</button>") +
            "</div></div>",
        )
        .join(""),
    );
  }
  function documentHtml(r) {
    const d = r.details;
    return (
      '<!doctype html><html><head><meta charset="UTF-8"><title>' +
      esc(r.rc_no) +
      "</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#18324a;font:12px Arial,sans-serif}header{border-bottom:2px solid #165b68;display:flex;justify-content:space-between;padding-bottom:10px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:5px 0}h3{font-size:13px;background:#edf4f7;padding:7px;margin:12px 0 5px}table{border-collapse:collapse;width:100%;table-layout:fixed}td{padding:6px;border-bottom:1px solid #dce5e9;vertical-align:top;overflow-wrap:anywhere}td small{display:block;color:#546977;margin-bottom:3px}.observation{white-space:pre-wrap;overflow-wrap:anywhere;min-height:35px;padding:5px;break-inside:avoid}.sign{display:flex;justify-content:space-between;margin-top:35px;break-inside:avoid}.sign div{width:43%;padding-top:20px;border-top:1px solid #475569}footer{margin-top:20px;font-size:10px;color:#546977}.tools td{padding:7px}section{break-inside:avoid}</style></head><body><header><div><h1>ZUKAIT AUTO SERVICES</h1><small>Zukait International LLC · Oman</small><h2>Insurance Vehicle Reception Checklist</h2></div><div><h2>" +
      esc(r.rc_no) +
      "</h2>" +
      esc(stamp(r.received_at)) +
      "<br>" +
      esc(labels[r.location]) +
      "</div></header><h3>Customer & Vehicle Details</h3><table>" +
      [
        ["Insurance Company", r.insurance_company, "Customer", d.customer],
        ["Contact", d.contact, "Registration", d.registration],
        ["Make / Model", [d.make, d.model].join(" "), "Model Year", d.year],
        [
          "VIN",
          d.vin,
          "Reading",
          [d.odometer, d.odometer ? d.odometer_unit : ""]
            .filter(Boolean)
            .join(" "),
        ],
        [
          "Claim / Gate Pass",
          d.claim,
          "Case Status",
          labels[r.outcome || r.approval_status],
        ],
      ]
        .map(
          ([a, b, c, e]) =>
            "<tr><td><small>" +
            a +
            "</small>" +
            esc(b || "Not recorded") +
            "</td><td><small>" +
            c +
            "</small>" +
            esc(e || "Not recorded") +
            "</td></tr>",
        )
        .join("") +
      '</table><section><h3>Damage Description</h3><div class="observation">' +
      esc(d.damage || "Not recorded") +
      '</div></section><section><h3>Tools & Accessories</h3><table class="tools">' +
      Array.from(
        { length: 3 },
        (_, i) =>
          "<tr>" +
          tools
            .slice(i * 3, i * 3 + 3)
            .map(
              ([k, l]) =>
                "<td>" +
                ((d.tools || []).includes(k) ? "☑" : "☐") +
                " " +
                l +
                "</td>",
            )
            .join("") +
          "</tr>",
      ).join("") +
      '</table><small>Unticked accessories are not recorded.</small><div class="observation">Other: ' +
      esc(d.other_accessories || "Not recorded") +
      '</div></section><section><h3>Fuel Level & Dashboard Warnings</h3><div class="observation">Fuel: ' +
      esc(d.fuel || "Not recorded") +
      "<br>Warnings: " +
      esc(d.warnings || "Not recorded") +
      '</div></section><section><h3>Other Remarks</h3><div class="observation">' +
      esc(d.remarks || "Not recorded") +
      '</div></section><div class="sign"><div>Customer Signature</div><div>Reception Staff Signature</div></div><footer>Signatures to be completed by hand after printing. · ' +
      esc(r.rc_no) +
      "</footer></body></html>"
    );
  }
  async function output(pdf) {
    const native = !!(
      (pdf && window.AndroidBridge?.shareHtmlAsPdf) ||
      window.AndroidBridge?.printHtmlNamed
    );
    const w = native ? null : window.open("", "_blank");
    if (!native && !w) throw Error("Allow popups to print this checklist.");
    const r = (await call({ operation: "GET", rc_no: current.record.rc_no }))
      .record;
    const html = documentHtml(r);
    if (pdf && window.AndroidBridge?.shareHtmlAsPdf) {
      window.AndroidBridge.shareHtmlAsPdf(html, r.rc_no + ".pdf");
      return;
    }
    if (window.AndroidBridge?.printHtmlNamed) {
      window.AndroidBridge.printHtmlNamed(html, r.rc_no);
      return;
    }
    w.document.write(html);
    w.document.close();
    if (pdf)
      alert(
        "Choose Save as PDF in the print dialog, then share the saved PDF.",
      );
    setTimeout(() => {
      if (!w.closed) {
        w.focus();
        w.print();
      }
    }, 350);
  }
  async function dispatch(e) {
    const b = e.target.closest("[data-rc-action]");
    if (!b) return;
    e.preventDefault();
    if (busy) return;
    try {
      switch (b.dataset.rcAction) {
        case "close":
          closeModal();
          break;
        case "home":
          await home();
          break;
        case "new":
          await editor();
          break;
        case "view":
          await view(b.dataset.rc);
          break;
        case "edit":
          await editor(current.record.rc_no);
          break;
        case "movement":
          movement();
          break;
        case "outcome":
          outcome();
          break;
        case "print":
          await output(false);
          break;
        case "pdf":
          await output(true);
          break;
        case "more":
          await loadList(true);
          break;
        case "staff":
          await staff();
          break;
        case "access":
          await mutate({
            operation: "ACCESS",
            user_id: b.dataset.user,
            active: b.dataset.active === "true",
          });
          await staff();
          break;
      }
    } catch (x) {
      error(x);
    }
  }
  function ensureCards() {
    const u = user();
    if (!u?.id) return;
    if (capUser !== u.id) {
      capUser = u.id;
      caps = { allowed: false, manager: false };
      if (!capBusy) {
        capBusy = true;
        call({ operation: "CAPABILITIES" })
          .then((r) => {
            if (user()?.id === u.id) caps = r;
            ensureCards();
          })
          .catch(() => {})
          .finally(() => (capBusy = false));
      }
      return;
    }
    if (!caps.allowed) return;
    for (const id of ["managerView", "supervisorView", "employeeView"]) {
      const root = document.getElementById(id);
      if (
        !root ||
        root.classList.contains("hidden") ||
        root.querySelector("[data-rc-menu]")
      )
        continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "card rc-menu";
      b.dataset.rcMenu = "1";
      b.innerHTML =
        "<b>Insurance Reception</b><br><small>Checklists · Vehicle movements · Print</small>";
      b.onclick = () => home().catch(error);
      const grid = root.querySelector(
        ".v67-control-grid,.v66-control-grid,.manager-actions",
      );
      (grid || root).appendChild(b);
    }
  }
  window.zukaitReception = { open: home, documentHtml, ensureCards, call };
  style();
  new MutationObserver(ensureCards).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  setTimeout(ensureCards, 0);
})();
