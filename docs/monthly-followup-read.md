# Scoped monthly follow-up reads

The recurring alert was emitted by cash_monthly_pulse.js confirmRead, which called the full load endpoint for each Cash or Insurance list. Production recorded 24–26 second reads ending in HTTP520 after the V355 observation window. V355 retry protection did not remove this read amplification.

monthly_followup is restricted server-side to Manager/Supervisor. It selects only revision and data->jobs, then whitelists the fields needed by existing monthly calculations, vehicle rows and LPO documents. It retains null, recorded zero, dates, status and insurance LPO amount/receivedDate exactly. Sessions, materials, arbitrary customer details and audit histories are omitted. No tables or grants change.

readMonthlyFollowup deduplicates in-flight reads, participates in the transport cooldown and keeps partial responses separate from the full-state merge baseline. Cash/Insurance list views use this confirmed snapshot without overwriting queued changes. Old servers use the existing full read only on unknown_action; a failed/timed-out scoped read never triggers a wide fallback or displays cached data as freshly confirmed.

Current deployed production82 includes Sublet changes. The QA18 bundle preserves every production82 dependency and adds only this endpoint. Do not deploy a stale production81 bundle. Preserve the complete82 readback for rollback. Automated tests execute the endpoint, real read helper and monthly lists; live smoke and exact-source release checks remain mandatory before publication. No production fixture writes or history deletion.
