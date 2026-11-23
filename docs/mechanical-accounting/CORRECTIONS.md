# Audited Mechanical corrections — owner confirmed 26 October 2026

The owner permits Manager JC-number correction after MC registration and Jibin's own signature correction, retaining audit history. Mechanical/bodyshop cards remain separate. These decisions supersede the temporary correction-policy questions and mixed-QC proposals in earlier checkpoints.

## Job-card numbers

Use the existing Manager Full Edit number-correction flow, including reason, explicit number confirmation, current number and edit/workshop revision checks, alias uniqueness and append-only number audit. It changes the public number directory rather than renaming stored work identities. Mechanical checklist/task/link/session records and recorded hours therefore stay attached without rebinding or rewriting history. The Mechanical manual-JC field now participates in the same server number codec; MC001 identity is never treated as a JC alias. Ordinary stored-key mutation remains blocked.

Actual SQL tests register Mechanical work, run the existing Manager transition and numbered edit RPC, then compare every assignment/session/link/checklist row unchanged, verify the new displayed number, resolve the corrected manual-JC number back to its stored identity, and verify one number audit entry. Existing Manager/supervisor/duplicate/stale checks remain in the shared number suite.

## Optional own-signature corrections

Only current SUP003 with existing OWN_SIGNATURE, document permission and enabled signature gates may correct the currently reviewed signature. A reason is required. The request binds current source hash, signature ID, checklist, device, both revisions and current session; clients cannot choose the actor. An append-only correction event retains its original signature reference. Original strokes are never changed or deleted.

Correction advances the Mechanical control revision without changing workshop state, hours, costs, QC or delivery. This invalidates prepared old signed copies under the existing conservative global-revision document rule. The UI then asks Jibin to close/refresh and explicitly redraw/sign the corrected copy. Signature remains optional; no new signature or consent is synthesized. Historical correction acknowledgement is not approval to export a stale signed copy.

The separate migration20261026122619_mechanical_signature_corrections.sql was generated with official checksum-verified Supabase CLI2.81.3. It adds one private RLS/append-only table and invoker RPCs, with no business/account backfill or activation change. Previously applied QA foundation SQL is not edited. Public/anon/authenticated execution and table access remain revoked; service_role gets no UPDATE/DELETE/TRUNCATE grant.

Actual route/SQL tests cover reason and role rejection, original-ink preservation, rollback, changed UUID content, one correction per signature, exact retry, current-revision invalidation, fresh redraw, revoked sessions and private ACLs. Native qualification additionally serializes competing exact retries. UI tests cover explicit reason, retry identity, offline/account/close guards and fresh-redraw notice; browser qualification covers320/375/768/1280 layouts. Physical acceptance is recorded separately. No production correction account or schema is created by these tests.
