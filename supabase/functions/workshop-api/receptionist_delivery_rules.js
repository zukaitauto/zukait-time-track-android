import {qcStatus, qcTransition} from './qc_delivery_rules.js';
const key = value => String(value ?? '').trim().toUpperCase();
const vehicleIdentity = job => JSON.stringify([job.receptionNo || '', job.vehicle || '', job.reg || '', job.year || job.modelYear || '', job.vin || job.chassis || '']);
export function receptionistDeliveryRow(data, job) {
  return {jobCard: job.no, receptionNo: job.receptionNo, vehicle: job.vehicle || '',
    registration: job.reg || '', delivered: job.delivered === true,
    deliveredAt: job.deliveredAt || null, stage: qcStatus(data, job).stage,
    deliveryReady: qcStatus(data, job).deliveryReady,
    expectedQcRevision: Number(job.qcWorkflow?.revision || 0), expectedVehicleIdentity:vehicleIdentity(job)};
}
export function receptionistDeliveryList(data) {
  return (data.jobs || []).filter(j => j?.receptionNo && key(j.no) !== 'ID001' &&
    !j.deleted && !j.archived && !j.cancelled && key(j.status) !== 'CANCELLED')
    .map(j => receptionistDeliveryRow(data, j));
}
export function receptionistDeliveryTransition(data, user, body, now) {
  const fail = code => ({ok:false, code});
  if (user?.role !== 'Receptionist') return fail('receptionist_forbidden');
  if (body?.action !== 'receptionist_deliver' || body?.operation !== 'DELIVER' || Object.keys(body).some(k =>
    !['action','operation','jobCard','expectedQcRevision','expectedVehicleIdentity','request_id'].includes(k))) return fail('receptionist_invalid_delivery');
  if (typeof body.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id)) return fail('receptionist_request_required');
  if (!Number.isSafeInteger(body.expectedQcRevision) || body.expectedQcRevision < 0 ||
    typeof body.jobCard !== 'string' || !key(body.jobCard) || typeof body.expectedVehicleIdentity !== 'string' || body.expectedVehicleIdentity.length>10000) return fail('receptionist_invalid_delivery');
  const requestId = body.request_id.toLowerCase();
  const request = JSON.stringify(['DELIVER', key(body.jobCard), body.expectedQcRevision, body.expectedVehicleIdentity]);
  for (const job of data.jobs || []) {
    const audit = (job.qcWorkflow?.history || []).find(a => a.request_id === requestId);
    if (!audit) continue;
    if (audit.by !== user.id || audit.request !== request || key(job.no) !== key(body.jobCard)) return fail('receptionist_request_conflict');
    if (!job.delivered) return fail('receptionist_delivery_reconcile');
    return {ok:true, duplicate:true, job};
  }
  const job = (data.jobs || []).find(j => key(j?.no) === key(body.jobCard));
  if (!job?.receptionNo) return fail('job_not_available');
  if (body.expectedVehicleIdentity !== vehicleIdentity(job)) return fail('receptionist_vehicle_changed');
  const result = qcTransition(data, user, body, now);
  if (!result.ok) return result;
  const audit = result.job.qcWorkflow.history.at(-1);
  Object.assign(audit, {request_id:requestId, request});
  result.job.deliveryAudit = [...(result.job.deliveryAudit || []), {...audit}];
  return result;
}
