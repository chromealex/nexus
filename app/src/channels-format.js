// Pure helpers for the «Каналы» panel; covered by tests/channels-format.mjs.
export const CHANNELS = {
  telegram: {
    name: 'Telegram',
    secret: 'Токен бота',
    secretHint: 'Создайте бота у @BotFather → /newbot и вставьте токен.',
    allowed: 'ID пользователей Telegram',
    allowedHint: 'Напишите боту /start — он ответит вашим числовым ID, если его ещё нет в списке.',
    steps: [
      '@BotFather → /newbot → скопируйте токен.',
      'Вставьте токен, выберите проект и нажмите «Проверить».',
      'Напишите боту /start, добавьте присланный ID и включите канал.',
    ],
  },
  discord: {
    name: 'Discord',
    secret: 'Токен бота',
    secretHint: 'Discord Developer Portal → Applications → Bot → Reset Token.',
    allowed: 'ID пользователей Discord',
    allowedHint: 'Настройки → Расширенные → Режим разработчика, затем ПКМ по себе → «Копировать ID».',
    channel: 'ID канала',
    channelHint: 'ПКМ по каналу → «Копировать ID канала».',
    steps: [
      'Developer Portal → New Application → Bot: включите Message Content Intent.',
      'OAuth2 → URL Generator: scope bot, права View Channel, Send Messages, Read Message History → пригласите бота.',
      'Вставьте токен, ID канала и свой ID пользователя.',
    ],
  },
  slack: {
    name: 'Slack',
    secret: 'Bot User OAuth Token (xoxb-…)',
    secretHint: 'api.slack.com/apps → OAuth & Permissions.',
    allowed: 'ID пользователей Slack (U…)',
    allowedHint: 'Профиль → ⋯ → «Скопировать ID участника».',
    channel: 'ID канала (C…)',
    channelHint: 'Сведения о канале → внизу «ID канала».',
    steps: [
      'api.slack.com/apps → Create App → Bot Token Scopes: channels:history, groups:history, chat:write.',
      'Install to Workspace, скопируйте xoxb-токен.',
      'В канале: /invite @бот. Укажите ID канала и свой ID участника.',
    ],
  },
  email: {
    name: 'Email',
    secret: 'Пароль приложения',
    secretHint: 'Для Gmail, iCloud и Яндекса создайте отдельный пароль приложения; основной пароль не нужен.',
    allowed: 'Адреса, от которых принимать задачи',
    allowedHint: 'Письма проверяются по подписи DKIM/DMARC, чтобы чужой отправитель не мог подделать адрес.',
    steps: [
      'Включите IMAP в почте и создайте пароль приложения.',
      'Укажите серверы IMAP/SMTP, логин и пароль.',
      'Отправляйте задачу письмом на этот ящик: тема и текст станут задачей, ответ придёт ответным письмом.',
    ],
  },
  github: {
    name: 'GitHub Issues',
    secret: 'Токен GitHub',
    secretHint:
      'github.com/settings/personal-access-tokens → Fine-grained: доступ к репозиторию, Issues — Read and write.',
    allowed: 'Логины GitHub, чьи задачи принимать',
    allowedHint: 'Только эти авторы могут ставить задачи и давать команды в комментариях.',
    repo: true,
    steps: [
      'Создайте fine-grained токен с доступом Issues: Read and write к нужному репозиторию.',
      'Укажите репозиторий owner/name и метку (по умолчанию nexus).',
      'Новое issue с этой меткой станет задачей; ответ и статус придут комментарием. Команды (/status, /allow КОД) — комментариями в том же issue.',
    ],
  },
  linear: {
    name: 'Linear',
    secret: 'Персональный API-ключ',
    secretHint: 'Linear → Settings → Security & access → Personal API keys.',
    allowed: 'Email авторов в Linear',
    allowedHint: 'Задачи и комментарии других участников игнорируются.',
    label: true,
    steps: [
      'Создайте персональный API-ключ Linear.',
      'Укажите метку (по умолчанию nexus) и email авторов.',
      'Issue с меткой станет задачей; ответ придёт комментарием, команды — комментариями в том же issue.',
    ],
  },
  imessage: {
    name: 'iMessage',
    secret: '',
    allowed: 'Телефоны или Apple ID отправителей',
    allowedHint: 'Телефон в международном формате: +79991234567.',
    steps: [
      'Войдите в «Сообщения» на этом Mac.',
      'Разрешите NEXUS «Полный доступ к диску» (чтение входящих) и «Автоматизация → Сообщения» (ответы).',
      'Добавьте номер или Apple ID, с которого будете писать. Для переписки с самим собой включите «Чат с собой».',
    ],
  },
};
export const ORDER = ['telegram', 'discord', 'slack', 'email', 'imessage', 'github', 'linear'];
export const EXTRA = {
  api: {
    name: 'Siri и «Команды»',
    steps: [
      'Включите API и выберите проект. Токен создаётся автоматически.',
      'В приложении «Команды»: «Продиктовать текст» → «Получить содержимое URL» (POST, JSON {"text": текст, "wait": 50}, заголовок Authorization: Bearer токен) → «Получить значение по ключу text» → «Произнести текст».',
      'Назовите команду, например «Задача для Nexus», и вызывайте её через Siri.',
    ],
  },
  push: {
    name: 'Уведомления',
    steps: [
      'Установите приложение ntfy на телефон (App Store / Google Play) или откройте ntfy.sh в браузере.',
      'Подпишитесь на тему, показанную ниже. Тема — секрет: кто её знает, видит уведомления.',
      'Нажмите «Отправить тест».',
    ],
  },
};
export const STATE_LABEL = {
  running: 'Принимает задачи',
  starting: 'Запуск…',
  error: 'Ошибка',
  off: 'Выключен',
};
export function stateLabel(view) {
  if (!view) return '';
  if (!view.config.enabled) return STATE_LABEL.off;
  return STATE_LABEL[view.status?.state] || STATE_LABEL.starting;
}
/** Parses the allowlist textarea: one value per line or comma; trims, drops empties and duplicates. */
export function parseAllowed(text) {
  const seen = new Set();
  return String(text || '')
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(s => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}
export function allowedText(list) {
  return (list || []).join('\n');
}
/** Client-side checks that mirror the backend so the form can explain problems before saving. */
export function formProblems(kind, config, {hasSecret, secret} = {}) {
  const p = [];
  if (!config.enabled) return p;
  if (kind === 'push')
    return /^https:\/\/[^\s/?#@]+/.test(config.pushServer || 'https://ntfy.sh')
      ? p
      : ['Сервер уведомлений: адрес https://…'];
  if (!config.projectId) p.push('Выберите проект для задач');
  if (kind === 'api') return p;
  if (!parseAllowed(allowedText(config.allowed)).length)
    p.push('Добавьте хотя бы одного разрешённого отправителя');
  if (CHANNELS[kind]?.secret && !hasSecret && !String(secret || '').trim())
    p.push(`Укажите: ${CHANNELS[kind].secret.toLowerCase()}`);
  if (kind === 'discord' && !/^\d+$/.test(config.channelId || '')) p.push('ID канала Discord — число');
  if (kind === 'slack' && !/^[A-Z0-9]+$/.test(config.channelId || ''))
    p.push('ID канала Slack вида C0123ABC');
  if (kind === 'github' && !/^[\w.-]+\/[\w.-]+$/.test(config.repo || ''))
    p.push('Репозиторий в формате owner/name');
  if (kind === 'email' && (!config.imapHost || !config.smtpHost)) p.push('Укажите серверы IMAP и SMTP');
  return p;
}
const DIRECTION = {in: '←', out: '→', blocked: '⛔', error: '!', info: '·'};
export function shortcutBody(wait = 50) {
  return JSON.stringify({text: '<продиктованный текст>', wait});
}
export function curlExample(url, token) {
  return `curl -s -X POST ${url}/v1/message -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '{"text":"/status"}'`;
}
export function eventLine(e, now = Date.now()) {
  const s = Math.max(0, Math.round(now / 1000 - e.at));
  const ago =
    s < 60
      ? 'только что'
      : s < 3600
        ? `${Math.floor(s / 60)} мин назад`
        : new Date(e.at * 1000).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
  return `${DIRECTION[e.direction] || '·'} ${CHANNELS[e.kind]?.name || EXTRA[e.kind]?.name || e.kind} · ${ago} · ${e.summary}`;
}
