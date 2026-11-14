// Chat search for the sidebar filter and the ⌘K quick switcher.
// Pure functions: no DOM, no Tauri. Matching is case- and ё/е-insensitive.

export const normalizeSearch = value => String(value ?? '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/\s+/g, ' ')
  .trim();

// Folder chain from the root of the project down to folderId.
export function folderPath(folders, folderId) {
  const path = [];
  const seen = new Set();
  let current = folders.find(f => f.id === folderId);
  while (current && !seen.has(current.id) && path.length < 17) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? folders.find(f => f.id === current.parentId) : null;
  }
  return path;
}

// Character ranges of every term inside text, merged and sorted. Used for highlighting.
export function matchRanges(text, query) {
  const source = String(text ?? '').toLowerCase().replace(/ё/g, 'е');
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  const ranges = [];
  for (const term of terms) {
    let from = 0;
    while (from <= source.length) {
      const at = source.indexOf(term, from);
      if (at < 0) break;
      ranges.push([at, at + term.length]);
      from = at + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

// Split text into [{text, match}] parts for rendering highlighted results.
export function highlightParts(text, query) {
  const value = String(text ?? '');
  const parts = [];
  let cursor = 0;
  for (const [start, end] of matchRanges(value, query)) {
    if (start > cursor) parts.push({ text: value.slice(cursor, start), match: false });
    parts.push({ text: value.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), match: false });
  return parts.length ? parts : [{ text: value, match: false }];
}

// Ranked results. Every term must match the title or the path (project / folders / parent chat).
// Title matches rank above path-only matches; a title that starts with the query ranks first.
export function searchChats(query, { chats = [], folders = [], projects = [] } = {}, limit = 50) {
  const needle = normalizeSearch(query);
  const terms = needle.split(' ').filter(Boolean);
  const results = [];
  for (const chat of chats) {
    if (chat.archived || chat.deletedAt) continue;
    const project = projects.find(p => p.id === chat.projectId);
    const parent = chat.parentChatId ? chats.find(c => c.id === chat.parentChatId) : null;
    const path = [project?.name || 'Проект', ...folderPath(folders.filter(f => f.projectId === chat.projectId), chat.folderId), ...(parent ? [parent.title] : [])];
    const title = normalizeSearch(chat.title);
    const haystack = normalizeSearch(path.join(' ')) + ' ' + title;
    if (terms.length && !terms.every(term => haystack.includes(term))) continue;
    let score = 0;
    if (!terms.length) score = 1;
    else {
      if (title.startsWith(needle)) score += 100;
      else if (title.includes(needle)) score += 60;
      score += terms.filter(term => title.includes(term)).length * 10;
    }
    results.push({ chat, project, path, score });
  }
  results.sort((a, b) => b.score - a.score || String(b.chat.updatedAt || '').localeCompare(String(a.chat.updatedAt || '')) || a.chat.title.localeCompare(b.chat.title, 'ru'));
  return results.slice(0, limit);
}
