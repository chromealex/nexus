// Keyboard shortcuts shared by the app shell and the hints shown next to controls.
// NEXUS is a macOS app; the browser UI preview on other systems uses Ctrl instead of ⌘.
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

export const SHORTCUTS = {
  newChat: { key: 'n', label: 'Новый чат' },
  search: { key: 'k', label: 'Поиск и переход к чату' },
  connections: { key: ',', label: 'Агенты и подключения' },
  model: { key: '/', label: 'Выбор модели' },
  previous: { key: '[', label: 'Предыдущий чат' },
  next: { key: ']', label: 'Следующий чат' },
  sidebar: { key: '\\', label: 'Показать или скрыть проекты' },
  find: { key: 'f', label: 'Найти в чате' },
};

export const shortcutText = name => {
  const key = SHORTCUTS[name]?.key;
  if (!key) return '';
  const shown = key.length === 1 ? key.toUpperCase() : key;
  return IS_MAC ? '⌘' + shown : 'Ctrl+' + shown;
};

export const withShortcut = (text, name) => `${text} (${shortcutText(name)})`;

// Returns the shortcut name for a keydown event, or null. Ignores IME composition and Alt/Shift chords.
export function shortcutFor(event, mac = IS_MAC) {
  if (!event || event.isComposing || event.altKey || event.shiftKey) return null;
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!mod) return null;
  const key = String(event.key || '').toLowerCase();
  // Layout-independent fallback for Cyrillic keyboards: use the physical key code.
  const code = String(event.code || '');
  const byCode = { KeyN: 'n', KeyK: 'k', Comma: ',', Slash: '/', BracketLeft: '[', BracketRight: ']', Backslash: '\\', KeyF: 'f' }[code];
  for (const [name, item] of Object.entries(SHORTCUTS)) if (item.key === key || item.key === byCode) return name;
  return null;
}
