// Helpers for tests that inspect source text. Anchors are matched ignoring whitespace,
// so reformatting the code (Prettier, manual line breaks) does not break the tests.
const escape = c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const looseRegExp = (text, flags = '') =>
  new RegExp([...text.replace(/\s+/g, '')].map(escape).join('\\s*'), flags);
export function indexOfLoose(source, anchor) {
  const m = looseRegExp(anchor).exec(source);
  if (!m) throw new Error('Anchor not found in source: ' + anchor);
  return m.index;
}
export const sliceBetween = (source, start, end) =>
  source.slice(indexOfLoose(source, start), indexOfLoose(source, end));
