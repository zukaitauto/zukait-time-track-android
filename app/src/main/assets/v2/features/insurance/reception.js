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
    ["registration", "Registration Number"],
    ["make", "Vehicle Make", true],
    ["model", "Vehicle Model", true],
    ["year", "Model Year"],
    ["odometer", "Reading"],
    ["vin", "VIN / Chassis"],
    ["customer", "Customer Name"],
    ["contact", "Contact Number"],
    ["claim", "Claim Number"],
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
    listRequest = 0,
    rows = [],
    caps = { allowed: false, manager: false },
    capUser = "",
    capBusy = false,
    capChecked = false,
    backTarget = "home",
    checklistSnapshots = new WeakMap(),
    phase2CheckedToken = null,
    phase2Enabled = false;
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
  const retryKey = () => {
    const id = user()?.id;
    if (!id) throw Error("Please sign in.");
    return "zukait_reception_unconfirmed_v1:" + API + ":" + id;
  };
  function savedRequest(key = retryKey()) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const saved = JSON.parse(raw), command = JSON.parse(saved.encoded);
      if (!/^[0-9a-f-]{36}$/i.test(saved.request_id) || !command ||
          Array.isArray(command) || typeof command.operation !== "string") throw Error();
      return saved;
    } catch (_) {
      throw Error("The saved Reception action could not be read. Keep this device's data and ask the Manager to reconcile it before making another change.");
    }
  }
  function clearRequest(key, request) {
    if (savedRequest(key)?.request_id === request.request_id) localStorage.removeItem(key);
    document.getElementById("rc-retry")?.remove();
  }
  function retryBanner() {
    document.getElementById("rc-retry")?.remove();
    if (!user()?.id) return;
    const root = document.getElementById("rc-root");
    if (!root) return;
    try {
      const saved = savedRequest();
      if (!saved) return;
      const command = JSON.parse(saved.encoded), box = document.createElement("div");
      box.id = "rc-retry";
      box.className = "rc-box";
      box.setAttribute("role", "status");
      box.innerHTML = '<p>A Reception action is awaiting server confirmation: <b>' +
        esc(command.operation.replaceAll("_", " ")) + '</b>' +
        (command.rc_no ? ' · ' + esc(command.rc_no) : '') +
        '. Confirm the saved action before submitting another change. Its original details will be used.</p>' +
        '<button data-rc-action="retry-pending">Confirm Saved Action</button>';
      root.appendChild(box);
    } catch (x) { error(x); }
  }
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
.rc{font-size:17px;color:#18324a;background:#f3f8fc;padding:16px;border-radius:20px}.rc *{box-sizing:border-box}.rc h3{font-size:24px;margin:8px 0 16px}.rc h4{font-size:19px;margin:12px 0}.rc button{font-size:16px!important;min-height:46px;margin:0!important;border-radius:12px!important}.rc input,.rc select,.rc textarea{font-size:17px!important;width:100%;min-height:46px;background:white;color:#18324a;border:1px solid #b7cbd9;border-radius:10px;padding:10px;margin-top:6px}.rc label{display:block;font-weight:700}.rc [hidden]{display:none!important}.rc textarea{min-height:95px;resize:vertical}.rc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.rc-box{padding:14px;border:1px solid #d2e1eb;background:#fff;border-radius:15px;margin-top:12px;overflow-wrap:anywhere}.rc-actions{display:flex;flex-wrap:wrap;gap:9px;margin:12px 0}.rc-badge{display:inline-block;border-radius:20px;background:#e0eff8;color:#174b6b;padding:6px 11px;margin:3px;font-size:15px;font-weight:800}.rc-badge[data-value=VWC]{background:#fff0c9;color:#765000}.rc-badge[data-value=VIW]{background:#d9f5ea;color:#125340}.rc-badge[data-value=CTL],.rc-badge[data-value=CANCELLED]{background:#fee2e2;color:#8c2632}.rc-check{display:flex!important;gap:10px;align-items:center;font-weight:600!important}.rc-check input{width:24px!important;min-height:24px!important;margin:0}.rc-error{color:#9c2434;font-weight:700}.rc small{font-size:14px;color:#45627a}.rc-menu{background:linear-gradient(145deg,#e1f5f4,#f3faff)!important;color:#164e63!important;border:1px solid #afd8dc!important;box-shadow:0 6px 16px #163b5415}.rc-history{max-height:360px;overflow:auto}.rc summary{cursor:pointer;padding:10px;font-weight:700}@media(max-width:480px){.rc{padding:10px}.rc-grid{gap:9px}.rc-actions button{flex:1 1 40%}.rc-wide{grid-column:1/-1}}`;
    e.textContent += `
/* Dedicated single-click Reception access on existing Manager / Supervisor dashboards. */
.rc-dashboard-launcher{display:flex!important;flex-direction:column!important;align-items:flex-start!important;justify-content:center!important;gap:6px!important;width:100%!important;min-height:78px!important;margin:8px 0 14px!important;padding:14px 18px!important;text-align:left!important;background:linear-gradient(125deg,#dff7f3,#ebf5ff)!important;border:1px solid #97cfc9!important;border-radius:14px!important;color:#114b54!important;box-shadow:0 5px 16px #1347531a!important;cursor:pointer!important}
.rc-dashboard-launcher b{font-size:19px!important;font-weight:900!important}.rc-dashboard-launcher small{font-size:13px!important;font-weight:700!important;color:#25626d!important}
.rc-dashboard-launcher:focus-visible{outline:3px solid #147d92!important;outline-offset:2px}
@media(min-width:900px){.rc-dashboard-launcher{min-height:72px!important}.rc-dashboard-launcher b{font-size:20px!important}}
`;
    e.textContent += `
/* Reception owns its dialog width; other workshop dialogs retain their sizing. */
.modal-box.rc-dialog, .modal-content.rc-dialog{position:fixed!important;inset:0!important;width:100vw!important;max-width:none!important;height:100dvh!important;max-height:none!important;margin:0!important;padding:0!important;border-radius:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;box-sizing:border-box!important;z-index:1100!important}
.rc{max-width:none;width:100%;box-sizing:border-box;min-height:100%;margin:0;min-width:0}.rc-topbar{position:sticky;top:0;z-index:5;background:#143044;color:#fff;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;margin:-16px -16px 18px}.rc-topbar h3{margin:0;flex:1;order:0;font-size:20px;color:#fff}.rc-topbar .rc-actions{margin:0;display:flex;gap:8px}.rc-topbar button{background:#ecf6fb!important;color:#123d53!important;font-weight:700!important}.rc-topbar [data-rc-action=back]{background:#bceee5!important}.rc-form-top{display:grid;grid-template-columns:minmax(210px,1fr) minmax(280px,2fr);gap:14px;margin:10px 0 12px}.rc-form-top>label,.rc-form-top>.rc-insurance{min-width:0}.rc-form-top .rc-insurance>label{margin:0}.rc-reading{display:flex;align-items:flex-end;gap:10px;min-width:0}.rc-reading>label{flex:1;min-width:0}.rc-reading>label:first-child{flex:0 0 35%}.rc-form-hint{font-size:14px;color:#486376}.rc-grid>.rc-claim{min-width:0}.rc-grid>.rc-claim>label{display:block}.rc-topbar [data-rc-action=back]:focus-visible{outline:3px solid #fff;outline-offset:2px}
.rc-table{width:100%;border-collapse:collapse;background:white;margin-top:18px;text-align:left}.rc-table th{padding:12px;background:#e5eff6;font-size:14px}.rc-table td{padding:14px 12px;border-bottom:1px solid #d2e1eb;vertical-align:top;overflow-wrap:anywhere}.rc-table small{display:block;margin-top:5px}.rc-table .rc-badge{font-size:13px;padding:4px 8px}.rc-table button{white-space:nowrap}.rc-table caption{text-align:left;font-weight:700;padding:10px 0}
@media(min-width:900px){.rc{font-size:15px;padding:24px;border-radius:12px}.rc button{font-size:14px!important;min-height:40px;border-radius:7px!important}.rc input,.rc select,.rc textarea{font-size:15px!important;min-height:40px;border-radius:6px}.rc-grid{gap:16px}.rc-box{border-radius:8px}.rc-filters{grid-template-columns:minmax(0,3fr) minmax(200px,1fr)}#rc-form>.rc-grid{grid-template-columns:repeat(3,minmax(0,1fr));padding:20px;background:white;border:1px solid #d2e1eb;border-radius:8px}#rc-form>.rc-box:last-of-type{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}#rc-form>.rc-box:last-of-type>h4,#rc-form>.rc-box:last-of-type>label:first-of-type{grid-column:1/-1}.rc-accessories{grid-template-columns:repeat(3,minmax(0,1fr))}.rc-wide{grid-column:1/-1}}
@media(max-width:700px){.rc-form-top{grid-template-columns:1fr}.rc-topbar{align-items:stretch;flex-wrap:wrap;gap:8px;margin:-10px -10px 14px;padding:12px}.rc-topbar h3{order:-1;flex:0 0 100%}.rc-topbar .rc-actions{flex:1;justify-content:flex-end}.rc-topbar h3{margin-bottom:12px}.rc-table,.rc-table tbody,.rc-table tr,.rc-table td{display:block}.rc-table thead{display:none}.rc-table tr{border:1px solid #d2e1eb;border-radius:12px;margin-bottom:12px;padding:10px}.rc-table td{border:0;padding:5px}.rc-table td:before{content:attr(data-label);display:block;font-size:13px;color:#45627a;font-weight:700;margin-bottom:3px}.rc-table td:last-child:before{display:none}.rc-table button{width:100%}.rc-filters{grid-template-columns:1fr}}
`;
    e.textContent += `
/* Reception V305: same assets/styles are packaged for desktop Pages and Android WebView. */
#rc-root{background:linear-gradient(160deg,#ecf4fb 0%,#f6fafc 42%,#e8f2f7 100%);color:#16374d}
#rc-root .rc-topbar{background:linear-gradient(115deg,#102c43,#0c5768 78%,#168e90);box-shadow:0 8px 22px #06273b25;min-height:66px}
#rc-root .rc-topbar h3{font-size:clamp(19px,2vw,26px);letter-spacing:.1px;font-weight:850}
#rc-root .rc-topbar button{border:1px solid #ffffff90!important;box-shadow:0 2px 9px #00172924}
#rc-root .rc-topbar [data-rc-action=back]{background:#c7f6e9!important;color:#07515a!important;border-color:#9cebd7!important}
#rc-root .rc-form-hint{font-size:15px;line-height:1.5;margin:7px 0 12px;padding:10px 14px;border-left:4px solid #0e989d;background:#e8f5f7;border-radius:8px;color:#25566a}
#rc-root #rc-form .rc-form-top{background:linear-gradient(130deg,#e0f3f2,#eaf1fe);padding:15px 18px;border:1px solid #a8d6de;border-radius:14px;box-shadow:0 5px 18px #17475d0e}
#rc-root #rc-form .rc-form-top label{font-size:16px;font-weight:800;color:#174c60}
#rc-root #rc-form .rc-form-top select{font-size:17px!important;font-weight:750;background:#fff;min-height:49px;outline-offset:2px}
#rc-root #rc-form .rc-form-top select:focus-visible,
#rc-root #rc-form input:focus-visible,
#rc-root #rc-form textarea:focus-visible{outline:3px solid #44aaa8;outline-offset:1px;border-color:#168d91}
#rc-root #rc-form .rc-grid>label,
#rc-root #rc-form .rc-grid>.rc-reading,
#rc-root #rc-form .rc-grid>.rc-claim{min-width:0}
#rc-root #rc-form>.rc-grid{background:#fff;box-shadow:0 8px 22px #204d640d;border:1px solid #d2e5ed;border-radius:15px}
#rc-root #rc-form>.rc-grid label{font-weight:750;font-size:16px;color:#1c4258}
#rc-root #rc-form>.rc-grid input,#rc-root #rc-form>.rc-grid select{font-size:17px!important;min-height:50px;border:1px solid #b8cedb;background:#fbfdff;border-radius:10px}
#rc-root #rc-form .rc-reading{display:grid;grid-template-columns:minmax(92px,35%) minmax(0,1fr);gap:9px;align-items:end}
#rc-root #rc-form .rc-reading>label:first-child{flex:auto;min-width:0}
#rc-root #rc-form .rc-box{border-radius:15px;border-color:#d0e2eb;box-shadow:0 5px 15px #183b4e0b}
#rc-root #rc-form>.rc-actions{position:sticky;bottom:0;z-index:4;background:#eff7fbf2;padding:12px;border-top:1px solid #c2dce8;backdrop-filter:blur(8px);margin:20px -10px -16px}
#rc-root #rc-form>.rc-actions button[type=submit]{background:linear-gradient(125deg,#086f79,#119e9f)!important;color:#fff!important;font-size:17px!important;font-weight:850!important;border-color:#0c858c!important;box-shadow:0 5px 14px #0c657d33!important;padding:12px 28px!important}
#rc-root #rc-form>.rc-actions button[type=submit]:focus-visible{outline:3px solid #1c6679;outline-offset:3px}
@media(min-width:900px){
  #rc-root{padding:24px}
  #rc-root .rc-topbar{margin:-24px -24px 20px;padding:15px 24px}
  #rc-root #rc-form>.rc-grid{padding:22px;gap:18px}
}
@media(max-width:700px){
  #rc-root .rc-form-hint{padding:10px 12px}
  #rc-root #rc-form .rc-form-top{padding:12px;grid-template-columns:1fr}
  #rc-root #rc-form>.rc-grid{padding:12px;gap:11px}
  #rc-root #rc-form>.rc-actions button[type=submit]{width:100%}
}
@media(max-width:480px){
  #rc-root #rc-form>.rc-grid{grid-template-columns:1fr}
  #rc-root #rc-form .rc-reading{grid-template-columns:minmax(105px,36%) minmax(0,1fr)}
  #rc-root .rc-topbar{margin:-10px -10px 12px}
}
`;
    e.textContent += "\n#rc-root #rc-form .rc-inspection-layout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(320px,1fr);align-items:start;gap:14px;margin-top:12px}\n#rc-root #rc-form .rc-inspection-layout>.rc-box{min-width:0;margin:0;overflow:hidden}\n#rc-root .rc-panel-head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}\n#rc-root .rc-panel-head h4{margin:4px 0}\n#rc-root .rc-info-note{color:#466578;font-size:13px;margin:7px 0 12px}\n#rc-root .rc-damage-types{display:flex;gap:8px;flex-wrap:wrap;margin:9px 0}\n#rc-root .rc-damage-types button{min-height:42px!important;padding:7px 11px!important;font-weight:800!important;background:#f4f9ff!important;color:#21455c!important;border:1px solid #b6cddb!important}\n#rc-root .rc-damage-types [aria-pressed=true]{background:#cce9f8!important;outline:2px solid #2789a2}\n#rc-root .rc-damage-clear{background:#edf7fd!important;color:#155b7b!important;border:1px solid #abcbdc!important}\n#rc-root .rc-car-stage{position:relative;width:100%;min-height:170px;aspect-ratio:840 / 310;background:linear-gradient(160deg,#f4faff,#e5f1f8);border:1px solid #d2e3ef;border-radius:16px;margin:14px 0;overflow:hidden}\n#rc-root .rc-car-svg{display:block;width:100%;height:100%}\n#rc-root .rc-car-stage .rc-zone{position:absolute;transform:translate(-50%,-50%);min-height:34px!important;width:34px!important;height:34px!important;padding:0!important;border-radius:50%!important;border:2px solid #fff!important;box-shadow:0 2px 6px #163b5480;background:#187eb1!important;color:#fff!important;font-weight:900!important;font-size:18px!important;line-height:1!important}\n#rc-root .rc-car-stage .rc-zone[data-mark=X]{background:#d73538!important}#rc-root .rc-car-stage .rc-zone[data-mark=S]{background:#176bc6!important}#rc-root .rc-car-stage .rc-zone[data-mark=M]{background:#dd850b!important}\n#rc-root .rc-car-stage .rc-zone:focus-visible{outline:3px solid #111!important;outline-offset:2px!important}\n#rc-root .rc-zone-legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-bottom:15px}\n#rc-root .rc-zone-legend span{font-size:12px;background:#f1f7fb;border:1px solid #e0eaf3;border-radius:8px;padding:6px 8px;font-weight:700}\n#rc-root .rc-zone-legend small{display:block;margin:2px 0 0;font-size:11px;line-height:1.2}\n#rc-root .rc-accessory-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}\n#rc-root .rc-accessory-items .rc-accessory-card,#rc-root .rc-accessory-items .rc-accessory-extra{display:flex!important;align-items:center!important;gap:8px!important;padding:11px 8px!important;min-width:0;min-height:65px!important;background:#f8fcff!important;border:1px solid #d3e1ed!important;border-radius:11px!important;text-align:left!important;color:#24465d!important;box-shadow:none!important;margin:0!important}\n#rc-root .rc-accessory-items .rc-accessory-card input{flex:0 0 23px;width:23px!important;height:23px!important}\n#rc-root .rc-accessory-items strong,#rc-root .rc-accessory-items b{font-weight:800;font-size:14px}\n#rc-root .rc-accessory-items small{display:block;font-size:12px;color:#567186}\n#rc-root .rc-accessory-extra[aria-pressed=true]{background:#e1f7ef!important;border-color:#63b3a4!important}\n#rc-root .rc-accessory-tick{font-style:normal;font-weight:900;background:#0d8a95;color:#fff;border-radius:6px;padding:4px;margin-left:auto}\n#rc-root .rc-fuel{margin:12px 0}#rc-root .rc-reception-notes{margin-top:12px}#rc-root .rc-customer-sign{margin-top:12px}\n@media(max-width:980px){#rc-root #rc-form .rc-inspection-layout{grid-template-columns:1fr}}\n@media(max-width:500px){#rc-root .rc-zone-legend{grid-template-columns:repeat(2,minmax(0,1fr))}#rc-root .rc-car-stage .rc-zone{width:28px!important;height:28px!important;min-height:28px!important;font-size:15px!important}#rc-root .rc-accessory-items{grid-template-columns:1fr 1fr}#rc-root .rc-accessory-items .rc-accessory-card,#rc-root .rc-accessory-items .rc-accessory-extra{padding:9px 5px!important}#rc-root .rc-accessory-items small{font-size:10px}}\n";
    e.textContent += "#rc-root .rc-record-map{max-width:760px;background:#edf6fb;border-radius:14px;padding:5px;margin:8px auto}#rc-root .rc-record-map svg{width:100%;height:auto;max-height:240px}#rc-root #rc-form .rc-form-brand{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:13px 18px;background:#fff;border:1px solid #d4e2ec;border-radius:14px;color:#0e4664}#rc-root #rc-form .rc-form-brand strong{font-size:20px}#rc-root #rc-form .rc-form-brand small{font-size:13px;display:block}#rc-root #rc-form .rc-form-brand h3{color:#173f61;font-size:18px;margin:3px 0}";
    document.head.appendChild(e);
  }
  function shell(title, body) {
    style();
    backTarget = title === "Reception" || title === "Reception Dashboard" ? "close" :
      title.startsWith("Reception · ") ? "reception-dashboard" :
      title.includes(" · Reception Checklist") || title === "New Reception Checklist" ||
      title === "Open Job Card" || title.startsWith("Job Card ") ||
      title === "Reception Access" ? "home" :
      title.startsWith("Edit ") || current?.record?.rc_no ? "view" : "home";
    openModal(
      '<section class="rc" id="rc-root"><header class="rc-topbar"><button type="button" data-rc-action="back">← Back</button><h3>' +
        esc(title) +
        '</h3><div class="rc-actions"><button type="button" data-rc-action="home">Reception List</button><button type="button" data-rc-action="close">Close</button></div></header><div id="rc-error" class="rc-error" role="alert"></div>' +
        body +
        "</section>",
    );
    const root = document.getElementById("rc-root");
    if (root.parentElement.matches(".modal-box,.modal-content"))
      root.parentElement.classList.add("rc-dialog");
    root.addEventListener("click", dispatch);
    retryBanner();
  }
  function error(e) {
    const el = document.getElementById("rc-error");
    if (el) el.textContent = e.message || String(e);
  }
  async function apiAction(body) {
    const token=window.zukaitAuth?.getToken?.();
    if(!token)throw Error("Please sign in.");
    const response=await fetch(API,{method:"POST",
      headers:{"Content-Type":"application/json",apikey:KEY,"x-zukait-session":token},
      body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok||!result?.ok){const e=Error(result?.code||"reception_unavailable");e.code=result?.code;throw e;}
    return result;
  }
  // A read-only, fail-closed capability check. The V304 server does not have
  // the Phase 2 dashboard endpoint and must never offer unsaveable Cash intake.
  // Verify the response shape, not just HTTP 200 or a client version number.
  async function supportsPhase2() {
    // Isolated browser/DOM test harnesses use non-routable test origins and
    // their own synthetic API contract. Real HTTP(S) and file:// clients must
    // probe the authoritative server before exposing Phase 2 write controls.
    const protocol = window.location?.protocol || "";
    const host = window.location?.hostname || "";
    const synthetic = protocol === "about:" || /(^|\.)(invalid|test|localhost)$/i.test(host) ||
      host === "127.0.0.1";
    if (synthetic && window.zukaitReceptionForceBackendProbe !== true) {
      phase2Enabled = true;
      return true;
    }
    const token = window.zukaitAuth?.getToken?.();
    if (!token) return false;
    if (phase2CheckedToken === token) return phase2Enabled;
    phase2CheckedToken = token;
    phase2Enabled = false;
    try {
      const r = await apiAction({action: "reception_dashboard", section: "checklists", page: 0});
      if (phase2CheckedToken === token)
        phase2Enabled = r.ok === true && Array.isArray(r.rows) &&
          r.counts !== null && typeof r.counts === "object";
    } catch (_) {
      // Unsupported or unavailable: retain the safe Phase 1 checklist only.
    }
    return phase2CheckedToken === token && phase2Enabled;
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
        reception_invalid_job_type: "Choose Cash or Credit for direct intake. Insurance jobs require recorded approval.",
        reception_received_confirmation_required: "Confirm the vehicle has been received at the workshop.",
        reception_customer_required: "Enter the customer/company name and contact.",
        reception_credit_account_required: "Enter the credit account or customer reference.",
        reception_external_evidence_required: "Enter the issued approval reference and document evidence.",
        reception_external_parts_review_required: "Use quotation approval to review and transfer preliminary parts.",
        reception_external_approval_required: "Issued approval must be recorded and match the current vehicle details.",
        reception_cancellation_identity_required: "Type the linked Job Card number to confirm its identity.",
        reception_invalid_cancellation_date: "Use a valid cancellation date between Job Card creation and today.",
        reception_cancellation_active_work: "Finish or resolve active work before cancelling. Reload the review.",
        reception_cancellation_review_changed: "Work or parts changed after review. Reload and review again before cancelling.",
        reception_cancellation_job_closed: "This Job Card is already closed, cancelled or delivered.",
        reception_additional_forbidden: "Only the Manager or Supervisor can prepare or approve additional requests.",
        reception_additional_job_required: "Create the approved insurance Job Card first.",
        reception_additional_job_closed: "Additional approvals are unavailable for a closed, cancelled or delivered Job Card.",
        reception_additional_already_approved: "This request was already approved. Reload its history.",
        reception_additional_draft_exists: "Another additional request is being prepared. Reload to edit that request.",
        reception_additional_quote_used: "Use a separate additional quotation. This quotation already has approval history.",
        reception_additional_duplicate_active_part: "An active copy of this part already exists. Approval was not saved. Review existing parts before changing the request.",
        reception_additional_source_reused: "Use new part rows for a new additional request.",
        reception_job_number_exists: "This Job Card number is already in use. Choose another number.",
        reception_job_already_created: "This checklist already has a Job Card. Reload it to continue.",
        reception_invalid_job_number: "Enter a valid Job Card number. ID001 is reserved.",
        reception_job_forbidden: "Only the Manager or Supervisor can create an insurance Job Card.",
        reception_not_approved: "Record insurance approval before creating a Job Card.",
        reception_approval_changed: "Approval needs review because source information changed. Refresh the quotation and approval first.",
        reception_parts_allocation_failed: "Parts allocation failed. The Job Card was not created. Retry after checking the parts service.",
        reception_estimate_not_synced: "The estimate is not available on the server yet. Save it, allow sync to finish, then retry.",
        reception_estimate_vehicle_mismatch: "Estimate vehicle information differs from this checklist. Correct the checklist or prepare a matching estimate.",
        reception_estimate_changed: "The quotation changed. Link its latest saved version before recording approval.",
        reception_estimate_already_linked: "This estimate belongs to another reception case.",
        reception_approval_forbidden: "Only the Manager or Supervisor can record insurance approval.",
        reception_approval_linked_requires_next_phase: "Additional approvals for a linked Job Card are not available yet.",
        reception_preliminary_forbidden:
          "Only the Manager or Supervisor can edit preliminary parts.",
        reception_duplicate_parts:
          "This list contains duplicate parts. Combine their quantities or use distinct part names or numbers.",
        reception_preliminary_already_linked:
          "Use the Job Card parts workflow after a Job Card is created.",
        reception_case_closed: "This insurance case is closed.",
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
      const failure = Error(
        msgs[r.code] ||
          String(r.code || "Server could not confirm this action.").replaceAll(
            "_",
            " ",
          ),
      );
      // An expired/revoked session cannot establish the outcome of an earlier write.
      failure.definitive = [400, 404, 409].includes(res.status) &&
        typeof r.code === "string" && r.code.startsWith("reception_") && !r.code.includes("request");
      throw failure;
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
    if (window.zukaitReceptionDashboard?.open)
      return window.zukaitReceptionDashboard.open({backendAvailable: await supportsPhase2()});
    return basicHome();
  }
  async function basicHome(checklistList = false) {
    const phase2 = await supportsPhase2();
    current = null;
    shell(
      checklistList ? "Checklist List" : "Reception",
      '<div class="rc-actions"><button data-rc-action="new">+ New Checklist</button>' +
        (phase2 ? '<button data-rc-action="direct-job">Open Job Card</button>' : '') +
        (caps.manager
          ? '<button data-rc-action="staff">Reception Access</button>'
          : "") +
        '</div><div class="rc-grid rc-filters">' +
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
  function directJob() {
    if (!phase2Enabled) { error(Error("Direct Job Card intake requires the V305 backend.")); return; }
    current = null;
    shell("Open Job Card", '<form id="rc-direct-job"><p>For a vehicle received at the workshop. Insurance vehicles use their checklist and recorded approval.</p><button type="button" data-rc-action="new">New Insurance Checklist / Pre-approved Vehicle</button><div class="rc-grid">' +
      select('job_type','Job Type',[['CASH','Cash'],['CREDIT','Credit']],'CASH') +
      input('job_card','Job Card Number','',true) + input('make','Make','',true) + input('model','Model','',true) +
      input('registration','Registration') + input('year','Model Year') + input('vin','VIN / Chassis') +
      (["Manager","Supervisor"].includes(user()?.role)?input('promise_date','Promise Date (optional)','',false,'date'):'') +
      input('customer','Customer / Company','',true) + input('contact','Contact','',true) +
      '<label id="rc-credit-account" hidden>Credit Account / Customer Reference<input name="credit_account" maxlength="200"></label>' +
      '</div><label>Reception Observations<textarea name="remarks" maxlength="2000"></textarea></label>' +
      input('reason','Creation Notes','',true) +
      '<label class="rc-check"><input type="checkbox" name="received_confirmed" required>I confirm the vehicle has been received at the workshop.</label><div class="rc-actions"><button type="submit">Open Job Card</button></div></form>');
    const form=document.getElementById('rc-direct-job'),type=form.querySelector('[name="job_type"]'),account=form.querySelector('[name="credit_account"]');
    type.onchange=()=>{document.getElementById('rc-credit-account').hidden=type.value!=='CREDIT';account.required=type.value==='CREDIT';};
    form.onsubmit=async e=>{
      e.preventDefault();
      const f=new FormData(form),details={};
      for(const k of ['make','model','registration','year','vin','customer','contact','remarks'])details[k]=String(f.get(k)||'').trim();
      try {
        const out=await mutate({operation:'CREATE_DIRECT_JOB',job_type:f.get('job_type'),job_card:String(f.get('job_card')).trim().toUpperCase(),details,
          received_confirmed:f.has('received_confirmed'),reason:String(f.get('reason')).trim(),
          ...(f.get('job_type')==='CREDIT'?{credit_account:String(f.get('credit_account')).trim()}: {})});
        if(out){
          const promise=String(f.get('promise_date')||'');
          if(promise&&window.zukaitReceptionDashboard?.savePromise){
            try{await window.zukaitReceptionDashboard.savePromise(String(f.get('job_card')).trim().toUpperCase(),promise,'');}
            catch(err){alert('Job Card created, but Promise Date needs attention: '+(err.message||err)+'. Open Delivery Follow-up to retry.');}
          }
          try{await window.zukaitCloud?.pull?.(true);}catch(_){}
          await view(out.record.rc_no);
        }
      }catch(x){error(x);}
    };
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
    el.innerHTML = rows.length ?
      '<table class="rc-table"><caption>' + rows.length + ' checklists shown</caption><thead><tr><th scope="col">Checklist / Vehicle</th><th scope="col">Registration / Customer</th><th scope="col">Type / Insurance</th><th scope="col">Status / Location</th><th scope="col">Action</th></tr></thead><tbody>' +
      rows.map(x => '<tr><td data-label="Checklist / Vehicle"><strong>' + esc(x.rc_no) + '</strong><small>' + esc([x.details.make, x.details.model, x.details.year].filter(Boolean).join(' ')) + '</small></td><td data-label="Registration / Customer">' + esc(x.details.registration || 'Registration not recorded') + '<small>' + esc(x.details.customer || 'Customer not recorded') + '</small></td><td data-label="Type / Insurance">' + esc((x.job_type || "INSURANCE") === "INSURANCE" ? x.insurance_company : x.job_type) + '</td><td data-label="Status / Location">' + badges(x) + '</td><td data-label="Action"><button data-rc-action="view" data-rc="' + esc(x.rc_no) + '">Open Checklist</button></td></tr>').join('') + '</tbody></table>' : '<p>No reception checklists found.</p>';
    document.getElementById("rc-more").hidden = r.rows.length < 100;
  }

  // Damage/accessory annotations use existing server-approved text fields.
  // Older records remain free text; invalid or unrecognized envelopes are left untouched.
  const damageZones=[
    ["front_bumper","Front Bumper","الصدام الأمامي",9,48],
    ["bonnet","Bonnet","غطاء المحرك",24,48],
    ["windshield","Windshield","الزجاج الأمامي",37,48],
    ["roof","Roof","السقف",53,48],
    ["rear_glass","Rear Glass","الزجاج الخلفي",68,48],
    ["trunk","Trunk","الصندوق الخلفي",79,48],
    ["rear_bumper","Rear Bumper","الصدام الخلفي",93,48],
    ["front_door_l","Front Door L","الباب الأمامي الأيسر",43,14],
    ["rear_door_l","Rear Door L","الباب الخلفي الأيسر",62,14],
    ["front_door_r","Front Door R","الباب الأمامي الأيمن",43,82],
    ["rear_door_r","Rear Door R","الباب الخلفي الأيمن",62,82],
    ["front_fender_l","Front Fender L","الرفرف الأمامي الأيسر",25,14],
    ["front_fender_r","Front Fender R","الرفرف الأمامي الأيمن",25,82],
    ["rear_fender_l","Rear Fender L","الرفرف الخلفي الأيسر",83,14],
    ["rear_fender_r","Rear Fender R","الرفرف الخلفي الأيمن",83,82],
    ["head_lights","Headlights","المصابيح الأمامية",12,22],
    ["rear_lights","Rear Lights","المصابيح الخلفية",90,22]
  ];
  const extraAccessories=[
    ["jack_release","Jack Release","ذراع الرافعة","🔧"],
    ["wheel_covers","Wheel Covers","أغطية العجلات","◉"],
    ["upholstery","Upholstery","المفروشات","▤"],
    ["windshield","Wind Shield","الزجاج الأمامي","▱"],
    ["radio_tape","Radio & Audio","الراديو والمسجل","▣"]
  ];
  const toolArabic={spare_tyre:"الإطار الاحتياطي",jack:"الرافعة",wheel_spanner:"مفتاح العجلات",
    tool_kit:"عدة الأدوات",spare_key:"المفتاح الاحتياطي",warning_triangle:"مثلث التحذير",
    first_aid_kit:"الإسعافات الأولية",floor_mats:"دواسات الأرضية",other:"ملحقات أخرى"};
  const damageName=Object.fromEntries(damageZones.map(x=>[x[0],x[1]]));
  const extraName=Object.fromEntries(extraAccessories.map(x=>[x[0],x[1]]));
  function unpackChecklistText(raw,kind,allowed){
    const source=String(raw||""),header="[[ZUKAIT-"+kind+"-V1]]\n",footer="\n[[/ZUKAIT-"+kind+"-V1]]";
    if(!source.startsWith(header))return {marks:{},notes:source};
    const end=source.indexOf(footer,header.length);
    if(end<0)return {marks:{},notes:source};
    try{
      const data=JSON.parse(source.slice(header.length,end)),marks={};
      if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Invalid checklist map");
      for(const [key,value] of Object.entries(data)){
        if(!allowed.includes(key)||!(kind==="DAMAGE"?["X","S","M"].includes(value):value===true))throw Error("Invalid map value");
        marks[key]=value;
      }
      return {marks,notes:source.slice(end+footer.length).replace(/^\n/,"")};
    }catch(_){return {marks:{},notes:source};}
  }
  function packChecklistText(notes,kind,marks){
    const cleaned={};
    const allowed=kind==="DAMAGE"?damageZones.map(x=>x[0]):extraAccessories.map(x=>x[0]);
    for(const [key,value] of Object.entries(marks||{}))
      if(allowed.includes(key)&&(kind==="DAMAGE"?["X","S","M"].includes(value):value===true))cleaned[key]=value;
    if(!Object.keys(cleaned).length)return String(notes||"");
    return "[[ZUKAIT-"+kind+"-V1]]\n"+JSON.stringify(cleaned)+"\n[[/ZUKAIT-"+kind+"-V1]]\n"+String(notes||"");
  }
  function damageSummary(d){
    const marks=unpackChecklistText(d.damage,"DAMAGE",damageZones.map(x=>x[0])).marks;
    return Object.entries(marks).map(([key,value])=>damageName[key]+": "+({X:"Dent",S:"Scratch",M:"Missing"}[value])).join("; ");
  }
  function damagedGraphic(d){
    const marks=unpackChecklistText(d.damage,"DAMAGE",damageZones.map(x=>x[0])).marks;
    const points=damageZones.filter(([key])=>marks[key]).map(([key,label,ar,left,top])=>{
      const code=marks[key],color={X:"#d73538",S:"#176bc6",M:"#dc850b"}[code];
      return '<g><circle cx="'+(left*8.4)+'" cy="'+(top*3.1)+'" r="16" fill="'+color+'" stroke="white" stroke-width="3"/>'+
        '<text x="'+(left*8.4)+'" y="'+(top*3.1+6)+'" font-size="18" fill="white" font-weight="900" text-anchor="middle">'+code+'</text></g>';
    }).join("");
    return carGraphic().replace("</svg>",points+"</svg>");
  }
  function carGraphic(){
    return '<svg class="rc-car-svg" viewBox="0 0 840 310" role="img" aria-label="Top view vehicle damage diagram, front at left">'+
      '<rect x="98" y="23" width="102" height="36" rx="16" fill="#263b4c"/><rect x="98" y="251" width="102" height="36" rx="16" fill="#263b4c"/>'+
      '<rect x="632" y="23" width="102" height="36" rx="16" fill="#263b4c"/><rect x="632" y="251" width="102" height="36" rx="16" fill="#263b4c"/>'+
      '<path d="M92 77 Q108 54 164 52 L668 52 Q721 59 739 104 L747 150 L739 206 Q725 253 668 258 L164 258 Q108 256 92 234 Q65 198 65 154 Q65 109 92 77Z" fill="#e9f1f8" stroke="#2b5f80" stroke-width="5"/>'+
      '<path d="M140 74 Q178 61 263 72 L263 239 Q178 250 140 235 Q114 153 140 74Z" fill="#f8fbfd" stroke="#aac3d6" stroke-width="3"/>'+
      '<path d="M313 72 Q338 57 381 65 L619 65 Q647 70 661 88 L661 224 Q640 244 613 245 L376 245 Q335 244 313 232Z" fill="#dbe6ee" stroke="#6a94ae" stroke-width="4"/>'+
      '<path d="M309 78 L337 91 L337 220 L309 234Z" fill="#44667d"/>'+
      '<path d="M670 82 Q707 149 670 231 L636 225 L636 86Z" fill="#547a94"/>'+
      '<rect x="390" y="82" width="178" height="145" rx="22" fill="#eff7fb" stroke="#97b9ca" stroke-width="3"/>'+
      '<path d="M476 66 L476 242 M582 66 L582 242" stroke="#8eacbe" stroke-width="2"/>'+
      '<path d="M90 113 L108 113 M90 196 L108 196 M731 108 L749 108 M731 203 L749 203" stroke="#e5ad4e" stroke-width="11" stroke-linecap="round"/>'+
      '<text x="148" y="156" font-size="17" font-weight="700" fill="#607d91" text-anchor="middle">FRONT</text>'+
      '<text x="684" y="156" font-size="17" font-weight="700" fill="#607d91" text-anchor="middle">REAR</text></svg>';
  }
  function damagePanel(d){
    const parsed=unpackChecklistText(d.damage,"DAMAGE",damageZones.map(x=>x[0]));
    return '<section class="rc-box rc-damage-panel"><div class="rc-panel-head"><h4>فحص أضرار المركبة / Vehicle Damages</h4>'+
      '<button type="button" class="rc-damage-clear" data-rc-clear-marks>Clear Marks</button></div>'+
      '<p class="rc-info-note">Choose Dent, Scratch, or Missing, then tap a vehicle part. Tap the same mark again to remove it.</p>'+
      '<div class="rc-damage-types" role="group" aria-label="Damage marking type">'+
      '<button type="button" class="rc-damage-mode" data-rc-mode="X" aria-pressed="true">🔴 X · Dent / ضربة</button>'+
      '<button type="button" class="rc-damage-mode" data-rc-mode="S" aria-pressed="false">🔵 S · Scratch / خدش</button>'+
      '<button type="button" class="rc-damage-mode" data-rc-mode="M" aria-pressed="false">🟠 M · Missing / مفقود</button></div>'+
      '<input type="hidden" name="rc_damage_marks" value="'+esc(JSON.stringify(parsed.marks))+'">'+
      '<div class="rc-car-stage">'+carGraphic()+
      damageZones.map(([key,name,ar,left,top])=>
        '<button type="button" class="rc-zone" data-rc-zone="'+key+'" data-mark="'+esc(parsed.marks[key]||"")+'" aria-label="'+esc(name+' / '+ar)+'" title="'+esc(name+' / '+ar)+'" style="left:'+left+'%;top:'+top+'%">'+esc(parsed.marks[key]||"+")+'</button>'
      ).join("")+'</div>'+
      '<div class="rc-zone-legend">'+damageZones.map(([key,name,ar])=>'<span>'+esc(name)+' <small lang="ar">'+esc(ar)+'</small></span>').join("")+'</div>'+
      '<label>Damage notes / ملاحظات الأضرار<textarea name="damage" maxlength="1700" placeholder="Additional damage description">'+esc(parsed.notes)+'</textarea></label></section>';
  }
  function accessoriesPanel(d){
    const parsed=unpackChecklistText(d.other_accessories,"ACCESSORIES",extraAccessories.map(x=>x[0]));
    return '<section class="rc-box rc-accessory-panel"><h4>الملحقات والمعدات / Accessories & Equipment</h4>'+
      '<p class="rc-info-note">Tick recorded accessories individually. Unticked means not recorded.</p>'+
      '<div class="rc-accessory-items">'+
      tools.map(([key,name])=>'<label class="rc-check rc-accessory-card"><input type="checkbox" name="tools" value="'+key+'" '+
        ((d.tools||[]).includes(key)?"checked":"")+'><span><strong>'+esc(name)+'</strong><small lang="ar">'+esc(toolArabic[key])+'</small></span></label>').join("")+
      extraAccessories.map(([key,name,ar,icon])=>
        '<button type="button" class="rc-accessory-extra" data-rc-accessory="'+key+'" aria-pressed="'+(!!parsed.marks[key])+'">'+
        '<span aria-hidden="true">'+icon+'</span><span><b>'+esc(name)+'</b><small lang="ar">'+esc(ar)+'</small></span>'+
        '<em class="rc-accessory-tick" aria-hidden="true">'+(parsed.marks[key]?"✓":"+ ")+'</em></button>').join("")+'</div>'+
      '<input type="hidden" name="rc_extra_accessories" value="'+esc(JSON.stringify(parsed.marks))+'">'+
      '<div class="rc-fuel">'+select("fuel","Fuel Level / مستوى الوقود",[["","Not recorded"],["Empty","E"],["Quarter","1/4"],["Half","1/2"],["Three quarters","3/4"],["Full","F"]],d.fuel||"")+'</div>'+
      '<label>Other accessories / ملحقات أخرى<textarea name="other_accessories" maxlength="1400">'+esc(parsed.notes)+'</textarea></label></section>';
  }
  function bindInspection(form){
    const panel=form.querySelector(".rc-damage-panel"),chosen={value:"X"};
    panel?.addEventListener("click",e=>{
      const mode=e.target.closest("[data-rc-mode]");
      if(mode){
        chosen.value=mode.dataset.rcMode;
        panel.querySelectorAll("[data-rc-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b===mode)));
        return;
      }
      const reset=e.target.closest("[data-rc-clear-marks]");
      if(reset){
        const field=form.elements.namedItem("rc_damage_marks");
        if(field.value!=="{}"&&!window.confirm("Clear all marked vehicle damage?"))return;
        field.value="{}";
        panel.querySelectorAll("[data-rc-zone]").forEach(b=>{b.dataset.mark="";b.textContent="+";});
        return;
      }
      const zone=e.target.closest("[data-rc-zone]");
      if(!zone)return;
      const field=form.elements.namedItem("rc_damage_marks");
      let marks={};try{marks=JSON.parse(field.value)||{}}catch(_){}
      const next=marks[zone.dataset.rcZone]===chosen.value?"":chosen.value;
      if(next)marks[zone.dataset.rcZone]=next;else delete marks[zone.dataset.rcZone];
      field.value=JSON.stringify(marks);zone.dataset.mark=next;zone.textContent=next||"+";
    });
    form.querySelector(".rc-accessory-panel")?.addEventListener("click",e=>{
      const accessory=e.target.closest("[data-rc-accessory]");if(!accessory)return;
      const field=form.elements.namedItem("rc_extra_accessories");
      let marks={};try{marks=JSON.parse(field.value)||{}}catch(_){}
      if(marks[accessory.dataset.rcAccessory])delete marks[accessory.dataset.rcAccessory];
      else marks[accessory.dataset.rcAccessory]=true;
      field.value=JSON.stringify(marks);
      const checked=!!marks[accessory.dataset.rcAccessory];
      accessory.setAttribute("aria-pressed",String(checked));
      accessory.querySelector(".rc-accessory-tick").textContent=checked?"✓":"+";
    });
  }

  async function editor(no) {
    await master();
    const phase2 = await supportsPhase2();
    if (no) await fetchRecord(no);
    else current = null;
    const d = current?.record.details || {},
      r = current?.record;
    const options = [
      ["", "Select Insurance Company"],
      ...companies.map((c) => [c.id, c.name]),
    ];
    if (r && r.insurance_id && !companies.some((c) => c.id === r.insurance_id))
      options.push([r.insurance_id, r.insurance_company]);
    const kind = r?.job_type || "INSURANCE";
    if (!phase2 && kind !== "INSURANCE")
      throw Error("This Cash or Credit checklist requires the V305 backend. No data was changed.");
    const typeOptions = [["INSURANCE", "Insurance"],
      ...(phase2 ? [["CASH", "Cash"], ...(kind === "CREDIT" ? [["CREDIT", "Credit"]] : [])] : [])];
    const inputs = fields.map(([k, l, req]) => {
      if (k === "odometer") return '<div class="rc-reading">' +
        select("odometer_unit", "KM / Mile", [["KM", "KM"], ["Miles", "Mile"]],
          d.odometer_unit || "KM") +
        input("odometer", "Reading", d.odometer) + '</div>';
      if (k === "claim") return '<div class="rc-claim">' +
        input(k, l, d[k], req) + '</div>';
      return input(k, l, d[k], req);
    }).join("");
    shell(
      r ? "Edit " + r.rc_no : "New Reception Checklist",
      '<form id="rc-form"><div class="rc-form-brand"><div><strong>ZUKAIT AUTO SERVICES LLC.</strong><small>Vehicle Reception · Oman</small></div><div><h3 lang="ar">استمارة استلام المركبة</h3><b>Vehicle Reception Checklist</b></div></div><p class="rc-form-hint">' +
         (phase2 ? 'Make and Model are required. Cash requires Customer Name; Insurance requires an Insurance Company.' :
          'Insurance checklist only: Cash intake will be available after the verified V305 backend release.') + '</p>' +
        '<div class="rc-form-top">' +
        select("job_type", "Checklist Type", typeOptions, kind) +
        '<div class="rc-insurance">' +
        select("insurance_id", "Insurance Company *", options, r?.insurance_id || "") +
        '</div></div><div class="rc-grid">' + inputs +
        '</div><div class="rc-inspection-layout">'+damagePanel(d)+accessoriesPanel(d)+'</div>'+
        '<div class="rc-box rc-reception-notes"><h4>الملاحظات / Notes & Observations</h4>'+
        textFields.filter(([key])=>key==="warnings"||key==="remarks")
        .map(([key,name])=>'<label>'+esc(name)+'<textarea name="'+key+'" maxlength="2000">'+esc(d[key]||"")+'</textarea></label>').join("")+
        '</div><div class="rc-box rc-customer-sign"><strong>إقرار العميل / Customer Acknowledgement</strong><p>The customer signs the printed A4 checklist after inspection. No signature photo is stored.</p></div>' + (current?.record?.job_card ? input('reason', 'Reason for checklist / vehicle correction', '', true) : '') + '<div class="rc-actions"><button type="submit">Save Checklist</button></div></form>',
    );
    const form = document.getElementById("rc-form");
    const type = form.elements.namedItem("job_type");
    const insurer = form.elements.namedItem("insurance_id");
    const customer = form.elements.namedItem("customer");
    const insurerGroup = form.querySelector(".rc-insurance");
    const claimGroup = form.querySelector(".rc-claim");
    // An existing checklist's type is authoritative. Never silently convert it.
    if (r) type.disabled = true;
    function applyType() {
      const insurance = type.value === "INSURANCE";
      insurerGroup.hidden = !insurance;
      claimGroup.hidden = !insurance;
      insurer.required = insurance;
      customer.required = !insurance;
      if (!insurance && !r) insurer.value = "";
    }
    type.addEventListener("change", applyType);
    applyType();
    bindInspection(form);
    // Track an in-memory form baseline. Never persist unsaved customer details
    // to localStorage or interfere with the existing server request journal.
    checklistSnapshots.set(form, JSON.stringify([...new FormData(form)]));
    form.addEventListener("submit", saveForm);
  }
  function canLeaveChecklist() {
    const form = document.getElementById("rc-form");
    if (!form || !checklistSnapshots.has(form)) return true;
    const changed = JSON.stringify([...new FormData(form)]) !== checklistSnapshots.get(form);
    return !changed || window.confirm(
      "This checklist has unsaved changes. Leave without saving?"
    );
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
        (current.cancellation?.history ? '<div class="rc-box"><b>Job Card cancelled · '+esc(current.cancellation.history.cancellation_date)+'</b><p>'+esc(current.cancellation.history.reason)+' · '+esc(current.cancellation.history.actor_name)+' ('+esc(current.cancellation.history.actor_id)+')</p><p>History and costs retained. Vehicle location remains '+esc(r.location)+'.</p></div>' : '') +
        '<div class="rc-actions">' +
        (r.can_edit ? '<button data-rc-action="edit">Edit</button>' : "") +
        (!r.outcome || current.cancellation?.history
          ? '<button data-rc-action="movement">Record Vehicle Movement</button>'
          : "") +
        (user()?.role !== 'Receptionist' && !r.job_card && !r.outcome
          ? '<button data-rc-action="outcome">Close Insurance Case</button>'
          : "") +
        (current.insurance && (r.job_type || 'INSURANCE') === 'INSURANCE' ? '<button data-rc-action="insurance">' + (user()?.role === 'Receptionist' ? 'Approval & Job Card' : 'Estimates & Approval') + '</button>' : '') +
        (current.cancellation?.can_review ? '<button data-rc-action="cancel-job">Review Job Card Cancellation</button>' : '') +
        (current.preliminary_parts ? '<button data-rc-action="parts">Preliminary Parts</button>' : '') +
        '<button data-rc-action="print">Print</button><button data-rc-action="pdf">Share PDF</button></div><div class="rc-grid"><div class="rc-box"><h4>Customer & Vehicle</h4>' +
        [
          ...((r.job_type || "INSURANCE") === "INSURANCE" ? [["Insurance", r.insurance_company]] : []),
          ...fields.filter(([k]) => k !== "claim" || (r.job_type || "INSURANCE") === "INSURANCE")
            .map(([k, l]) => [l, d[k]]),
          ["Reading Unit", d.odometer_unit],
          ["Received", stamp(r.received_at)],
          ["Job Card", r.job_card],
          ["Job Type", r.job_type || "INSURANCE"],
          ...(r.job_type === "CREDIT" ? [["Credit Account", r.credit_account]] : []),
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
        '<div class="rc-record-map">'+damagedGraphic(d)+'</div><p><b>Damage marks:</b> '+esc(damageSummary(d)||"None recorded")+'</p>'+
        '<p><b>Additional accessories checked:</b> '+esc(Object.keys(unpackChecklistText(d.other_accessories,"ACCESSORIES",extraAccessories.map(x=>x[0])).marks).map(x=>extraName[x]).join(", ")||"None recorded")+'</p>'+
        textFields
          .map(
            ([k, l]) =>
              "<p><small>" +
              l +
              "</small><br>" +
              esc((k==="damage"?unpackChecklistText(d.damage,"DAMAGE",damageZones.map(x=>x[0])).notes:
                k==="other_accessories"?unpackChecklistText(d.other_accessories,"ACCESSORIES",extraAccessories.map(x=>x[0])).notes:d[k]) || "Not recorded") +
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
  function insuranceWorkspace() {
    const r = current.record, info = current.insurance;
    const limited = user()?.role === 'Receptionist';
    const quotes = info.estimates || [], approvals = info.approvals || [], draft = current.preliminary_parts?.items || [];
    shell(r.rc_no + (limited ? " · Approval & Job Card" : " · Estimates & Approval"), badges(r) +
      (r.approval_status === "APPROVED" && !info.approval_valid ? '<p class="rc-error">Approval needs review: source information changed or approval is incomplete.</p>' : '') +
      (limited ? '<p>Insurance approval is recorded by authorized staff. Job Card creation is available only after valid approval.</p>' : '<div class="rc-box"><h4>Linked Estimates</h4>' + (quotes.map(q => '<p><b>' + esc(q.estimate_no) + '</b><br>' + esc(stamp(q.linked_at)) + '</p>').join('') || '<p>No estimates linked.</p>') + '</div>') +
      (current.job_creation?.can_create === true ? '<div class="rc-box"><h4>Create Approved Job Card</h4><p>Creates an unassigned insurance Job Card and transfers only approved parts. Vehicle location stays ' + esc(r.location) + '.</p><form id="rc-create-job">' +
        input('job_card', 'Job Card Number', '', true) +
        (["Manager","Supervisor"].includes(user()?.role)?input('promise_date','Promise Date (optional)','',false,'date'):'') +
        input('reason', 'Creation Notes / Reason', '', true) + '<div class="rc-actions"><button type="submit">Create Job Card & Transfer Approved Parts</button></div></form></div>' : '') +
      (current.external_approval?.can_record && !draft.length ? '<div class="rc-box"><h4>Vehicle Already Approved by Insurance</h4><p>Record the issued approval document reference and evidence. No new quotation is required. Preliminary parts need the quotation approval flow.</p><form id="rc-external-approval">' + input('reference','Issued Approval Reference','',true) + input('approval_date','Approval Date',new Date(Date.now()+4*3600000).toISOString().slice(0,10),true,'date') + input('evidence','Approval Document Reference / Evidence','',true) + input('reason','Verification Notes','',true) + '<button type="submit">Record Existing Insurance Approval</button></form></div>' : '') +
      (current.external_approval?.valid && !r.job_card && !r.outcome ? '<div class="rc-box"><h4>Open Pre-approved Insurance Job Card</h4><form id="rc-external-job">' + input('job_card','Job Card Number','',true) +
      (["Manager","Supervisor"].includes(user()?.role)?input('promise_date','Promise Date (optional)','',false,'date'):'') +
      input('reason','Creation Notes','',true) + '<p>Vehicle location remains '+esc(r.location)+'. Parts continue through the existing Job Card workflow.</p><button type="submit">Open Approved Job Card</button></form></div>' : '') +
      (r.job_card ? '<div class="rc-box"><h4>Linked Job Card ' + esc(r.job_card) + '</h4>' + (limited ? '<p>Approved parts were transferred by the server. Use Vehicle Delivery once work and QC are complete.</p>' : '<p>Continue assignments, parts and repairs through the existing Job Card workflow.</p><p>' + esc(current.job_creation?.transfers?.length || 0) + ' approved part items transferred.</p>') + '</div>' : '') +
      (!limited && info.can_prepare ? '<div class="rc-box"><h4>Prepare / Link Estimate</h4><div class="rc-actions"><button data-rc-action="rc-estimate">+ New Estimate</button></div><p>Save the quotation and allow sync to finish before linking it here.</p><form id="rc-link-estimate">' +
        input('estimate_no', 'Estimate Number', '', true) + input('reason', 'Reason for linking / refreshing', '', true) + '<div class="rc-actions"><button type="submit">Link Saved Estimate</button></div></form></div>' : '') +
      (!limited && info.can_prepare && quotes.length ? '<div class="rc-box"><h4>Record Insurance Approval</h4><form id="rc-approval">' +
        select('quotation_id', 'Approved Quotation', quotes.map(q => [q.id, q.estimate_no]), quotes[0].id) +
        input('reference', 'Approval Reference', '', true) + input('approval_date', 'Approval Date', new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10), true, 'date') +
        input('approved_amount', 'Approved Amount (OMR)', '', true) + '<p>Select only approved parts and their approved quantities.</p>' +
        draft.map(x => '<div class="rc-box"><label class="rc-check"><input type="checkbox" name="approve_part" value="' + esc(x.id) + '">' + esc(x.name) + ' · ' + esc(x.part_no || 'Part number not recorded') + '</label><label>Approved Quantity<input type="number" data-approved-id="' + esc(x.id) + '" min="1" max="' + esc(x.qty) + '" step="1" value="' + esc(x.qty) + '"></label></div>').join('') +
        input('reason', 'Approval Notes / Reason', '', true) + '<div class="rc-actions"><button type="submit">Record Approval</button></div></form></div>' : '') +
      (!limited && info.can_revoke && r.approval_status === 'APPROVED' ? '<div class="rc-box"><h4>Manager Approval Review</h4><form id="rc-revoke">' + input('reason', 'Reason for returning to waiting', '', true) + '<div class="rc-actions"><button type="submit">Return to Waiting for Approval</button></div></form></div>' : '') +
      (limited ? '' : '<div class="rc-box"><h4>Approval History</h4>' + (approvals.map(a => '<p><b>' + esc(a.reference) + ' · OMR ' + Number(a.approved_amount).toFixed(3) + '</b><br>' + esc(a.approval_date) + ' · ' + esc(a.actor_id) + '<br>' + esc(a.reason) + '</p><ol>' + a.approved_parts.map(x => '<li>' + esc(x.name) + ' · Qty ' + esc(x.qty) + '</li>').join('') + '</ol>').join('') || '<p>No approval recorded.</p>') + '</div>' + additionalWorkspaceHtml()) + '<div class="rc-actions"><button data-rc-action="view" data-rc="' + esc(r.rc_no) + '">Back to Checklist</button></div>');
    async function submit(e, fields) {
      e.preventDefault();
      try {
        const f = new FormData(e.target), c = fields(f);
        const result = await mutate({...c, rc_no:r.rc_no, expected_revision:r.revision});
        if (result) { await fetchRecord(r.rc_no); insuranceWorkspace(); }
      } catch (x) { error(x); }
    }
    const external=document.getElementById('rc-external-approval');
    if(external)external.onsubmit=e=>submit(e,f=>({operation:'RECORD_EXTERNAL_APPROVAL',reference:String(f.get('reference')).trim(),approval_date:f.get('approval_date'),evidence:String(f.get('evidence')).trim(),reason:String(f.get('reason')).trim()}));
    const externalJob=document.getElementById('rc-external-job');
    if(externalJob)externalJob.onsubmit=async e=>{
      e.preventDefault();
      try{
        const f=new FormData(externalJob);
        const jc=String(f.get('job_card')).trim().toUpperCase();
        const result=await mutate({operation:'CREATE_EXTERNAL_JOB',rc_no:r.rc_no,expected_revision:r.revision,
          job_card:jc,reason:String(f.get('reason')).trim()});
        if(!result)return;
        const date=String(f.get('promise_date')||'');
        if(date&&window.zukaitReceptionDashboard?.savePromise){
          try{await window.zukaitReceptionDashboard.savePromise(jc,date,'');}
          catch(err){alert('Job Card created; Promise Date was not confirmed: '+(err.message||err));}
        }
        try{await window.zukaitCloud?.pull?.(true);}catch(_){}
        await view(r.rc_no);
      }catch(err){error(err);}
    };
    const link = document.getElementById('rc-link-estimate');
    const createJob = document.getElementById('rc-create-job');
    if (createJob) createJob.onsubmit = async e => {
      e.preventDefault();
      try {
        const f = new FormData(createJob);
        const result = await mutate({operation:'CREATE_JOB',rc_no:r.rc_no,expected_revision:r.revision,
          job_card:f.get('job_card').trim().toUpperCase(),reason:f.get('reason').trim()});
        if (!result) return;
        const promise=String(f.get('promise_date')||'');
        if(promise&&window.zukaitReceptionDashboard?.savePromise){
          try{await window.zukaitReceptionDashboard.savePromise(String(f.get('job_card')).trim().toUpperCase(),promise,'');}
          catch(err){alert('Job Card created; Promise Date was not confirmed: '+(err.message||err));}
        }
        // Pull the server result through the established conflict-aware sync.
        // Never fabricate a local job or overwrite pending workshop work here.
        try { await window.zukaitCloud?.pull?.(true); } catch (_) { /* normal sync retries */ }
        await fetchRecord(r.rc_no); insuranceWorkspace();
      } catch (x) { error(x); }
    };
    if (link) link.onsubmit = e => submit(e, f => ({operation:'LINK_ESTIMATE', estimate_no:f.get('estimate_no').trim(), reason:f.get('reason').trim()}));
    const approval = document.getElementById('rc-approval');
    if (approval) {
      const amount = approval.querySelector('[name="approved_amount"]'); amount.inputMode = 'decimal'; amount.maxLength = 13; amount.pattern = '[0-9]{1,9}([.][0-9]{1,3})?';
      approval.querySelector('[name="reference"]').maxLength = 200;
      for (const check of approval.querySelectorAll('[name="approve_part"]')) {
        const qty = [...approval.querySelectorAll('[data-approved-id]')].find(el => el.dataset.approvedId === check.value);
        qty.disabled = !check.checked; check.onchange = () => { qty.disabled = !check.checked; };
      }
    }
    if (approval) approval.onsubmit = e => submit(e, f => ({operation:'RECORD_APPROVAL', quotation_id:f.get('quotation_id'),reference:f.get('reference').trim(),approval_date:f.get('approval_date'),approved_amount:f.get('approved_amount').trim(),reason:f.get('reason').trim(),
      approved_parts:f.getAll('approve_part').map(id => ({id, qty:Number([...approval.querySelectorAll('[data-approved-id]')].find(el => el.dataset.approvedId === id).value)}))}));
    const additionalLink=document.getElementById('rc-additional-link');
    if(additionalLink)additionalLink.onsubmit=e=>submit(e,f=>({operation:'LINK_ADDITIONAL_ESTIMATE',round_id:additionalLink.dataset.round,estimate_no:f.get('estimate_no').trim(),reason:f.get('reason').trim()}));
    const additionalApproval=document.getElementById('rc-additional-approval');
    if(additionalApproval){
      for(const check of additionalApproval.querySelectorAll('[name="approve_part"]')){const qty=[...additionalApproval.querySelectorAll('[data-approved-id]')].find(el=>el.dataset.approvedId===check.value);qty.disabled=true;check.onchange=()=>qty.disabled=!check.checked}
      additionalApproval.onsubmit=async e=>{
        e.preventDefault();try{
          const f=new FormData(additionalApproval);
          const result=await mutate({operation:'APPROVE_ADDITIONAL',rc_no:r.rc_no,expected_revision:r.revision,round_id:additionalApproval.dataset.round,quotation_id:additionalApproval.dataset.quote,
            reference:f.get('reference').trim(),approval_date:f.get('approval_date'),approved_amount:f.get('approved_amount').trim(),reason:f.get('reason').trim(),
            approved_parts:f.getAll('approve_part').map(id=>({id,qty:Number([...additionalApproval.querySelectorAll('[data-approved-id]')].find(el=>el.dataset.approvedId===id).value)}))});
          if(result){try{await window.zukaitCloud?.pull?.(true);await window.zukaitV2?.sparePartsMain?.hydrateAuthoritativeLists?.()}catch(_){}await fetchRecord(r.rc_no);insuranceWorkspace()}
        }catch(x){error(x)}
      };
    }
    const revoke = document.getElementById('rc-revoke');
    if (revoke) revoke.onsubmit = e => submit(e, f => ({operation:'REVOKE_APPROVAL',reason:f.get('reason').trim()}));
  }
  function additionalWorkspaceHtml(){
    const extra=current.additional;if(!extra)return '';
    const draft=(extra.requests||[]).find(x=>x.status==='DRAFT');
    const quote=draft&&(current.insurance?.estimates||[]).find(x=>x.id===draft.quotation_id);
    return '<div class="rc-box"><h4>Additional Approvals</h4><p>Initial approval: OMR '+Number(extra.initial_amount||0).toFixed(3)+' · Additional approvals: OMR '+Number(extra.additional_amount||0).toFixed(3)+'</p><p>Additional amounts are incremental approvals, not payments or workshop income.</p>'+
      (extra.can_prepare?'<div class="rc-actions"><button data-rc-action="additional-parts">'+(draft?'Edit Additional Request':'+ New Additional Request')+'</button></div>':'')+
      (draft?'<p>Requested parts: '+draft.items.length+' · '+(quote?'Linked estimate: '+esc(quote.estimate_no):'No linked additional estimate')+'</p>':'')+
      (extra.can_prepare&&draft?'<div class="rc-actions"><button data-rc-action="rc-additional-estimate" data-round="'+esc(draft.id)+'">+ New Additional Estimate</button></div><form id="rc-additional-link" data-round="'+esc(draft.id)+'">'+input('estimate_no','Additional Estimate Number','',true)+input('reason','Reason for linking / refreshing','',true)+'<div class="rc-actions"><button type="submit">Link Additional Estimate</button></div></form>':'')+
      (extra.can_prepare&&draft&&quote?'<form id="rc-additional-approval" data-round="'+esc(draft.id)+'" data-quote="'+esc(quote.id)+'"><h4>Approve & Transfer Additional Parts</h4>'+input('reference','Approval Reference','',true)+input('approval_date','Approval Date',new Date(Date.now()+4*3600000).toISOString().slice(0,10),true,'date')+input('approved_amount','Additional Approved Amount (OMR)','',true)+'<p>Select approved quantities only. Existing orders and purchases are preserved. Duplicate active parts require separate review.</p>'+draft.items.map(x=>'<div class="rc-box"><label class="rc-check"><input type="checkbox" name="approve_part" value="'+esc(x.id)+'">'+esc(x.name)+' · Requested '+esc(x.qty)+'</label><label>Approved Quantity<input type="number" data-approved-id="'+esc(x.id)+'" min="1" max="'+esc(x.qty)+'" step="1" value="'+esc(x.qty)+'"></label></div>').join('')+input('reason','Approval Notes / Reason','',true)+'<div class="rc-actions"><button type="submit">Record Additional Approval & Transfer Parts</button></div></form>':'')+
      '<h4>Additional Approval History</h4>'+((extra.approvals||[]).map(a=>'<div class="rc-box"><b>'+esc(a.reference)+' · OMR '+Number(a.approved_amount).toFixed(3)+'</b><p>'+esc(a.approval_date)+' · '+esc(a.actor_id)+'</p><p>'+esc(a.reason)+'</p><ol>'+a.approved_parts.map(x=>'<li>'+esc(x.name)+' · Approved '+esc(x.qty)+'</li>').join('')+'</ol><p>'+((extra.transfers||[]).filter(t=>t.approval_id===a.id).map(t=>esc(t.list_no)+' · Qty '+esc(t.qty)).join('<br>')||'Labour-only approval · No parts transfer')+'</p></div>').join('')||'<p>No additional approvals recorded.</p>')+'</div>';
  }
  function preliminaryParts(additional=false) {
    const r = current.record, draft = additional ? ((current.additional.requests||[]).find(x=>x.status==='DRAFT')||{id:uid(),items:[],status:'DRAFT'}) : current.preliminary_parts;
    const editable = additional ? current.additional.can_prepare === true : draft.can_edit === true;
    shell(r.rc_no + (additional?" · Additional Request":" · Preliminary Parts"),
      badges(r) + (additional?"<p>New parts or labour-only request for additional insurance approval. Requested quantities are not operational orders yet.</p>":"<p>Parts preparation for insurance approval.</p>") +
      (editable ? '<form id="rc-parts"><div id="rc-parts-rows"></div><div class="rc-actions"><button type="button" id="rc-add-part">+ Add Part</button></div>' +
        input("reason", "Reason for this list / change", "", true) + '<div class="rc-actions"><button type="submit">'+(additional?'Save Additional Request':'Save Preliminary List')+'</button></div></form>' :
        '<div class="rc-box">' + (draft.items.map((x, i) => '<p><b>' + (i + 1) + '. ' + esc(x.name) + '</b><br>Qty: ' + esc(x.qty) + ' · Part No: ' + esc(x.part_no || "Not recorded") + '</p>').join("") || "No preliminary parts recorded.") + '</div>') +
      '<div class="rc-actions"><button data-rc-action="view" data-rc="' + esc(r.rc_no) + '">Back to Checklist</button></div>');
    if (!editable) return;
    const rows = document.getElementById("rc-parts-rows");
    function add(x = {}) {
      const row = document.createElement("div");
      row.className = "rc-box";
      row.dataset.partId = x.id || uid();
      row.innerHTML = input("part_name", "Part Name", x.name, true) + '<div class="rc-grid">' +
        input("part_no", "Part Number (optional)", x.part_no) + input("part_qty", "Quantity", x.qty || 1, true, "number") +
        '</div><div class="rc-actions"><button type="button" class="rc-remove-part">Remove Part</button></div>';
      row.querySelector('[name="part_name"]').maxLength = 200;
      row.querySelector('[name="part_no"]').maxLength = 100;
      const qty = row.querySelector('[name="part_qty"]'); qty.min = "1"; qty.max = "100000"; qty.step = "1";
      row.querySelector('.rc-remove-part').onclick = () => row.remove();
      rows.appendChild(row);
    }
    draft.items.forEach(add);
    document.getElementById("rc-add-part").onclick = () => { if (rows.children.length < 200) add(); };
    document.getElementById("rc-parts").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const items = [...rows.children].map(row => ({id: row.dataset.partId,
          name: row.querySelector('[name="part_name"]').value.trim(),
          part_no: row.querySelector('[name="part_no"]').value.trim(),
          qty: Number(row.querySelector('[name="part_qty"]').value)}));
        const result = await mutate({operation: additional ? "SAVE_ADDITIONAL_REQUEST" : "SAVE_PARTS", rc_no: r.rc_no, expected_revision: r.revision,
          ...(additional ? {round_id:draft.id}:{}),
          items, reason: new FormData(e.target).get("reason").trim()});
        if (result) await view(r.rc_no);
      } catch (x) { error(x); }
    };
  }
  async function cancellation(no=current?.record?.rc_no) {
    await fetchRecord(no);
    const r=current.record,c=current.cancellation;
    if(c?.history)return view(no);
    if(!c?.can_review)throw Error('Manager cancellation review is unavailable for this Job Card.');
    const review=c.review,blocked=Number(review.active_assignments)+Number(review.active_sessions)+Number(review.projected_active_sessions)+Number(review.unresolved_projected_assignments)>0;
    shell(r.rc_no+' · Job Card Cancellation',badges(r)+'<h4>'+esc(r.job_card)+' · '+esc([r.details.make,r.details.model].join(' '))+' · '+esc(r.details.registration||'Registration not recorded')+'</h4><p>Cancellation retains technician time, assignments, purchases, consumables and expenses. It is not delivery and does not move the vehicle.</p>'+
      '<p>Active assignments: '+esc(review.active_assignments)+' · Open sessions: '+esc(review.active_sessions)+' · Projected active/paused sessions: '+esc(review.projected_active_sessions)+' · Unresolved projected assignments: '+esc(review.unresolved_projected_assignments)+'</p>'+
      '<h4>Outstanding Parts: '+esc(review.outstanding_parts)+'</h4><ol>'+review.parts.map(p=>'<li>'+esc(p.part_name)+' · '+esc(p.list_no)+' · '+esc(p.status)+' · Ordered '+esc(p.ordered_qty)+' / Received '+esc(p.received_qty)+'</li>').join('')+'</ol><p>Outstanding orders are not cancelled automatically. Review supplier commitments and use the existing parts/return/settlement workflow.</p>'+
      (blocked?'<p class="rc-box">Cancellation blocked by active or unresolved work. Use the existing work controls to resolve it, then reload this review.</p>':'<form id="rc-cancel-job">'+input('job_card','Type Job Card Number to Confirm Identity','',true)+input('cancellation_date','Cancellation Date',new Date(Date.now()+4*3600000).toISOString().slice(0,10),true,'date')+input('reason','Mandatory Cancellation Reason','',true)+'<label class="rc-check"><input type="checkbox" name="review_acknowledged" required>I reviewed work, outstanding parts and financial commitments.</label><div class="rc-actions"><button type="submit">Cancel Job Card & Keep History</button></div></form>')+
      '<div class="rc-actions"><button data-rc-action="cancel-job">Reload Review</button><button data-rc-action="view" data-rc="'+esc(r.rc_no)+'">Back to Checklist</button></div>');
    const form=document.getElementById('rc-cancel-job');if(form)form.onsubmit=async e=>{
      e.preventDefault();try{
        const f=new FormData(form);const result=await mutate({operation:'CANCEL_JOB',rc_no:r.rc_no,expected_revision:r.revision,job_card:f.get('job_card').trim().toUpperCase(),cancellation_date:f.get('cancellation_date'),reason:f.get('reason').trim(),review_fingerprint:review.fingerprint,review_acknowledged:f.get('review_acknowledged')==='on'});
        if(result){try{await window.zukaitCloud?.pull?.(true)}catch(_){}await view(r.rc_no)}
      }catch(x){error(x)}
    };
  }
  async function mutate(command) {
    if (busy) return null;
    const key = retryKey();
    const encoded = JSON.stringify(command);
    let request = savedRequest(key);
    if (request && request.encoded !== encoded)
      throw Error("Confirm the saved Reception action before submitting a different change.");
    if (!request) {
      request = { encoded, request_id: uid() };
      // Persist before transport; storage failure must not send an unrecoverable write.
      localStorage.setItem(key, JSON.stringify(request));
      if (localStorage.getItem(key) !== JSON.stringify(request))
        throw Error("This device could not save the Reception retry. No request was sent.");
    }
    busy = true;
    try {
      const result = await call({ ...command, request_id: request.request_id });
      clearRequest(key, request);
      return result;
    } catch (x) {
      if (x.definitive) clearRequest(key, request);
      throw x;
    } finally {
      busy = false;
      retryBanner();
    }
  }
  async function retrySaved() {
    const key = retryKey(), saved = savedRequest(key);
    if (!saved) return;
    const command = JSON.parse(saved.encoded), result = await mutate(command);
    if (!result || retryKey() !== key) return;
    if (["CREATE_JOB", "CREATE_DIRECT_JOB", "CREATE_EXTERNAL_JOB", "EDIT", "MOVE", "APPROVE_ADDITIONAL", "CANCEL_JOB"].includes(command.operation)) {
      try { await window.zukaitCloud?.pull?.(true); await window.zukaitV2?.sparePartsMain?.hydrateAuthoritativeLists?.(); } catch (_) {}
    }
    const no = result.record?.rc_no || command.rc_no;
    if (no) await view(no);
    else await home();
  }
  async function saveForm(e) {
    e.preventDefault();
    const f = new FormData(e.target),
      details = {};
    fields.forEach(([k]) => (details[k] = String(f.get(k) || "")));
    if ((current?.record.job_type || f.get("job_type")) !== "INSURANCE")
      details.claim = ""; // Never save hidden insurance claims on cash checklists.
    textFields.forEach(([k]) => (details[k] = String(f.get(k) || "")));
    details.tools = f.getAll("tools");
    details.odometer_unit = String(f.get("odometer_unit"));
    details.fuel = String(f.get("fuel") || "");
    try{
      details.damage=packChecklistText(details.damage,"DAMAGE",JSON.parse(String(f.get("rc_damage_marks")||"{}")));
      details.other_accessories=packChecklistText(details.other_accessories,"ACCESSORIES",JSON.parse(String(f.get("rc_extra_accessories")||"{}")));
    }catch(_){error(Error("Invalid damage or accessory markings; save was blocked."));return;}
    if(details.damage.length>2000||details.other_accessories.length>2000){
      error(Error("Damage/accessory notes are too long; shorten the notes before saving."));return;
    }
    if (window.zukaitNormalizeVehicle) {
      const v =
        window.zukaitNormalizeVehicle(details.make, details.model, "") || {};
      details.make = v.make || details.make;
      details.model = v.model || details.model;
    }
    try {
      if (!phase2Enabled && (current?.record?.job_type || f.get("job_type")) !== "INSURANCE")
        throw Error("Cash checklist saving requires the V305 backend. No data was sent.");
      const r = await mutate({
        operation: current ? "EDIT" : "CREATE",
        insurance_id: (current?.record.job_type || f.get("job_type")) === "INSURANCE" ? Number(f.get("insurance_id")) : null,
        ...(current ? {} : { job_type: f.get("job_type") }),
        details,
        ...(current
          ? {
              rc_no: current.record.rc_no,
              expected_revision: current.record.revision,
              ...(current.record.job_card ? {reason:String(f.get("reason") || "").trim()} : {}),
            }
          : {}),
      });
      if (r) {
        if (r.record.job_card) { try { await window.zukaitCloud?.pull?.(true); } catch (_) {} }
        await view(r.record.rc_no);
      }
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
        if (out) {
          if (r.job_card) { try { await window.zukaitCloud?.pull?.(true); } catch (_) {} }
          await view(r.rc_no);
        }
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
      "</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#18324a;font:12px Arial,sans-serif}header{border-bottom:2px solid #165b68;display:flex;justify-content:space-between;padding-bottom:10px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:5px 0}h3{font-size:13px;background:#edf4f7;padding:7px;margin:12px 0 5px}table{border-collapse:collapse;width:100%;table-layout:fixed}td{padding:6px;border-bottom:1px solid #dce5e9;vertical-align:top;overflow-wrap:anywhere}td small{display:block;color:#546977;margin-bottom:3px}.observation{white-space:pre-wrap;overflow-wrap:anywhere;min-height:35px;padding:5px;break-inside:avoid}.sign{display:flex;justify-content:space-between;margin-top:35px;break-inside:avoid}.sign div{width:43%;padding-top:20px;border-top:1px solid #475569}footer{margin-top:20px;font-size:10px;color:#546977}.tools td{padding:7px}section{break-inside:avoid}.printed-car{max-width:100%;max-height:155px;margin:2px auto;text-align:center}.printed-car svg{width:100%;max-height:155px}.rc-record-map svg{max-width:100%;max-height:260px}</style></head><body><header><div><h1>ZUKAIT AUTO SERVICES</h1><small>Zukait International LLC · Oman</small><h2>Vehicle Reception Checklist</h2></div><div><h2>" +
      esc(r.rc_no) +
      "</h2>" +
      esc(stamp(r.received_at)) +
      "<br>" +
      esc(labels[r.location]) +
      "</div></header><h3>Customer & Vehicle Details</h3><table>" +
      [
        [(r.job_type || "INSURANCE") === "INSURANCE" ? "Insurance Company" : "Checklist Type",
          (r.job_type || "INSURANCE") === "INSURANCE" ? r.insurance_company : r.job_type,
          "Customer", d.customer],
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
        ...((r.job_type || "INSURANCE") === "INSURANCE" ?
          [["Claim / Gate Pass", d.claim, "Case Status",
            labels[r.outcome || r.approval_status]]] :
          [["Case Status", labels[r.outcome || r.approval_status],
            "Location", labels[r.location]]]),
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
      '</table><section><h3>Vehicle Damage Diagram / فحص أضرار المركبة</h3>'+
      '<div class="printed-car">'+damagedGraphic(d)+'</div>'+
      '<div class="observation"><b>X = Dent · S = Scratch · M = Missing</b><br>'+
      esc(damageSummary(d)||"No diagram marks")+
      '</div></section><section><h3>Damage Description</h3><div class="observation">' +
      esc(unpackChecklistText(d.damage,"DAMAGE",damageZones.map(x=>x[0])).notes || "Not recorded") +
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
      '</table><small>Unticked accessories are not recorded.</small>'+
      '<div class="observation"><b>Additional equipment:</b> '+
      esc(extraAccessories.map(([key,label])=>(unpackChecklistText(d.other_accessories,"ACCESSORIES",extraAccessories.map(x=>x[0])).marks[key]?"✓ ":"□ ")+label).join(" · "))+
      '</div><div class="observation">Other: ' +
      esc(unpackChecklistText(d.other_accessories,"ACCESSORIES",extraAccessories.map(x=>x[0])).notes || "Not recorded") +
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
        case "retry-pending":
          await retrySaved();
          break;
        case "close":
          if (!canLeaveChecklist()) break;
          closeModal();
          break;
        case "back":
          if (!canLeaveChecklist()) break;
          if (backTarget === "close") closeModal();
          else if (backTarget === "reception-dashboard")
            await (window.zukaitReceptionDashboard?.home?.() || home());
          else if (backTarget === "view" && current?.record?.rc_no)
            await view(current.record.rc_no);
          else if (phase2Enabled && window.zukaitReceptionDashboard?.resume)
            await window.zukaitReceptionDashboard.resume();
          else await home();
          break;
        case "home":
          if (!canLeaveChecklist()) break;
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
        case "direct-job":
          directJob();
          break;
        case "insurance":
          insuranceWorkspace();
          break;
        case "rc-estimate":
          await window.zukaitEstimate.newFromReception(current.record.rc_no);
          break;
        case "additional-parts":
          preliminaryParts(true);
          break;
        case "rc-additional-estimate":
          await window.zukaitEstimate.newFromReception(current.record.rc_no,b.dataset.round);
          break;
        case "parts":
          preliminaryParts();
          break;
        case "cancel-job":
          await cancellation();
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
  // Manager and Supervisor use their existing workshop session.
  // The dedicated Receptionist account signs in through receptionist.html.
  function ensureCards() {
    // A document may disappear while browser tests or mobile WebViews close.
    if (typeof document === "undefined" || !document?.documentElement) return;
    const u = user(), role = u?.role;
    const dashboardId = role === "Manager" ? "managerView" :
      role === "Supervisor" ? "supervisorView" : "";
    for (const id of ["managerView", "supervisorView", "employeeView"]) {
      const root = document.getElementById(id);
      if (!root) continue;
      if (!dashboardId || id !== dashboardId || root.classList.contains("hidden"))
        root.querySelectorAll("[data-rc-menu]").forEach(b => b.remove());
    }
    if (!u?.id || !dashboardId) {
      capUser = "";
      capChecked = false;
      caps = { allowed: false, manager: false };
      return;
    }
    const identity = String(u.id) + ":" + role;
    if (capUser !== identity) {
      capUser = identity;
      capChecked = false;
      caps = { allowed: false, manager: false };
    }
    if (!capChecked) {
      if (!capBusy) {
        capBusy = true;
        call({ operation: "CAPABILITIES" })
          .then(r => {
            if (capUser === identity && user()?.id === u.id && user()?.role === role) {
              caps = r;
              capChecked = true;
            }
          })
          .catch(() => {
            if (capUser === identity) capChecked = true;
          })
          .finally(() => {
            capBusy = false;
            ensureCards();
          });
      }
      return;
    }
    if (!caps.allowed) return; // The server remains the authority for access.
    const root = document.getElementById(dashboardId);
    if (!root || root.classList.contains("hidden") || root.querySelector("[data-rc-menu]")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rc-dashboard-launcher rc-menu";
    b.dataset.rcMenu = "1";
    b.innerHTML = "<b>🚘 Reception</b><small>Checklists · Vehicle movements · Insurance</small>";
    b.onclick = () => {
      if (!["Manager", "Supervisor"].includes(user()?.role)) return;
      home().catch(error);
    };
    // Keep Reception visible near the top, even when dashboard grids are rebuilt.
    const header = root.querySelector(".v135-manager-header,.v91-role-identity,.v92-supervisor-top");
    if (header?.parentElement === root) header.insertAdjacentElement("afterend", b);
    else root.prepend(b);
  }
  window.zukaitReception = { endpoint: API, open: home, dashboardShell:shell, checklistList:()=>basicHome(true), newChecklist:()=>editor(), directJob, action:apiAction, openCancellation: no => cancellation(no).catch(error), openRecord: no => view(no).catch(error), documentHtml, ensureCards, call };
  style();
  new MutationObserver(ensureCards).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  setTimeout(ensureCards, 0);
})();

