export function mergeLatestMessages(current, latest) {
  const ids = new Set(latest.map(m => m.id));
  return [...current.filter(m => !m.id.startsWith('pending-') && !ids.has(m.id)), ...latest];
}
export function prependMessages(current, older) {
  const ids = new Set(current.map(m => m.id));
  return [...older.filter(m => !ids.has(m.id)), ...current];
}
