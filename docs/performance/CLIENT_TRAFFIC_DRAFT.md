# Client traffic draft — latest-code acceptance

Reconciled with architecture-v2 14cc1c32524bdf59771cf888da6dae904a5cffe7. No production rollout, version/cache bump or database change. Retains the current shared outage cooldown, busy-state handling, monthly projection and sublet routes. Do not replace the latest client with the older original PR source.

- Coalesce only overlapping identical report requests, scoped to login token, employee, role and full payload. Clone results independently. Remove entries on success/failure. Subsequent reads remain fresh.
- Suppress an unchanged full-state upload only after exact in-memory acknowledgement by a successful save at the same login/role/revision. Never trust persisted cached state. Pending conflicts and denied snapshots prevent suppression. Offline and shared retry barriers remain effective. Skipping a no-op does not refresh the connection-health indicator.

The real client push and three-way merge functions are exercised with two independent device contexts and a synthetic CAS server. Both independent leave additions survive the competing revision, as does a newer leave edit made while a session save is in flight. The latter remains dirty/persisted until the follow-up succeeds. Twenty unchanged dirty events after an acknowledgement add zero uploads in this constructed scenario; changed saves still send immediately. This is not an estimate of production savings. The synthetic server is not a Supabase load test.

Report tests cover overlapping callers, independent result mutation, fresh subsequent reads, pagination, login-token isolation and retry after failure. Existing cooldown, denied-change, leave race, hidden read, updater and compatibility tests are retained. CI tests the actual current repository assets. The historical before/after traffic benchmark is not claimed because the old baseline is absent locally.

Release status: draft only. Exact-source Android/web release gates and cache/version metadata must be completed separately. This reduces redundant reports/uploads; it does not eliminate full-state reads or prove a fix for database timeouts. The database reception guard experiment remains separate in PR #48.
