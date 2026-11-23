# Reception inspection checks — persistence contract (staged, not deployed)

## Why a storage change is necessary
The deployed Reception phase-1 command explicitly rejects unknown `details` keys. The present stored `warnings` field contains free text, not a confirmed OK/Issue status. Absence of notes cannot be interpreted as OK. The printable accessory tick marks are presence-only, not condition assessments.

## Proposed recorded data
Add one optional `inspection_checks` JSON object to `workshop_receptions.details`, with only these category/item keys and allowed states `OK`, `ISSUE`, `NA`:
- exterior: body_panels, glass, lamps, tyres
- interior: seats, dashboard, floor_mats, accessories
- function: dashboard_warning, lights, horn, wipers

An omitted item means **Not assessed**. Never auto-select OK or Issue based on free text or presence/absence of an accessory. Keep the existing `damage`, `other_accessories`, `warnings`, and `tools` values and meanings unchanged.

## Delivery safeguards
1. Introduce a reversible, production-reviewed migration that validates only recognized items/states, checks payload size, and preserves other JSON data.
2. Apply matching validation to both Phase-1 and Phase-2 command implementations, including direct Job Card and linked checklist paths. No client may send the key until the backend capability is deployed and confirmed.
3. Implement radio-group selections with a clear option for **Not assessed** in the editor; render saved values read-only and on the one-page PDF, without making unassessed values look checked.
4. Preserve selections on Manager correction, linked Job Card creation, reopen, and retry; never overwrite with defaults.
5. Test create/edit/fetch/print and privilege denials in disposable PostgreSQL; browser/mobile regression; ensure one A4 page and no truncation.
6. Publish backend then compatible client under an owner-approved release; do not touch `main`.

No SQL migration, production data, or user-facing checkboxes are changed by this document.
