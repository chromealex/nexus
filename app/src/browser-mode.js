// Per-chat browser for agents: labels, hints and summaries. Pure, so it is tested without the UI.
export const BROWSER_MODES = {
  off: 'Выключен',
  isolated: 'Отдельный профиль',
  chrome: 'Мой Chrome (со входами)',
};

export function browserSummary(mode) {
  return mode === 'isolated' ? 'Браузер' : mode === 'chrome' ? 'Мой Chrome' : '';
}

// What the user must know or do before the agent can use the browser in this chat.
// Returns {tone:'info'|'warn', text, action?:'install'|'extension'}.
export function browserHint(mode, status = {}) {
  if (mode === 'off')
    return {
      tone: 'info',
      text: 'Агент не управляет браузером. Включите, чтобы он открывал сайты, нажимал и заполнял формы — каждое такое действие вы подтверждаете в чате.',
    };
  if (status.installing) return {tone: 'info', text: 'Устанавливается Playwright MCP…'};
  if (status.node === false)
    return {tone: 'warn', text: 'Нужен Node.js 22+ (nvm или Homebrew), затем перезапустите Nexus.'};
  if (status.chrome === false)
    return {tone: 'warn', text: 'Не найден Google Chrome в «Программах». Установите Chrome.'};
  if (!status.installed)
    return {
      tone: 'warn',
      text:
        `Нужно один раз установить Playwright MCP ${status.version || ''}`.trim() +
        ' (около 20 МБ, без отдельного браузера — используется ваш Chrome).',
      action: 'install',
    };
  if (mode === 'chrome')
    return {
      tone: 'warn',
      text: 'Агент работает в вашем Chrome с вашими входами. Нужно расширение Playwright MCP Bridge; при подключении Chrome попросит выбрать вкладку. Каждое действие подтверждается отдельно, «разрешать всегда» недоступно.',
      action: 'extension',
    };
  return {
    tone: 'info',
    text: 'Отдельный профиль Nexus: без ваших личных входов, вход на сайты в нём сохраняется между чатами. Чтение страницы — без вопросов, действия — с подтверждением.',
  };
}

// Browser permission cards: the human-readable action and whether it touches the user's own Chrome.
export function browserRequest(details = {}) {
  const own = details.mode === 'chrome';
  return {
    summary: details.summary || details.tool || 'Действие в браузере',
    where: own ? 'В вашем Chrome со входами' : 'В отдельном профиле Nexus',
    own,
    host: details.host || '',
  };
}
