# Client traffic draft — held for measurement

Prepared against production architecture-v2 877ecd874f802ae3d7d48e30502da97cc05b2ffa. No version, cache key, deployment or production database change.

- Coalesce overlapping identical report requests scoped to login token, employee, role and full request. Clone responses for each consumer; remove entries on completion or failure. No completed-result cache or change to foreground/resume polling.
- Skip full uploads only for exact in-memory server-acknowledged payload at the same revision/login/role. Preserve pending conflicts and denied changes. Changed snapshots and revision/account changes use normal save handling. No connectivity indicator is refreshed by a skipped upload.
- The upload acknowledgement comes from a successful save, not a persisted cache or normalized pull. Suppression is deliberately conservative.

Validation: client-traffic-coalescing, permission-retry-barrier, cloud-save-permission-rejection, leave-sync-race, leave-sync-authority, hidden-read-traffic, native-update-sync-safety, live-projection-traffic, cloud-dashboard-stability and sync-traffic-compatibility (with --experimental-vm-modules) pass locally. Syntax and diff checks pass. The historical traffic-optimization benchmark could not run because its old baseline commit is unavailable in this checkout; no historical benchmark result is claimed.

Hold this draft until the read-only 22 October 2026 16:58 Oman measurement of the database helper optimization. After reviewing measurement, run the normal exact-source release gates and update client cache/version metadata for a future release. This draft does not establish measured production bandwidth savings.
