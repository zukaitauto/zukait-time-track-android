# Accountant Stock parity — 25 Nov 2026

Owner explicitly requested Manager-equivalent access within Stock only. Existing V153 server and SQL restrict Accountant to opening, purchase invoices, correction, audit and reads. The UI must not pretend additional functions are available. No global Manager impersonation or full workshop state access.

Required scoped implementation:
- Inventory adjustment and minimum: allow only explicit authenticated Accountant Stock commands; preserve counted quantity, reason, actor, request id, reserved-stock constraints, audit, and transactional SQL guards. Test denial of issue/return and other non-stock operations where not explicitly in the Stock menu.
- Invoice cancellation and price reconciliation: keep stock reversal and price audit atomic; enable Accountant through explicit API and SQL permission checks, not a fabricated Manager identity. Preserve historical costing and exact retry.
- Material creation and Brand & Price: implement narrow session-bound catalog reads/writes and effective-date price correction paths; no generic workshop-state read/save permission. Existing Manager operations use legacy state and must not be copied wholesale to the Accountant client.
- Test actual signed-in Accountant and Manager, both departments and Both/shared material, real browser entry/history/adjustment/master workflows, denial of unrelated Manager and staff management APIs, then deploy.

Current commit fixes workspace navigation and readiness error handling. It intentionally does not activate unimplemented privileged operations or change production data.

## Legacy review follow-up
Staged API and preview RPC now allow Manager and Accountant to review the same bounded saved pairs and link already classified pairs. The existing atomic-link database restriction on Accountant classification of genuinely unassigned legacy materials remains in force. Manager classification is required for those items. No production schema, function or setting changed. Verify both roles in isolated QA before deployment.
