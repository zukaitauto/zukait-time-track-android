# Accountant concurrent-read optimization

Development candidate only. No production migration, deployment, feature activation,
financial record change, history deletion or Android/web publication has occurred.
The earlier 14%-slower temporary-spill patch remains unapplied and independent.

## Behavior and correctness boundary

The original one-RPC path remains for the first or sequential read. While that actor
already has a request in flight, overlapping followers obtain an authorized primary
PostgreSQL snapshot probe and may share one additional context load. The original
first load is never shared without a known snapshot. A 20-request synthetic overlap
uses **2 full loads + 19 tiny probes**, versus 20 full loads originally. This is a
90% reduction in full loads for that fixture, not a 90% production-traffic claim.
Two overlapping requests do not save a full load; if writes keep changing snapshots,
sharing may not occur and probes add overhead. Observe real overlap before activation.

There is no TTL or completed-context cache. Promises leave the map immediately on
success/failure. Shared input is frozen, all calculations still execute per request
using their own current time, and financial commands bypass sharing. Pending scopes
are bounded to eight; overflow follows the original full-read path. Map keys include
project, actor, role, database OID, postmaster start timestamp and exact MVCC snapshot.

The new `zukait_accountant_read_snapshot(text)` routine is STABLE/security invoker,
checks the same active Manager/Accountant/must-change policy, returns no financial
or credential data, and is executable only by postgres/service_role. It adds no
business writes, triggers, change-counter tables or indexes. It is a draft under
experiments, not an applied migration. Primary PostgreSQL POST RPCs are required;
no replica/TTL-based assumptions are used. Every HTTP request still passes existing
session revocation and active-account checks before accountantApi is entered.

Changes to the ledger or parts events invalidate visibility even when workshop revision
is unchanged. Committing an already-active transaction changes the snapshot, so a
post-commit reader cannot join an older shared load. A database restart changes the
instance component. Probe failures or malformed/mismatched identities fail closed;
there is no silent reuse of old data on an upstream error.

## Verification

Unit tests cover sequential/burst paths, account/project/role/database/instance/snapshot
isolation, errors, capacity, immutable shared data and flag-off/write bypass. Both-role
financial reports, dashboard, JC search/detail and Manager profit outputs match the
original on rich materials/paint/parts/session/invoice/receipt fixtures. SQL fixtures
verify function privileges, forbidden actors, ledger/event/snapshot changes and actual
financial command behavior. Native PostgreSQL 17 additionally checks a commit race
against a separate writer while an older shared context is pending.

A first implementation probed every read and qualified 20→1 full loads. The final
adaptive form intentionally uses 20→2 to avoid penalizing ordinary sequential reads.
Report only final-source CI results for production approval. No live daily traffic,
latency, billed egress, peak RAM or restart-prevention savings have been established.

## Minimal rollout preparation

Live bundle was inspected read-only: workshop-api **version 117**, verify_jwt false,
42 files, deno.json import map. Its Accountant API matches the inspected repository
baseline `35e6792fd0b7a996f2a6d9c60856b93463a6aebc` (ignoring CRLF). Other index.ts
changes in development are not approved for automatic deployment.

`scripts/prepare-accountant-read-coalescing.mjs` prepares a review-only bundle from
that exact live baseline. Only index.ts's services argument and Accountant API loader
change; context_reader.js is added. **40 original modules stay byte-identical** and
the original deno.json/verify_jwt configuration is retained. Newer baseline versions,
API drift and unsafe paths abort preparation. Raw live/candidate/rollback bundles are
local review artifacts and are not committed to GitHub.

The flag `ZUKAIT_ACCOUNTANT_COALESCE_READS` defaults off. Rollout requires separate
approval for exact schema/function and minimal backend source on project
pjknotnjkufadqavcmii. Recheck live version first. Generate a migration with Supabase
CLI, apply the service-only probe atomically, verify grants and behavior, then deploy
the minimal bundle with the flag still off. Only enable after explicit approval and
eligibility measurements; preserve all other secrets/flags. Missing probe must never
be worked around by allowing anonymous access or caching stale data.

Rollback: disable the flag to restore the original read path. Retain the exact old
bundle for code rollback. The unused service-only probe may stay until a separately
reviewed cleanup. Do not execute the old spill patch or delete history as part of this.

Remaining database work: measured sequential/filter-aware reads, compact-history
qualification/cutover, and separate Supabase host/billing/restart investigation.

## Approved inactive staging — 12 November 2026

The owner approved staging qualified commit 0c59b456 on the live project. Migration
20261112170825_accountant_read_snapshot_probe is applied and verified service-only.
Backend v118 is a minimal v117-based patch: 43 files read back exactly, 40 original
modules unchanged, original import map and verify_jwt false retained. The dispatcher
uses **literal coalesceContextReads:false**, so an environment flag cannot enable
sharing. The staging bundle builder now emits that hard-disabled profile by default.
The repository handler retains the qualified configurable hook for development.

Existing heavy-context definition remains 5cb0e04223f9f3e517ece00eb11fa8a3. New probe
definition is 2f39cf119881db8fe17080efb0214ec9, stable/security invoker, postgres owner,
fixed search_path, only postgres/service_role EXECUTE. Unknown actors were denied
without inserting test records. Invalid-session workshop/accountant/staff-auth reads
returned HTTP401 and the web entry returned HTTP200. Authenticated device workflows
were not exercised during staging. No financial records, history or staff application
release were changed. The old v117 bundle is archived locally for code rollback.

This stage has **no active optimization benefit yet**. Capture comparable baseline
counters and explicitly review a controlled activation separately. Enabling requires
a new approved dispatcher configuration; changing the secret flag alone is insufficient.
