import {appLocale, loc} from './i18n.js';
// Pure helpers for the «Каналы» panel; covered by tests/channels-format.mjs.
export const CHANNELS = {
  telegram: {
    name: 'Telegram',
    secret: loc('Токен бота'),
    secretHint: loc('Создайте бота у @BotFather → /newbot и вставьте токен.'),
    allowed: loc('ID пользователей Telegram'),
    allowedHint: loc('Напишите боту /start — он ответит вашим числовым ID, если его ещё нет в списке.'),
    steps: [
      loc('@BotFather → /newbot → скопируйте токен.'),
      loc('Вставьте токен, выберите проект и нажмите «Проверить».'),
      loc('Напишите боту /start, добавьте присланный ID и включите канал.'),
    ],
  },
  discord: {
    name: 'Discord',
    secret: loc('Токен бота'),
    secretHint: 'Discord Developer Portal → Applications → Bot → Reset Token.',
    allowed: loc('ID пользователей Discord'),
    allowedHint: loc('Настройки → Расширенные → Режим разработчика, затем ПКМ по себе → «Копировать ID».'),
    channel: loc('ID канала'),
    channelHint: loc('ПКМ по каналу → «Копировать ID канала».'),
    steps: [
      loc('Developer Portal → New Application → Bot: включите Message Content Intent.'),
      loc(
        'OAuth2 → URL Generator: scope bot, права View Channel, Send Messages, Read Message History → пригласите бота.'
      ),
      loc('Вставьте токен, ID канала и свой ID пользователя.'),
    ],
  },
  slack: {
    name: 'Slack',
    secret: 'Bot User OAuth Token (xoxb-…)',
    secretHint: 'api.slack.com/apps → OAuth & Permissions.',
    allowed: loc('ID пользователей Slack (U…)'),
    allowedHint: loc('Профиль → ⋯ → «Скопировать ID участника».'),
    channel: loc('ID канала (C…)'),
    channelHint: loc('Сведения о канале → внизу «ID канала».'),
    steps: [
      'api.slack.com/apps → Create App → Bot Token Scopes: channels:history, groups:history, chat:write.',
      loc('Install to Workspace, скопируйте xoxb-токен.'),
      loc('В канале: /invite @бот. Укажите ID канала и свой ID участника.'),
    ],
  },
  email: {
    name: 'Email',
    secret: loc('Пароль приложения'),
    secretHint: loc(
      'Для Gmail, iCloud и Яндекса создайте отдельный пароль приложения; основной пароль не нужен.'
    ),
    allowed: loc('Адреса, от которых принимать задачи'),
    allowedHint: loc(
      'Письма проверяются по подписи DKIM/DMARC, чтобы чужой отправитель не мог подделать адрес.'
    ),
    steps: [
      loc('Включите IMAP в почте и создайте пароль приложения.'),
      loc('Укажите серверы IMAP/SMTP, логин и пароль.'),
      loc(
        'Отправляйте задачу письмом на этот ящик: тема и текст станут задачей, ответ придёт ответным письмом.'
      ),
    ],
  },
  github: {
    name: 'GitHub Issues',
    secret: loc('Токен GitHub'),
    secretHint: loc(
      'github.com/settings/personal-access-tokens → Fine-grained: доступ к репозиторию, Issues — Read and write.'
    ),
    allowed: loc('Логины GitHub, чьи задачи принимать'),
    allowedHint: loc('Только эти авторы могут ставить задачи и давать команды в комментариях.'),
    repo: true,
    steps: [
      loc('Создайте fine-grained токен с доступом Issues: Read and write к нужному репозиторию.'),
      loc('Укажите репозиторий owner/name и метку (по умолчанию nexus).'),
      loc(
        'Новое issue с этой меткой станет задачей; ответ и статус придут комментарием. Команды (/status, /allow КОД) — комментариями в том же issue.'
      ),
    ],
  },
  linear: {
    name: 'Linear',
    secret: loc('Персональный API-ключ'),
    secretHint: 'Linear → Settings → Security & access → Personal API keys.',
    allowed: loc('Email авторов в Linear'),
    allowedHint: loc('Задачи и комментарии других участников игнорируются.'),
    label: true,
    steps: [
      loc('Создайте персональный API-ключ Linear.'),
      loc('Укажите метку (по умолчанию nexus) и email авторов.'),
      loc(
        'Issue с меткой станет задачей; ответ придёт комментарием, команды — комментариями в том же issue.'
      ),
    ],
  },
  imessage: {
    name: 'iMessage',
    secret: '',
    allowed: loc('Телефоны или Apple ID отправителей'),
    allowedHint: loc('Телефон в международном формате: +79991234567.'),
    // Steps can carry buttons: open an app / a System Settings pane, focus a field or switch a toggle.
    steps: [
      {
        text: loc('Войдите в «Сообщения» на этом Mac.'),
        actions: [{label: loc('Открыть «Сообщения»'), open: 'messages'}],
      },
      {
        text: loc(
          'Разрешите NEXUS «Полный доступ к диску» (чтение входящих) и «Автоматизация → Сообщения» (ответы). Пункт «Автоматизация» появится после первой попытки ответа — тогда разрешите его.'
        ),
        actions: [
          {label: loc('Полный доступ к диску'), open: 'full-disk'},
          {label: loc('Автоматизация'), open: 'automation'},
        ],
      },
      {
        text: loc(
          'Добавьте номер или Apple ID, с которого будете писать. Для переписки с самим собой включите «Чат с собой».'
        ),
        actions: [
          {label: loc('Добавить номер'), focus: 'channel-allowed'},
          {label: loc('Включить «Чат с собой»'), toggle: 'selfChat'},
        ],
      },
    ],
  },
};
// A step is either plain text or {text, actions}.
export function stepParts(step) {
  return typeof step === 'string'
    ? {text: step, actions: []}
    : {text: step?.text || '', actions: step?.actions || []};
}
export const ORDER = ['telegram', 'discord', 'slack', 'email', 'imessage', 'github', 'linear'];
export const EXTRA = {
  api: {
    name: loc('Siri и «Команды»'),
    steps: [
      loc('Включите API и выберите проект. Токен создаётся автоматически.'),
      loc(
        'В приложении «Команды»: «Продиктовать текст» → «Получить содержимое URL» (POST, JSON {"text": текст, "wait": 50}, заголовок Authorization: Bearer токен) → «Получить значение по ключу text» → «Произнести текст».'
      ),
      loc('Назовите команду, например «Задача для Nexus», и вызывайте её через Siri.'),
    ],
  },
  push: {
    name: loc('Уведомления'),
    steps: [
      loc('Установите приложение ntfy на телефон (App Store / Google Play) или откройте ntfy.sh в браузере.'),
      loc('Подпишитесь на тему, показанную ниже. Тема — секрет: кто её знает, видит уведомления.'),
      loc('Нажмите «Отправить тест».'),
    ],
  },
};
export const STATE_LABEL = {
  running: loc('Принимает задачи'),
  starting: loc('Запуск…'),
  error: loc('Ошибка'),
  off: loc('Выключен'),
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
      : [loc('Сервер уведомлений: адрес https://…')];
  if (!config.projectId) p.push(loc('Выберите проект для задач'));
  if (kind === 'api') return p;
  if (!parseAllowed(allowedText(config.allowed)).length)
    p.push(loc('Добавьте хотя бы одного разрешённого отправителя'));
  if (CHANNELS[kind]?.secret && !hasSecret && !String(secret || '').trim())
    p.push(loc('Укажите: {0}', CHANNELS[kind].secret.toLowerCase()));
  if (kind === 'discord' && !/^\d+$/.test(config.channelId || '')) p.push(loc('ID канала Discord — число'));
  if (kind === 'slack' && !/^[A-Z0-9]+$/.test(config.channelId || ''))
    p.push(loc('ID канала Slack вида C0123ABC'));
  if (kind === 'github' && !/^[\w.-]+\/[\w.-]+$/.test(config.repo || ''))
    p.push(loc('Репозиторий в формате owner/name'));
  if (kind === 'email' && (!config.imapHost || !config.smtpHost)) p.push(loc('Укажите серверы IMAP и SMTP'));
  return p;
}
const DIRECTION = {in: '←', out: '→', blocked: '⛔', error: '!', info: '·'};
export function shortcutBody(wait = 50) {
  return JSON.stringify({text: loc('<продиктованный текст>'), wait});
}
export function curlExample(url, token) {
  return `curl -s -X POST ${url}/v1/message -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d '{"text":"/status"}'`;
}
export function eventLine(e, now = Date.now()) {
  const s = Math.max(0, Math.round(now / 1000 - e.at));
  const ago =
    s < 60
      ? loc('только что')
      : s < 3600
        ? loc('{0} мин назад', Math.floor(s / 60))
        : new Date(e.at * 1000).toLocaleTimeString(appLocale(), {hour: '2-digit', minute: '2-digit'});
  return `${DIRECTION[e.direction] || '·'} ${CHANNELS[e.kind]?.name || EXTRA[e.kind]?.name || e.kind} · ${ago} · ${e.summary}`;
}
