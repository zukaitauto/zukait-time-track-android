# Manager Purchase Cost — Parts + Sublet

The Workshop Performance purchase card previously depended on an already hydrated local Parts event projection, whereas Sublet was present in workshop state. A fresh Manager login could therefore show a Sublet-only total until another Parts page was opened.

The visible Manager render now loads the existing authoritative Parts report. The card shows Syncing while the request runs, then recomputes the existing combined total. Concurrent renders share the read; unchanged server revision does not refetch; changed revisions/retries are throttled to at most one attempt per minute on renders, without a new timer. Offline operation retains the existing local calculation. A failed server read is labelled Cached. No business records, amounts, permissions or database schema change.

The existing Parts report loader rejects responses after the account or token changes before hydrating local storage. Existing Today/Month filters, Oman purchase dates, quantity calculation, returned-part treatment and separate Parts/Sublet detail footers remain unchanged.

Local verification: manager-single-purchase-card.mjs (including fresh-login hydration, concurrent-render deduplication, revision throttle and account-switch response rejection), spare-parts-expense-filters.mjs, v181-manager-performance-cost-drilldown.mjs, and syntax checks passed. The old static test expecting the superseded Purchase Expenses label was updated to Purchase Cost; combined arithmetic tests remain active.

Owner explicitly authorized the fix and a coordinated new release in chat. This supersedes the earlier requirement for a separate publication instruction, but does not attest to unperformed physical/operational checks. V376 has not been published at preparation time; current public version remains V375. Final exact-source CI, signed artifact and existing acceptance evidence must be reconciled before dispatching the unchanged publisher. No main changes.
