# Customer Master identity foundation (staged)

- Permanent UUID for each explicitly confirmed customer. Names and mobiles are not unique identity keys.
- Original contact snapshot remains tied to the original visit; linking is explicit and Manager-only for this foundation.
- An existing customer can be selected only by ID. No automatic merging or ownership inference.
- Request replay is idempotent; a second distinct request cannot replace a linked visit. Link stores actor, timestamp and reason.
- No triggers, backfill, live deployment, or client API activation. Reception creation integration, profile search, Manager correction and merge, and the existing physical-vehicle ownership period integration are separate future work.
- The existing ownership period table must not be duplicated or updated until the owner confirmation flow is designed and tested.

QA: isolated transaction on QA, Manager authorization, stale contact rejection, creation, request replay, duplicate-link rejection, unchanged source, and public execute denial. Rolled back; not a full end-to-end or concurrency test.
