export function sharedWorkshopSections(previous, next) {
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object' ||
      Array.isArray(previous) || Array.isArray(next)) return null;

  const sections = Object.fromEntries(Object.entries(next).filter(([name, value]) =>
    !Object.hasOwn(previous, name) || (previous[name] !== value && JSON.stringify(previous[name]) !== JSON.stringify(value))
  ));
  const removed = Object.keys(previous).filter(name => !Object.hasOwn(next, name));
  return {p_sections:sections,p_removed:removed};
}
