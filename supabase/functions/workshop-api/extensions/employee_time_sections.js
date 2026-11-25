const timeSections = new Set(['sessions', 'assign', 'jobs', 'employeeTimeActionAudit', 'lastActions']);

export function employeeTimeSections(previous, next) {
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object' ||
      Array.isArray(previous) || Array.isArray(next)) return null;

  const sections = {};
  for (const name of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (previous[name] === next[name] || JSON.stringify(previous[name]) === JSON.stringify(next[name])) continue;
    if (!timeSections.has(name) || !Object.hasOwn(next, name)) return null;
    sections[name] = next[name];
  }
  return sections;
}
