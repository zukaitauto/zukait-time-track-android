#!/usr/bin/env bash
set -euo pipefail
# Every caller runs the same DOM tests with the pinned development dependencies.
if ! node -e "require.resolve('jsdom')" >/dev/null 2>&1; then
  npm ci --ignore-scripts --include=dev
fi
node tests/completed-overdue-runtime.mjs
node tests/manager-header-menu-runtime.mjs
node tests/app-exit.mjs
node tests/vin-scan-runtime.mjs
node tests/secure-session-restore.mjs
node tests/functional-smoke.mjs
node tests/manager-time-management.mjs
node tests/cash-monthly-pulse.mjs
node tests/leave-after-work.mjs
node tests/supervisor-leave-dashboard.mjs
node tests/global-leave-history.mjs
node tests/leave-sync-race.mjs
node tests/employee-finish-server-authority.mjs
node tests/consumables-smoke.mjs
node tests/consumables-ui.mjs
node tests/material-list-navigation.mjs
node tests/assignment-search-ui.mjs
node tests/supervisor-stable-ui.mjs
node tests/live-status-authority.mjs
node tests/paused-menu-consistency.mjs
node tests/qc-delivery-authority.mjs
node tests/invoice-entry.mjs
node tests/job360-profit-loss.mjs
node tests/consumables-backend-security.mjs
node tests/v128-costing-safety.mjs
node tests/registration-authority.mjs
node tests/id001-preliminary-labour.mjs
node tests/id001-achieved-classification.mjs
node tests/id001-preliminary-classification.mjs
node tests/id001-preliminary-end-to-end.mjs
node tests/v156-id001-preliminary-server-deployment.mjs
node tests/paint-safety.mjs
node tests/paint-order-authority.mjs
node tests/vehicle-logo-assets.mjs
node tests/native-update-integrity.mjs
node tests/native-update-sync-safety.mjs
node tests/release-latest-integrity.mjs
node tests/architecture-v2.mjs
node tests/v2-work-events.mjs
node tests/v2-reconnect-authority.mjs
node tests/v2-reconnect-shadow-readonly.mjs
node tests/v2-authority-adapter.mjs
node tests/v2-reconcile-runtime.mjs
node tests/v2-pilot-activation.mjs
node tests/v2-work-rules.mjs
node tests/v2-data-paths.mjs
node tests/v2-server-data-adapter.mjs
node tests/v2-report-server-adapter.mjs
node tests/v2-event-write-idempotency.mjs
node tests/v2-api-single-authority.mjs
node tests/v2-sql-migration-integrity.mjs
node tests/v2-sql-delimiters.mjs
node tests/v2-server-calendar-leave-authority.mjs
node tests/v2-leave-projection-authority.mjs
node tests/v2-calendar-projection-authority.mjs
node tests/v2-one-active-session-authority.mjs
node tests/v2-id001-auto-stop-authority.mjs
node tests/v2-assignment-authority.mjs
node tests/v2-delayed-replay-authority.mjs
node tests/v2-queue-conflict-quarantine.mjs
node tests/v2-conflict-visibility.mjs
node tests/v2-conflict-resolution-lifecycle.mjs
node tests/v2-bounded-pagination-cursors.mjs
node tests/v2-pagination-contract-consistency.mjs
node tests/v2-pagination-overload-safety.mjs
node tests/v2-pagination-timestamp-tie-safety.mjs
node tests/v2-composite-pagination-cursor.mjs
node tests/v2-composite-pagination-scale.mjs
node tests/v2-repeat-consumables-server-authority.mjs
node tests/v2-spare-parts-server-authority.mjs
node tests/v2-spare-parts-durable-authority.mjs
node tests/v2-spare-parts-hardening.mjs
node tests/v215-spare-parts-entry-regression.mjs
node tests/v2-multidevice-conflict-matrix.mjs
node tests/v2-same-employee-device-race.mjs
node tests/v2-pause-finish-delayed-race.mjs
node tests/v2-conflict-does-not-block-queue.mjs
node tests/v2-id001-normal-job-device-race.mjs
node tests/v2-id001-preliminary-authority.mjs
node tests/v2-id001-preliminary-link-authority.mjs
node tests/v2-jobcard-projection.mjs
node tests/v2-wip-completion-target.mjs
node tests/v2-jobcard-projection-conflicts.mjs
node tests/v2-jobcard-event-projection.mjs
node tests/v2-work-session-projection.mjs
node tests/v2-work-state-machine-authority.mjs
node tests/v2-job-workflow.mjs
node tests/v2-spare-parts.mjs
node tests/v2-spare-parts-edit-delete.mjs
node tests/v2-estimate-smoke.mjs
node tests/v2-estimate-functional.mjs
node tests/v2-estimate-shared-sync.mjs
node tests/legacy-closed-session-authority.mjs
node tests/v2-repeat-work.mjs
node tests/v2-leave.mjs
node tests/v2-consumables.mjs
node tests/v2-notification-rules.mjs
node tests/v2-notification-center.mjs
node tests/manager-paint-notifications.mjs
node tests/v2-reports.mjs
node tests/v2-scale-benchmark.mjs
node tests/v2-migration-completeness.mjs
node tests/v2-production-isolation.mjs
node tests/v2-combined-module-integration.mjs
node tests/v2-full-regression-manifest.mjs
node tests/release-latest-integrity.mjs
node tests/ci-release-gate-parity.mjs
node tests/reception-v305-acceptance.mjs
node tests/reception-backup-export-safety.mjs
node tests/reception-release-publish-safety.mjs

node tests/v181-manager-performance-cost-drilldown.mjs
node tests/v145-manager-consumables-expense-detail.mjs
node tests/dashboard-mutation-stability.mjs
node tests/cloud-dashboard-stability.mjs
node tests/dashboard-render-visibility.mjs
node tests/dashboard-display-check.mjs
node tests/workshop-overview.cjs
node tests/manager-overdue-time-review.cjs
node tests/job360-details.mjs
node tests/v200-manager-workshop-overview-placement.mjs
node tests/v194-manager-menu-authority.mjs
node tests/v195-manager-consumables-single-launcher.mjs
node tests/v196-manager-header-top.mjs
node tests/v196-manager-no-duplicates.mjs

node tests/technician-workload.mjs


node tests/print-navigation.mjs

node tests/spare-parts-expense-filters.mjs

node tests/time-management.mjs
node tests/ideal-time-monitor.mjs


node tests/finished-assignment-performance.mjs

node tests/technician-work-history.mjs

node tests/native-dialog-lifecycle.mjs
node tests/manager-quick-view.cjs
node tests/focused-job-navigation.cjs

node tests/manager-full-edit.cjs

node tests/job-type-authority.mjs
node tests/employee-parts-privacy.mjs
node tests/technician-idle-time.mjs

node tests/reception-vehicle-authority.mjs

node tests/reception-additional.mjs

node tests/reception-cancellation.mjs
