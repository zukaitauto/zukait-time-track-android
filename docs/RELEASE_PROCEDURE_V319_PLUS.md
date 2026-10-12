# Zukait release procedure — proposed V319+ simplification

This document describes a **future** release policy; it does not authorize V318 or change the protected publication workflow.

## Normal UI corrections
Only UI assets, copy, spacing, styles, or presentation changes with no backend, authentication, data schema, financial rules, or customer-data mutation changes.
1. Review the exact diff with `node scripts/release-tier.cjs <base-commit>` (advisory only).
2. Run targeted UI/browser checks, complete automated CI, and confirm no production backend/source drift.
3. Obtain explicit version-specific owner approval, pin the source commit and signed APK provenance.
4. Publish using the existing approved protected workflow, then check live website and APK.
5. If a requested UI action creates or edits a record, escalate to major review.

## Major changes
Backend, SQL/migrations, role permissions, vehicle and job records, estimates, invoices, insurance LPO, time/audit trails, and release controls:
1. Test on isolated data with a restore rehearsal and permissions matrix.
2. Verify production data preservation and backup/recovery readiness (or use only an expressly approved, separately documented deferral path allowed by the protected policy).
3. Verify Manager, Supervisor, Receptionist and relevant roles against authorized test accounts.
4. Obtain explicit version-specific owner approval and publish through the protected workflow.

## Non-negotiable protections
- Use `architecture-v2`, never alter `main`.
- A green build does not prove authenticated production behavior.
- Classification is advisory; it does **not** set `approvedForStaff`, override gates, trigger deployment, or claim backups exist.
- Unknown or mixed changes require human review, not automatic categorization as UI-only.
- V318 remains subject to its existing mandatory acceptance and approval checks.
