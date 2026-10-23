# SUP003 account and QC decision

Owner decisions in this thread: create a new Jibin account as SUP003; SUP003 is the sole QC approver for Mechanical-only jobs. Mixed Mechanical/paint jobs retain the existing painting and final QC checks. Whether to add Jibin as a third mixed-job approver is pending explicit confirmation; the draft leaves that policy unset/inactive.

Prepared profile (NOT created or enabled by this draft):

| Field | Value |
| --- | --- |
| Immutable staff/login ID | SUP003 |
| Display name | Jibin |
| Role | Supervisor |
| Department | Mechanic |
| Initial password | Manager enters privately in existing account setup |
| Change password on first login | Required by existing account creation |

A read-only aggregate check of pjknotnjkufadqavcmii on 2026-10-23 returned sup003_login_exists=false (the ID is free) and the existing employee department label `Mechanic`. Recheck uniqueness immediately before creation. This document is not a reservation and does not prove a later account creation occurred.

Use the existing authenticated Manager Create User flow, whose staff-auth manager_create endpoint validates Manager credentials, uniqueness, role and password strength and sets must_change=true. Do not insert password rows with SQL, reuse another supervisor's identity, store credentials in this repository/chat, or grant a shared password. No credentials are supplied by this document.

Account creation alone must not enable the Mechanical pilot or grant unqualified QC persistence/delivery rights. Existing ordinary Supervisor rights remain as implemented. Future explicit Mechanical operation mapping should cover the approved checklist/task workflow, with MECHANICAL_QC limited to SUP003. Existing painting QC remains SUP002 and existing final QC remains SUP001 for mixed jobs; neither is globally widened.

The new QC module is an inactive pure proposal with no routed or persisted QC writes. It requires complete tasks/terminal assignments, known employee departments, unchanged work/task/allocation fingerprints and both record revisions. Mechanical-only readiness follows SUP003 approval alone. Mixed readiness requires an explicit policy: candidate modes retain the two legacy approvals, with or without an additional SUP003 pass. The default is unset and blocks readiness. Delivered jobs reject new approval, and changes invalidate readiness. Retry receipts represent historical approval and require a fresh readiness read.

Before live account/feature rollout, prepare the exact environment/source packet and use the existing approval process. Mechanical QC still needs atomic session-bound persistence, protected server-owned approval state, legacy save preservation, route-specific QC/delivery integration and UI before activation. No migration, deployment, account write or flag change was performed here.
