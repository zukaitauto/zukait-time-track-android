# V318 QA concurrency verification — 2026-10-13

Scope: isolated Supabase QA project `omqgkqknbdcnotabffek`, **not** production. Production `workshop-api` and `staff-auth` function code hashes deployed to QA and confirmed ACTIVE.

- `workshop-api`: `7851e6f24410ae095fae323f7535756f7b0a0d154faf2bccab59b0aa72135188`.
- `staff-auth`: `fbad6dbe32a9d6fd84ec77770e5fb6749503ea588ccb3ab5e45accf4019ddbf3`.
- Two QA-only records were created: `RC-QA-V318-CONC-A`, `RC-QA-V318-CONC-B`.
- Two competing database Reception edit commands submitted with expected revision 1 for A. First accepted (revision 2). Second rejected with `reception_stale_revision`. B remained revision 1.
- Follow-up QA query confirmed A revision 2, B revision 1. QA audit table showed one audit row for A.
- QA credentials exist for Employee, Receptionist, Supervisor and Manager roles. Their existence was checked but **no independent authenticated HTTP login/session test was performed**.

This is verified isolated database-level stale-edit protection, **not** production concurrent-save acceptance, authenticated QA role-matrix proof or hosted V318 acceptance. Keep `preservation`, `permissionSmoke` and `hostedQa` release gates pending until genuinely verified. Do not use this document to override or skip protected publisher checks. No production data were modified in this QA exercise.
