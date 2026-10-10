# Reception dashboard visibility correction

V305 delivered matching web/APK bytes but its home() gate still opened the old checklist-only home when the production server rejected reception_dashboard. Delivery parity did not prove the ten-point dashboard was activated.

The corrected shared client always opens the ten numbered sections. An explicit read-only capability probe determines available operations, never the layout. Checklist intake/list use the existing service; unavailable actions explain the missing server support and make no unsupported requests. They show no invented counts or empty lists. Back returns to the new dashboard. Both HTML entrypoints use a fresh Reception cache tag.

This correction is staged source, not a claim of full production activation. The remaining eight dashboard actions, enhanced filters, and Promise Date still require the Phase 2 production server/API/migrations. The owner deferred backup; physical Android/Safari and real HTTPS acceptance must still be completed before changing production workflows. No backend deployment, gate attestation, or staff updater change is included.

Tests cover the real production-like unsupported_action path, ten cards and numbering, safe checklist access, Back navigation, unsupported-request denial, Promise Date denial, unknown counts, and Chromium/WebKit at 1440/1024/768/390px. Existing Phase 2 ten-category business tests remain in place.
