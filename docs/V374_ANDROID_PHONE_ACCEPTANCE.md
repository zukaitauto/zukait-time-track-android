# V374 physical Android test — 25 October 2026

Device: user's vivo Y04, reported model V2430, Android 15. Connected by authorized USB ADB. Tester: Codex, using the installed Android WebView with its debugging endpoint. Native screenshot capture stopped working after initial login, so later evidence is live DOM/runtime state and server readback; visual QA is partial.

Package: com.zukait.timetrack.acceptance, V374-ACCEPTANCE, code337, source26e6b5f0e36eb2b0a1b1a0254f78bd0493eb278d. Downloaded artifact ZIP SHA256 c87b49382ff19c019892dd886a56e332e1dfcf00e20ccbed8d08815e87a586f5 matched GitHub's artifact digest before installation. QA workshop-api30 only. No production deployment.

Observed passes (approximately 18:38–18:41 Oman time):
- Supervisor login reached the Supervisor dashboard. Logout returned a clean login screen with no dashboard text and blank login fields. Manager login reached Manager with no prior Supervisor name visible after completion. Frame-by-frame transient leakage and artificially delayed network races were not captured in this phone run; automated regression tests cover those separately.
- Actual airplane mode replaced the workshop screen with 'Connection unavailable. Reconnect to verify your session.' Only Reconnect/Sign out remained; no workshop data or business-action controls were present. Airplane mode disabled and Wi-Fi/mobile data restored; Reconnect recovered Manager. Cold process restart offline and direct server-action rejection were not separately exercised here.
- Cash October report displayed OMR20.000 and one dated QA invoice row. Insurance October report displayed OMR25.125 and one dated LPO row, with company selector. Missing costs correctly stayed Pending. Insurance graph opened and showed pending costs. Both reports and graph had no document-width overflow. Changing company/month and positive/negative profit colours were not tested on this phone in this run.
- Manager Edit Part direct arrival tested on new clearly labelled QA part 'QA374 PHONE DIRECT ARRIVAL', PL002, jobQAFDDA0BFCEN. Actual UI prompts requested received quantity and direct-arrival reason. First receipt1/2 succeeded; second receipt1/2 completed2/2. Both had no pending-sync/conflict and no Supervisor-verification timestamp. Authoritative database readback: partSP-01845a4d-399e-4ad5-ad4d-c970cd50a47b, statusRECEIVED, ordered_qty2,received_qty2. QA fixture and its audit history retained, no real part changed.

Cleanup: test accounts QA374PHONE_M and QA374PHONE_S signed out, disabled and all their sessions revoked. USB ADB forward tcp9222 removed. No production staff credentials used. No production workshop records changed.

This is partial Android acceptance, not a blanket release approval. Physical Safari, remaining phone scenarios, independent recovery/preservation evidence, PC reconciliation and coordinated backend/release gates remain outstanding. Do not mark unperformed checks passed.

