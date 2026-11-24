// Test candidate. Persistence must apply the decision while holding the write lock.
function sessionFor(state, actorId, command) {
  const matches = (state.sessions || []).filter(row =>
    row && String(row.id) === String(command.session_id));
  if (matches.length !== 1 || String(matches[0].emp) !== actorId) return null;
  return matches[0];
}

function assignmentsFor(state, actorId, session) {
  return (state.assign || []).filter(row =>
    row && String(row.emp) === actorId && (String(row.job) === String(session.job)
      || String(row.id) === String(session.assignmentId || '')));
}

export function prepareEmployeePause(state, user, command) {
  if (user?.role !== 'Employee' || String(command?.event_type || '').toUpperCase() !== 'PAUSE'
    || !String(command.session_id || '').trim() || !String(command.action_id || '').trim()) {
    return null;
  }
  const actorId = String(user.id);
  const session = sessionFor(state, actorId, command);
  if (!session) return null;
  return structuredClone({
    actorId, actionId: command.action_id, sessionId: command.session_id, session,
    assignments: assignmentsFor(state, actorId, session),
    lastAction: state.lastActions?.[actorId]
  });
}

export function decideEmployeePause({current, basis, user, command, now, same, transition}) {
  if (!basis || user?.role !== 'Employee' || String(user.id) !== basis.actorId
    || String(command?.event_type || '').toUpperCase() !== 'PAUSE' || command.action_id !== basis.actionId
    || command.session_id !== basis.sessionId) {
    return {ok: false, code: 'employee_time_forbidden'};
  }
  // Existing receipts must remain replayable even though their session has changed.
  if ((current.employeeTimeActionAudit || []).some(row => String(row?.id || '') === String(basis.actionId).trim())) {
    return transition(current, user, command, now);
  }
  const session = sessionFor(current, basis.actorId, command);
  if (!same(session, basis.session)
    || !same(assignmentsFor(current, basis.actorId, basis.session), basis.assignments)
    || !same(current.lastActions?.[basis.actorId], basis.lastAction)) {
    return {ok: false, code: 'employee_time_conflict'};
  }
  return transition(current, user, command, now);
}
