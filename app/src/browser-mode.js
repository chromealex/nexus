// Chat browser: labels, hints, input mapping and preview rules. Pure, so it is tested without the UI.
export const BROWSER_MODES = {
  builtin: 'Встроенный браузер',
  chrome: 'Мой Chrome (со входами)',
  off: 'Выключен',
};

// Old settings used "isolated" for the built-in browser.
export function normalizeMode(mode) {
  return mode === 'isolated' ? 'builtin' : BROWSER_MODES[mode] ? mode : 'builtin';
}

// Shown on «Параметры» only when it differs from the default built-in browser.
export function browserSummary(mode) {
  mode = normalizeMode(mode);
  return mode === 'chrome' ? 'Мой Chrome' : mode === 'off' ? 'Без браузера' : '';
}

// What the user must know or do before the agent can use the browser in this chat.
// Returns {tone:'info'|'warn', text, action?:'install'|'extension'}.
export function browserHint(mode, status = {}) {
  mode = normalizeMode(mode);
  if (mode === 'off')
    return {
      tone: 'info',
      text: 'Агенты в этом чате не пользуются браузером. Включите встроенный браузер, чтобы они открывали сайты, нажимали и заполняли формы — с вашим подтверждением.',
    };
  if (status.installing) return {tone: 'info', text: 'Устанавливается Playwright…'};
  if (status.node === false)
    return {tone: 'warn', text: 'Нужен Node.js 22+ (nvm или Homebrew), затем перезапустите Nexus.'};
  if (status.chrome === false)
    return {tone: 'warn', text: 'Не найден Google Chrome в «Программах». Установите Chrome.'};
  if (!status.installed)
    return {
      tone: 'warn',
      text:
        `Нужно один раз установить Playwright ${status.version || ''}`.trim() +
        ' (около 20 МБ). Отдельный браузер не скачивается — работает невидимый Chrome.',
      action: 'install',
    };
  if (mode === 'chrome')
    return {
      tone: 'warn',
      text: 'Агент работает в вашем Chrome с вашими входами через расширение Playwright MCP Bridge; при подключении Chrome попросит выбрать вкладку. Каждое действие подтверждается отдельно, «разрешать всегда» недоступно.',
      action: 'extension',
    };
  return {
    tone: 'info',
    text: 'У каждого чата свой браузер: вкладки и входы на сайты сохраняются. Он открыт справа; агенты читают страницы без вопросов, а действия подтверждаются в чате.',
  };
}

// Browser permission cards: the human-readable action and whether it touches the user's own Chrome.
export function browserRequest(details = {}) {
  const own = details.mode === 'chrome';
  return {
    summary: details.summary || details.tool || 'Действие в браузере',
    where: own ? 'В вашем Chrome со входами' : 'Во встроенном браузере этого чата',
    own,
    host: details.host || '',
  };
}

// Pane pixel → page CSS pixel. The screenshot is drawn scaled to the pane width.
export function pageCoords(clientX, clientY, rect, frame) {
  if (!rect?.width || !rect?.height || !frame?.width || !frame?.height) return null;
  const x = ((clientX - rect.left) / rect.width) * frame.width,
    y = ((clientY - rect.top) / rect.height) * frame.height;
  if (x < 0 || y < 0 || x > frame.width || y > frame.height) return null;
  return {x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10};
}

const KEYS = new Set([
  'Enter',
  'Backspace',
  'Tab',
  'Escape',
  'Delete',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);
// Keyboard event in the pane → browser input. Printable characters are inserted as text,
// editing keys and ⌘/Ctrl shortcuts are pressed; everything else stays with Nexus.
export function keyAction(e) {
  if (e.isComposing) return null;
  const mod = e.metaKey ? 'Meta' : e.ctrlKey ? 'Control' : '';
  if (mod) {
    if (/^[a-zA-Z]$/.test(e.key) && 'acxzy'.includes(e.key.toLowerCase()))
      return {type: 'key', key: `${mod}+${e.key.toLowerCase()}`};
    return null;
  }
  if (KEYS.has(e.key)) return {type: 'key', key: (e.shiftKey && e.key === 'Tab' ? 'Shift+' : '') + e.key};
  if (e.key && [...e.key].length === 1) return {type: 'text', text: e.key};
  return null;
}

// The small preview over the chat: while the pane is closed and an agent is (or just was) in the browser.
export function previewVisible({paneOpen, mode, agentBusy, activityAt, now = Date.now(), hasFrame}) {
  if (paneOpen || normalizeMode(mode) !== 'builtin') return false;
  return !!agentBusy || (!!activityAt && now - activityAt < 45000 && !!hasFrame);
}

export function tabTitle(tab) {
  if (!tab) return '';
  if (tab.title) return tab.title;
  if (!tab.url || tab.url === 'about:blank') return 'Новая вкладка';
  try {
    return new URL(tab.url).host || tab.url;
  } catch {
    return tab.url;
  }
}
