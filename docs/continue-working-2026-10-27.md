# Manager Continue Working — 27 October 2026

Source change only, architecture-v2. No production deployment, time correction or release approval is implied.

## Behavior

Manager → Time Management → Add Missing Time now offers Continue Working for an open normal assignment on an active job. End input is hidden/disabled and the command has end:null. This disposition is supported only for ADD_SESSION; historical corrections retain Pause/Finished. Completed assignments require the existing explicit Reopen operation. Delivered/archived jobs remain historical Finished-only. ID001 itself cannot be started with this option.

The existing server time_management operation validates Manager role, employee, assignment and all employee sessions, applies the transition, and commits via the existing revision-checked zukait_commit_workshop_state_v2 RPC. It writes an open assignment-linked server-authoritative session with the entered start and Manager correction metadata. Existing employee Pause/Finish, live-status projections, session-based history/reports and Oman duty/lunch calculation consume that session. A new start cannot overlap any non-cancelled session, including other jobs and ID001. Existing running ID001 is rejected, never automatically closed or rewritten. Future starts and intervals exceeding the existing seven-day correction window are rejected.

The existing append-only Manager audit retains actor, reason, request ID, server timestamp, before/after session and assignment values. The original input is not mutated. The same request returns its stored receipt before stale-state checks, including after the employee subsequently pauses/finishes.

Before sending Continue Working, the client persists an actor-scoped pending command. Network/unknown outcomes retain its exact identity and payload across reload, with explicit Retry same confirmation. A confirmed matching audit removes it; explicit business rejection requires reviewing fresh records. Corrupt/full storage blocks sending. Privacy cleanup retains this journal but continues clearing renderable caches. No automatic write replay is added. Older installed clients do not know this new journal prefix; mixed-version use of the same browser storage requires rollout verification before publication.

## Authorized Zaheer correction: conflict, not applied

Read-only production inspection at workshop revision15086 confirmed employee EMP007 and active JC12098 assignment f628b6f2-2724-4621-bf21-1e2efcbce728. Requested start2026-10-27T07:00:00Z is11:00AM Asia/Muscat.

Saved records at inspection (all27October, Oman time):

| Record | Start | End |
|---|---|---|
| ID001 |08:16:28|11:07:33|
| JC12098 paused session |15:03:23|15:45:54|
| ID001 |15:46:58|Open|

An open11:00AM session overlaps these records. Per the owner's instructions, preserve them and report the conflict instead of overwriting. No production correction was sent; no Manager was impersonated, existing session closed or historical row deleted. Owner must identify which existing records are incorrect and authorize their precise audited correction before the requested open interval can be applied. Re-read production before any eventual correction because staff continue working.

## Validation and release

tests/continue-working.mjs executes server rules, actual Employee transitions and live projection, the real time_management CAS route, and real DOM Manager form/journal flows. Covers open session/no end, duty/lunch and growing timer, Pause/Finish, role enforcement, future/overlap/ID001 rejection, prior-history preservation, idempotent late retries, racing employee updates, double tap, lost response/reload, account scoping and storage failure. Existing Manager time, disposition, allocation, cancellation, account isolation, employee authority and ID001 suites must remain green. CI adds this suite alongside disposition and Manager tests.

Physical Android/web cross-role validation and isolated backend deployment smoke are distinct from these automated checks; do not mark them passed from source tests. Preserve the modern3-3-2 Manager Workshop Performance layout from3a37257627 and unrelated fixes. No main branch mutation. Deployment must coordinate server rules and new clients through the approved workflow; old backend rules reject CONTINUE. Production runtime, data and release approval metadata remain unchanged by this implementation.
