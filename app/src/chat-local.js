// Per-chat state kept on this Mac only (localStorage): drafts, bookmarks, chat preferences,
// plus the Markdown export builder. Every function takes the storage explicitly so it can be tested.

const safe = fn => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};
export const draftKey = (chatId, projectId) => 'nexus-draft:' + (chatId || 'project:' + (projectId || ''));

// Draft = text + already uploaded attachments (ids stay valid; files live in Nexus storage).
export function loadDraft(storage, key) {
  const raw = safe(() => storage.getItem(key));
  if (!raw) return {text: '', files: []};
  const value = safe(() => JSON.parse(raw));
  if (!value || typeof value !== 'object') return {text: '', files: []};
  return {
    text: typeof value.text === 'string' ? value.text.slice(0, 12000) : '',
    files: Array.isArray(value.files)
      ? value.files.filter(f => f && typeof f.id === 'string').slice(0, 8)
      : [],
  };
}
export function saveDraft(storage, key, text, files) {
  if (!text && !files?.length) {
    safe(() => storage.removeItem(key));
    return;
  }
  safe(() =>
    storage.setItem(
      key,
      JSON.stringify({
        text: String(text || '').slice(0, 12000),
        files: (files || []).slice(0, 8),
        savedAt: Date.now(),
      })
    )
  );
}

const bookmarkKey = chatId => 'nexus-bookmarks:' + chatId;
export function loadBookmarks(storage, chatId) {
  const value = safe(() => JSON.parse(storage.getItem(bookmarkKey(chatId)) || '[]'));
  return Array.isArray(value) ? value.filter(b => b && typeof b.id === 'string').slice(0, 200) : [];
}
export function toggleBookmark(storage, chatId, message) {
  const list = loadBookmarks(storage, chatId);
  const next = list.some(b => b.id === message.id)
    ? list.filter(b => b.id !== message.id)
    : [...list, {id: message.id, role: message.role, excerpt: excerpt(message.content, 90)}];
  safe(() =>
    next.length
      ? storage.setItem(bookmarkKey(chatId), JSON.stringify(next))
      : storage.removeItem(bookmarkKey(chatId))
  );
  return next;
}

export function excerpt(text, limit = 140) {
  const plain = String(text || '')
    .replace(/```[\s\S]*?```/g, ' [код] ')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > limit ? plain.slice(0, limit - 1).trimEnd() + '…' : plain;
}

// Long user messages (pasted logs, specs) are collapsed in the history.
export const isLongMessage = text => {
  const value = String(text || '');
  return value.length > 1200 || value.split('\n').length > 14;
};

export function chatToMarkdown({title, project, messages, exportedAt = new Date()}) {
  const lines = [
    `# ${title || 'Чат Nexus'}`,
    '',
    `Проект: ${project || '—'} · экспорт ${exportedAt.toLocaleString('ru-RU')}`,
    '',
  ];
  for (const m of messages || []) {
    if (m.role === 'system') continue;
    const who = m.role === 'user' ? 'Вы' : 'Nexus';
    const date =
      m.createdAt && !Number.isNaN(new Date(m.createdAt).getTime())
        ? ' · ' + new Date(m.createdAt).toLocaleString('ru-RU')
        : '';
    lines.push(`## ${who}${date}`, '', String(m.content || '').trim(), '');
    if (m.attachments?.length) lines.push('Файлы: ' + m.attachments.map(f => f.name).join(', '), '');
  }
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

// Prompts behind quick replies. Kept short and explicit so the agent knows what is asked.
export const QUICK_REPLIES = [
  ['Продолжи', 'Продолжи.'],
  ['Короче', 'Сократи предыдущий ответ до главного.'],
  ['Подробнее', 'Объясни подробнее, с примерами.'],
  ['Покажи код', 'Покажи код для этого решения.'],
];

export const clock = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
// Readable stage from backend progress strings (some arrive in English).
export function stageLabel(trace = '') {
  const t = String(trace || '');
  if (/Selecting an available agent/i.test(t)) return 'выбираю агента';
  if (/Checking available accounts/i.test(t)) return 'проверяю аккаунты и лимиты';
  const selected = t.match(/^Selected\s+([^\s/]+)\s*\/\s*([^·]+?)\s*·\s*([^.]+)\.\s*Waiting/i);
  if (selected) return `${selected[1]} · ${selected[2].trim()} · жду ответ`;
  return t.length > 70 ? t.slice(0, 69) + '…' : t;
}
