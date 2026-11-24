async function requestUuid(values) {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(JSON.stringify(values)),
  )).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
          hex.slice(16, 20), hex.slice(20)].join("-");
}

// Invoke after the existing job-card route has authenticated the session and
// checked its role. A null result keeps an unsupported edit on the old path.
export async function saveWorkshopJobNotes({ admin, user, body, transition }) {
  if (body.operation !== "EDIT" || !body.patch || typeof body.patch !== "object" ||
      Array.isArray(body.patch) || !Object.keys(body.patch).length ||
      typeof body.jobCard !== "string") return null;

  const editRevision = Number(body.expectedEditRevision);
  if (!Number.isSafeInteger(editRevision) || editRevision < 0) return null;
  const reason = String(body.reason || "").trim();
  const patch = Object.entries(body.patch).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]);
  // Preserve the request identity for notes already saved by the pilot.
  const notesOnly = patch.length === 1 && patch[0][0] === "notes" &&
    typeof patch[0][1] === "string";
  const requestId = await requestUuid([
    notesOnly ? "workshop-job-notes" : "workshop-job-fields",
    user.id, body.jobCard, editRevision, notesOnly ? patch[0][1] : patch, reason,
  ]);
  const { data: context, error: readError } = await admin.rpc("zukait_workshop_job_notes_context", {
    p_request_id: requestId, p_actor_id: user.id, p_job_no: body.jobCard,
  });
  if (readError) throw readError;
  const job = context.before_job ?? context.job;
  if (!job || job.directReceptionJob || job.delivered) return null;

  const result = transition({ jobs: [job] }, user, body, Date.now());
  if (!result.ok) return result;
  const { data: saved, error: saveError } = await admin.rpc("zukait_commit_workshop_job_fields", {
    p_request_id: requestId,
    p_job_no: body.jobCard,
    p_expected_edit_revision: editRevision,
    p_actor_id: user.id,
    p_next_job: result.job,
    p_reason: reason,
    p_audit_entry: result.data.jobEdits[0],
    p_expected_job: job,
  });
  if (saveError) throw saveError;
  return saved;
}
