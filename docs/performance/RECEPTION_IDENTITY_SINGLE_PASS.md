# Reception identity single-pass experiment

Status: isolated candidate; no production migration, rollout or app change.
Base: architecture-v2 14cc1c32524bdf59771cf888da6dae904a5cffe7.

Only zukait_reception_vehicle_state_guard is changed. Linked job counts are extracted once; per-reception master overlays are collected, then the ordered jobs array is rebuilt once. The uniqueness of workshop_receptions.job_card and the current identity helper (which does not change job number) are necessary assumptions. No permissions or validations are removed. Estimate processing remains in its original order, including legacy overlapping references. This is deliberately narrower than rewriting every trigger.

The function is held in experiments/, outside migrations. The existing production function is preserved in tests/fixtures/reception-identity-guard-before.sql. No schema, application version, release approval metadata or live records are changed.

Tests compare 17 insert/update, stale identity, alias, missing/duplicate job, linked quote and unrelated-record outcomes against the old function, then run existing reception SQL permission/identity/cancellation regressions. Full-save measurements include all state triggers, 4 linked receptions, 1,000 jobs, 19 employees and 7,000 synthetic sessions at work_mem=2184kB. Both arms use the same deployed optimized live-status helper. Existing native concurrency acceptance is run with the candidate installed.

Local PGlite preliminary median full-save results: 129.029 ms before, 126.746 ms after; temporary blocks 237 before and after. This small difference is not evidence of a meaningful improvement. Native PostgreSQL 17 results determine whether the candidate merits further work; no production latency, bandwidth, physical Disk IO or timeout reduction is claimed.

The read-only live diagnostics showed repeated JSON guard work, not proof that this particular guard caused the observed timeouts. Retain this as an experiment if end-to-end gains are negligible. Do not increase timeouts, disable guards, delete history or deploy this candidate merely because output parity passes.

Native PostgreSQL 17 acceptance completed successfully: https://github.com/zukaitauto/zukait-time-track-android/actions/runs/39809223484 (tested code 51c3539e59b6f146a67e8dd1f57ea49dd068eeff). All 17 parity cases, existing permission/identity/cancellation regressions and native concurrency/delivery acceptance passed. Median full-save: 104.959 ms before, 99.316 ms after (~5.4% lower); temp written blocks 494 before and 494 after. Three alternating pairs, synthetic data only: improvement is modest, no statistical or production claim.

Decision: retain as draft experiment, not an established timeout fix. No production deployment recommended from this evidence alone. Next investigation should attribute production timeout/resource pressure more precisely while keeping current business guards intact. The first CI attempt passed benchmark/parity but failed due to recreating an existing test role; running the role-creating concurrency fixture first resolved the harness issue.
