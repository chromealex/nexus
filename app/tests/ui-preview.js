// In-memory fixtures only. This page never invokes the Tauri backend or real accounts.
const browserTools = {
    installed: !new URLSearchParams(location.search).has('nobrowser'),
    installedVersion: null,
    version: '0.0.85',
    node: true,
    chrome: true,
    installing: false,
    extensionUrl: '',
  },
  browserModes = {};
const previewGrants = [
  {
    id: 0,
    projectId: 'preview',
    label: 'Codex: любые команды',
    provider: 'codex',
    kind: 'item/commandExecution/requestApproval',
    scope: null,
  },
  {
    id: 1,
    projectId: 'preview',
    label: 'Claude: инструмент Write',
    provider: 'claude',
    kind: 'tool',
    scope: {tool: 'Write'},
  },
  {
    id: 2,
    projectId: 'preview',
    label: 'Браузер чата: открытие страниц docs.example.com',
    provider: 'browser',
    kind: 'browser',
    scope: {tool: 'browser_navigate', host: 'docs.example.com'},
  },
];
const fakeTabs = {
  tabs: [
    {id: 1, url: 'https://docs.example.com/guide', title: 'Руководство — Example Docs'},
    {id: 2, url: 'https://shop.example.com/pricing', title: 'Тарифы и цены'},
  ],
  active: 2,
};
// A drawn stand-in for a web page; the real pane shows Chrome's screencast.
function fakePage() {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 860;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f7f9';
  g.fillRect(0, 0, 1280, 860);
  g.fillStyle = '#1d2a3a';
  g.fillRect(0, 0, 1280, 64);
  g.fillStyle = '#fff';
  g.font = '600 24px sans-serif';
  g.fillText('Example Shop', 32, 41);
  g.fillStyle = '#1d2a3a';
  g.font = '700 44px sans-serif';
  g.fillText('Тарифы', 64, 150);
  ['Старт', 'Команда', 'Бизнес'].forEach((name, i) => {
    const x = 64 + i * 390;
    g.fillStyle = '#fff';
    g.fillRect(x, 200, 360, 420);
    g.strokeStyle = '#d9dee5';
    g.strokeRect(x, 200, 360, 420);
    g.fillStyle = '#1d2a3a';
    g.font = '600 28px sans-serif';
    g.fillText(name, x + 28, 260);
    g.font = '700 40px sans-serif';
    g.fillText(['0 ₽', '990 ₽', '2 990 ₽'][i], x + 28, 330);
    g.fillStyle = '#3d6fe0';
    g.fillRect(x + 28, 540, 304, 52);
    g.fillStyle = '#fff';
    g.font = '600 20px sans-serif';
    g.fillText('Выбрать', x + 138, 573);
  });
  return {data: c.toDataURL('image/jpeg', 0.8).split(',')[1], width: 1280, height: 860};
}
const callbacks = new Map(),
  listeners = new Map();
let sequence = 0;
const projects = [
  {id: 'preview', name: 'Nexus · проверка интерфейса', workspace: '/tmp/nexus-ui-fixture', contexts: []},
  {id: 'nexus-system', name: 'Nexus', system: true, workspace: '/tmp/nexus-ui-fixture'},
];
const chats = [
  {id: 'preview-empty', projectId: 'preview', title: 'Новый чат', folderId: 'f'},
  {
    id: 'long',
    projectId: 'preview',
    title: 'Очень длинное название чата для проверки плавного затухания и появления кнопок действий',
    folderId: 'f',
  },
  {
    id: 'child',
    projectId: 'preview',
    title: 'Подчат с сохранённым контекстом',
    folderId: 'f',
    parentChatId: 'long',
  },
  {
    id: 'history',
    projectId: 'preview',
    title: 'Проверка оформления ответов и технических деталей',
    folderId: null,
  },
  {id: 'gallery', projectId: 'preview', title: 'Графические блоки в ответах', folderId: null},
];
const accounts = [
    {id: 'codex-fixture', provider: 'codex', name: 'Тестовый профиль'},
    {id: 'gemini-fixture', provider: 'gemini', name: 'Тестовый Google'},
  ],
  api = [];
const fence = '```';
const galleryAnswer = [
  'Вот разбор релиза. Кратко — в выноске, детали ниже.',
  '',
  '> [!TIP]',
  '> Самое важное: сборка стабильна, осталось закрыть две задачи по доступности.',
  '',
  fence + 'nexus-widget',
  '{"type":"kpis","title":"Состояние релиза 0.21","items":[{"label":"Тесты","value":"214","delta":"+18"},{"label":"Покрытие","value":"81%","delta":"+3%"},{"label":"Открытые баги","value":"7","delta":"−4"},{"label":"Время сборки","value":"2:41"}]}',
  fence,
  '',
  fence + 'mermaid',
  'flowchart LR',
  '  A[Запрос] --> B{Нужны файлы?}',
  '  B -- да --> C[Codex / Claude]',
  '  B -- нет --> D[Локальный Qwen]',
  '  C --> E[Проверки]',
  '  D --> E',
  '  E --> F((Ответ))',
  fence,
  '',
  fence + 'nexus-widget',
  '{"type":"line","title":"Время ответа, секунды","x":["пн","вт","ср","чт","пт"],"series":[{"name":"Codex","values":[14,12,13,9,8]},{"name":"Claude","values":[11,12,null,10,9]}]}',
  fence,
  '',
  fence + 'nexus-widget',
  '{"type":"pie","title":"Куда ушла квота","items":[{"label":"Выполнение","value":54},{"label":"Обсуждение","value":31},{"label":"Проверки","value":15}]}',
  fence,
  '',
  fence + 'nexus-widget',
  '{"type":"compare","title":"Варианты хранения истории","columns":[{"title":"JSON-файл","tone":"warning","items":["Просто и уже работает","Читается целиком при каждом запросе"]},{"title":"SQLite","tone":"success","items":["Быстрые выборки и поиск","Нужна миграция данных"]}]}',
  fence,
  '',
  fence + 'nexus-widget',
  '{"type":"timeline","title":"План","items":[{"date":"11 ноя","title":"Стеклянный интерфейс","done":true},{"date":"14 ноя","title":"Поиск и горячие клавиши","done":true},{"date":"18 ноя","title":"Варианты ответов","text":"Повтор ответа и переключение между версиями"}]}',
  fence,
  '',
  fence + 'nexus-widget',
  '{"type":"checklist","title":"Перед релизом","items":[{"text":"npm test","done":true},{"text":"cargo test на Mac","done":false},{"text":"Подпись и codesign --verify","done":false}]}',
  fence,
  '',
  fence + 'nexus-widget',
  '{"type":"bar","title":"Сообщений по чатам","items":[{"label":"Интерфейс","value":120},{"label":"Подключения","value":84},{"label":"Персонаж","value":51}]}',
  fence,
  '',
  '| Модуль | Строк | Тесты | Статус |',
  '|---|---|---|---|',
  '| chat-search.js | 92 | 14 | готово |',
  '| shortcuts.js | 40 | 15 | готово |',
  '| answer-widgets.jsx | 160 | 22 | в работе |',
  '',
  fence + 'rust',
  '// Проверка контекста до создания проекта',
  'fn create_project(name: String) -> Result<Project, String> {',
  '    let contexts = validate_sources(contexts)?; // 200 источников',
  '    Ok(Project { name, contexts })',
  '}',
  fence,
  '',
  '> [!WARNING]',
  '> Rust-часть нужно прогнать `cargo test` на Mac перед сборкой.',
].join('\n');
const day = offset => new Date(Date.now() - offset * 86400000).toISOString();
const longTopics = [
  'маршрутизацию запросов',
  'хранение истории',
  'проверки после выполнения',
  'интерфейс подключений',
  'черновики и варианты',
  'графику в ответах',
];
const longMessages = longTopics.flatMap((topic, i) => [
  {
    id: 'lu' + i,
    chatId: 'long',
    role: 'user',
    content: `Расскажи про ${topic}. Что важно учесть?`,
    createdAt: day(i < 3 ? 1 : 0),
  },
  {
    id: 'la' + i,
    chatId: 'long',
    role: 'assistant',
    createdAt: day(i < 3 ? 1 : 0),
    content: [
      `## ${topic[0].toUpperCase() + topic.slice(1)}`,
      '',
      `Коротко: решение опирается на **реальные данные**, а не на догадки. Подробности — в [документации](https://github.com/chromealex/nexus) и в модуле \`${['agent-catalog.js', 'chat_history.rs', 'verification.rs', 'connections-dialog.jsx', 'chat_variants.rs', 'answer-widgets.jsx'][i]}\`.`,
      '',
      '### Что учесть',
      '',
      '1. Ручной выбор модели никогда не подменяется.',
      '2. Квота показывается только из подтверждённых источников.',
      '   - Codex — `account/rateLimits/read`',
      '   - Claude — поля statusLine',
      '3. Ошибки сохраняют уже полученный текст.',
      '',
      ...(i % 2 === 0
        ? [
            fence + 'js',
            '// ' + topic,
            'export function route(task, models) {',
            '  const ready = models.filter(m => m.ready);',
            '  return ready.find(m => m.fits(task)) ?? null;',
            '}',
            fence,
            '',
          ]
        : ['> Цитата из обсуждения: «сначала измерить, потом обещать».', '']),
      ...(i === 3
        ? [fence + 'nexus-widget', '{"type":"progress","label":"Готовность раздела","value":72}', fence, '']
        : []),
      '---',
      '',
      'Если нужно, разберу любой пункт подробнее.',
    ].join('\n'),
  },
]);

const messages = [
  {
    id: 'u0',
    chatId: 'history',
    role: 'user',
    content: 'Вчерашний вопрос для проверки разделителя дней.',
    createdAt: day(1),
  },
  {
    id: 'u1',
    chatId: 'history',
    role: 'user',
    content: 'Проверь оформление чата и технического сообщения.',
    createdAt: day(0),
  },
  {
    id: 'a1',
    chatId: 'history',
    role: 'assistant',
    createdAt: day(0),
    content:
      'Обычный ответ агента без обрамляющей карточки.\n\n- Сохранён текст\n- Детали свёрнуты\n\nИзменения в `src/report.rs:3`, описание в `docs/README.md`, данные — `data/sales.csv`.',
    details: 'Route: codex / fixture\nModel: fixture-model\nEffort: low',
  },
  {
    id: 'gu',
    chatId: 'gallery',
    role: 'user',
    content:
      'Покажи состояние релиза наглядно.\n' +
      Array.from(
        {length: 22},
        (_, i) =>
          `Строка лога ${i + 1}: проверка модуля ${['поиска', 'графиков', 'черновиков'][i % 3]} завершена`
      ).join('\n'),
    createdAt: day(0),
  },
  {
    id: 'ga',
    chatId: 'gallery',
    role: 'assistant',
    content: galleryAnswer,
    details: 'Route: codex / fixture\nModel: fixture-model\nEffort: medium',
    createdAt: day(0),
    variants: [
      {content: 'Первый, более короткий вариант ответа.', createdAt: day(0)},
      {content: galleryAnswer, createdAt: day(0)},
    ],
    variant: 1,
  },
  ...longMessages,
  {
    id: 's1',
    chatId: 'history',
    role: 'system',
    createdAt: day(0),
    content: 'Тестовый технический журнал. Это данные изолированной проверки, а не реального провайдера.',
  },
];

const goals = [{id: 'g', projectId: 'preview', title: 'Проверить подключения и навигацию', done: false}];
const emit = (event, payload) => {
  for (const item of listeners.values())
    if (item.event === event) callbacks.get(item.callback)?.({event, payload, id: 1});
};
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener: () => {}};
localStorage.setItem('nexus-active-project', 'preview');
localStorage.setItem(
  'nexus-active-chat:preview',
  new URLSearchParams(location.search).has('history')
    ? 'history'
    : new URLSearchParams(location.search).has('gallery')
      ? 'gallery'
      : new URLSearchParams(location.search).has('long')
        ? 'long'
        : 'preview-empty'
);
window.__TAURI_INTERNALS__ = {
  transformCallback(fn) {
    const id = ++sequence;
    callbacks.set(id, fn);
    return id;
  },
  async invoke(cmd, args = {}) {
    if (cmd === 'plugin:event|listen') {
      const id = ++sequence;
      listeners.set(id, {event: args.event, callback: args.handler});
      return id;
    }
    if (cmd === 'plugin:event|unlisten') {
      listeners.delete(args.eventId);
      return;
    }
    if (cmd === 'browser_tools_status')
      return {...browserTools, mode: browserModes[args.chatId] || 'builtin'};
    if (cmd === 'save_chat_browser') {
      browserModes[args.chatId] = args.mode;
      return {...browserTools, mode: args.mode};
    }
    if (cmd === 'install_browser_tools') {
      await new Promise(r => setTimeout(r, 400));
      browserTools.installed = true;
      browserTools.installedVersion = '0.0.85';
      return {...browserTools};
    }
    if (cmd === 'cancel_browser_install' || cmd === 'open_browser_extension_page') return;
    if (cmd === 'browser_pane_state' || cmd === 'browser_pane_open') {
      const state = {chatId: args.chatId, running: true, saved: true, ...fakeTabs};
      const agent = new URLSearchParams(location.search).has('agent');
      if (cmd === 'browser_pane_open' || agent)
        setTimeout(() => {
          emit('browser-tabs', state);
          emit('browser-frame', {chatId: args.chatId, tab: 2, ...fakePage()});
          if (agent)
            emit('browser-activity', {
              chatId: args.chatId,
              tool: 'browser_click',
              text: 'Нажать «Сравнить тарифы»',
              asks: true,
            });
        }, 300);
      return state;
    }
    if (cmd === 'browser_pane_view') {
      if (args.view === 'thumb')
        setTimeout(() => emit('browser-frame', {chatId: args.chatId, tab: 2, ...fakePage()}), 200);
      return;
    }
    if (cmd === 'browser_pane_input') return;
    if (cmd === 'read_project_file') {
      const path = args.path.replace(/:\d+$/, '');
      const files = {
        'src/report.rs':
          '// Report export\nuse std::fs;\n\npub fn export_pdf(rows: &[Row]) -> Result<Vec<u8>, String> {\n    let mut out = Vec::new();\n    for row in rows {\n        out.extend(row.render());\n    }\n    Ok(out)\n}\n',
        'docs/README.md':
          '# Экспорт отчётов\n\nОтчёт можно сохранить в **PDF** или CSV.\n\n> [!TIP]\n> Большие отчёты строятся в фоне.\n\n```mermaid\nflowchart LR\n  A[Данные] --> B[Отчёт] --> C[PDF]\n```\n\n| Формат | Размер |\n|---|---|\n| PDF | 120 КБ |\n| CSV | 8 КБ |\n',
        'data/sales.csv': 'Месяц,Выручка,Заказы\nЯнварь,120000,340\nФевраль,135500,362\nМарт,"141 200",371\n',
      };
      const text = files[path];
      if (text == null) throw 'Файл не найден';
      const bytes = new TextEncoder().encode(text);
      let bin = '';
      bytes.forEach(b => (bin += String.fromCharCode(b)));
      return {
        name: path.split('/').pop(),
        path: '/tmp/nexus-ui-fixture/' + path,
        display: path,
        size: bytes.length,
        line: /:(\d+)$/.exec(args.path)?.[1] * 1 || null,
        data: btoa(bin),
      };
    }
    // A slow answer, so the message queue above the composer can be seen while it is written.
    if (cmd === 'unified_chat_send') {
      await new Promise(r => setTimeout(r, 4000));
      return {
        message: {
          id: 'answer-' + ++sequence,
          chatId: args.chatId,
          role: 'assistant',
          content: 'Готово: ' + args.text,
          createdAt: new Date().toISOString(),
        },
        route: 'Route: fixture',
        tier: 'fast',
      };
    }
    // Worktree, changes, terminal, automations, skills and memory (fixtures only).
    if (cmd === 'chat_worktree_status')
      return {
        repo: true,
        worktree: {
          branch: 'nexus/report-export-3fa21c',
          path: '/tmp/nexus-ui-fixture-wt',
          root: '/tmp/nexus-ui-fixture-wt',
        },
      };
    if (cmd === 'chat_changes')
      return {
        repo: true,
        root: '/tmp/nexus-ui-fixture',
        branch: 'nexus/report-export-3fa21c',
        worktree: {branch: 'nexus/report-export-3fa21c'},
        commits: 1,
        uncommitted: true,
        total: 3,
        files: [
          {path: 'docs/README.md', status: 'M', added: 4, removed: 1},
          {path: 'src/report.rs', status: 'M', added: 12, removed: 3},
          {path: 'src/report_pdf.rs', status: '?', added: 40, removed: 0},
        ],
      };
    if (cmd === 'chat_file_diff')
      return {
        path: args.path,
        truncated: false,
        diff: 'diff --git a/src/report.rs b/src/report.rs\n--- a/src/report.rs\n+++ b/src/report.rs\n@@ -3,6 +3,9 @@ use std::fs;\n pub fn export_pdf(rows: &[Row]) -> Result<Vec<u8>, String> {\n-    let mut out = Vec::new();\n+    let mut out = Vec::with_capacity(rows.len() * 64);\n+    // Rows are rendered in order.\n     for row in rows {\n         out.extend(row.render());\n     }\n',
      };
    if (cmd === 'terminal_cwd') return '/tmp/nexus-ui-fixture-wt';
    if (cmd === 'terminal_run') {
      const runId = 't' + ++sequence;
      setTimeout(
        () =>
          emit('terminal-output', {
            chatId: args.chatId,
            runId,
            stream: 'stdout',
            text: 'On branch nexus/report-export-3fa21c\nChanges not staged for commit:\n\tmodified:   src/report.rs\n',
          }),
        150
      );
      setTimeout(() => emit('terminal-exit', {chatId: args.chatId, runId, code: 0, ms: 240}), 300);
      return runId;
    }
    if (cmd === 'terminal_stop') return;
    if (cmd === 'list_automations')
      return [
        {
          id: 'a1',
          name: 'Утренний отчёт',
          projectId: 'preview',
          chatId: null,
          prompt: 'Проверь вчерашние коммиты',
          schedule: {kind: 'weekly', time: '09:00', days: [1, 2, 3, 4, 5]},
          mode: 'discuss',
          enabled: true,
          nextRun: Math.floor(Date.now() / 1000) + 3600 * 17,
          lastRun: Math.floor(Date.now() / 1000) - 3600 * 7,
          lastStatus: 'ok',
          lastChat: 'history',
          runs: 12,
        },
        {
          id: 'a2',
          name: 'Проверка сборки',
          projectId: 'preview',
          chatId: 'history',
          prompt: 'npm test',
          schedule: {kind: 'interval', minutes: 60},
          mode: 'execute',
          enabled: false,
          nextRun: null,
          lastRun: null,
          lastStatus: '',
          lastError: '',
          runs: 0,
        },
      ];
    if (cmd === 'automation_preview')
      return {next: [Math.floor(Date.now() / 1000) + 3600, Math.floor(Date.now() / 1000) + 90000]};
    if (['save_automation', 'toggle_automation', 'remove_automation', 'run_automation_now'].includes(cmd))
      return {};
    if (cmd === 'list_skills')
      return [
        {
          name: 'release-notes',
          description: 'Заметки к релизу по коммитам с прошлого тега',
          scope: 'project',
          path: '/tmp/nexus-ui-fixture/.nexus/skills/release-notes/SKILL.md',
        },
        {
          name: 'code-review',
          description: 'Ревью изменений: безопасность, тесты, читаемость',
          scope: 'nexus',
          path: '/x/SKILL.md',
        },
        {name: 'pdf', description: 'Работа с PDF', scope: 'claude', path: '/y/SKILL.md'},
      ];
    if (cmd === 'list_memory')
      return [
        {
          id: 'm1',
          scope: 'preview',
          text: 'Тесты запускаются командой npm test в папке app',
          createdAt: '1',
          source: 'user',
        },
        {id: 'm2', scope: 'global', text: 'Отвечать по-русски, коротко', createdAt: '2', source: 'agent'},
      ];
    if (['save_memory', 'remove_memory', 'save_skill', 'remove_skill', 'reveal_skill'].includes(cmd))
      return {};
    if (cmd === 'reveal_project_file' || cmd === 'open_system_target') return;
    if (cmd === 'import_candidates')
      return [
        {
          path: '/Users/you/Projects/BunkerWars',
          name: 'BunkerWars',
          sources: ['claude', 'codex'],
          lastUsed: Math.floor(Date.now() / 1000) - 3600,
          sessions: 42,
          added: false,
        },
        {
          path: '/Users/you/Projects/site',
          name: 'site',
          sources: ['codex'],
          lastUsed: Math.floor(Date.now() / 1000) - 86400 * 3,
          sessions: 5,
          added: false,
        },
        {
          path: '/tmp/nexus-ui-fixture',
          name: 'nexus-ui-fixture',
          sources: ['claude'],
          lastUsed: Math.floor(Date.now() / 1000) - 86400 * 40,
          sessions: 2,
          added: true,
        },
      ];
    if (cmd === 'import_projects')
      return {added: args.paths.map(p => ({id: p, name: p.split('/').pop(), workspace: p})), skipped: []};
    if (cmd === 'project_icon' || cmd === 'set_project_icon')
      return args.mode === 'none'
        ? {mode: 'none', url: null, source: null}
        : {
            mode: 'auto',
            source: 'docs/assets/icon.svg',
            url:
              'data:image/svg+xml;base64,' +
              btoa(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#3d6fe0"/><path d="M4 11V5l4 4 4-4v6" stroke="#fff" fill="none" stroke-width="1.6"/></svg>'
              ),
          };
    if (cmd === 'channels_list')
      return ['telegram', 'discord', 'slack', 'email', 'imessage', 'github', 'linear'].map(kind => ({
        config: {
          kind,
          enabled: false,
          allowed: [],
          projectId: 'preview',
          notifyProgress: true,
          allowExecute: false,
          selfChat: false,
        },
        status: {state: 'off'},
        hasSecret: false,
      }));
    if (cmd === 'channels_log') return [];
    if (cmd === 'background_settings') return {enabled: false};
    if (cmd === 'read_attachment') return btoa('# Проверка вложения\n\nТекст файла.');
    if (cmd === 'adaptive_plan' || cmd === 'ai_adaptive_plan')
      return {
        warnings: cmd === 'ai_adaptive_plan' ? ['Уточнение с ИИ расходует квоту выбранного аккаунта.'] : [],
        steps: [
          {
            id: 1,
            title: 'Изучить текущий код',
            reason: 'Нужно понять структуру',
            prompt: 'Прочитай модули',
            provider: 'codex',
            model: 'default',
            dependsOn: [],
          },
          {
            id: 2,
            title: 'Внести изменения',
            reason: 'Основная работа',
            prompt: 'Измени код',
            provider: 'claude',
            model: 'sonnet',
            dependsOn: [1],
          },
          {
            id: 3,
            title: 'Проверить тестами',
            reason: 'Подтвердить результат',
            prompt: 'Запусти тесты',
            provider: 'codex',
            model: 'default',
            dependsOn: [2],
          },
        ],
      };
    if (cmd === 'list_project_permissions') return previewGrants.filter(g => g.projectId === args.projectId);
    if (cmd === 'revoke_project_permission') {
      const i = previewGrants.findIndex(
        g => g.kind === args.kind && JSON.stringify(g.scope) === JSON.stringify(args.scope)
      );
      if (i >= 0) previewGrants.splice(i, 1);
      return;
    }
    if (cmd === 'reset_project_permissions') {
      previewGrants.length = 0;
      return;
    }
    if (cmd === 'list_projects') return projects;
    if (cmd === 'list_project_chats')
      return chats.filter(c => c.projectId === args.projectId && !c.archived && !c.deletedAt);
    if (cmd === 'list_project_folders')
      return args.projectId === 'preview'
        ? [
            {
              id: 'f',
              projectId: 'preview',
              name: 'Проверка контекста',
              contexts: [{kind: 'note', value: 'fixture'}],
            },
          ]
        : [];
    if (cmd === 'list_chat_messages') return messages.filter(m => m.chatId === args.chatId);
    if (cmd === 'chat_message_page')
      return {messages: messages.filter(m => m.chatId === args.chatId), hasMore: false, beforeId: null};
    if (cmd === 'agents')
      return ['codex', 'claude', 'gemini', 'qwen', 'goose', 'antigravity', 'opencode', 'aider', 'grok'].map(
        id => ({id, name: id, installed: ['codex', 'gemini'].includes(id), installable: id !== 'grok'})
      );
    if (cmd === 'integrations' || cmd === 'install_status' || cmd === 'list_custom_agents') return [];
    if (cmd === 'list_provider_connections') return api;
    if (cmd === 'list_accounts') return [...accounts];
    if (cmd === 'account_isolation') return [];
    if (cmd === 'auth_status') throw Error('No login started');
    if (cmd === 'check_account')
      return {
        status: args.id.startsWith('codex') ? 'ready' : 'login_required',
        detail: 'Изолированная проверка UI',
      };
    if (cmd === 'account_quota')
      return args.id.startsWith('codex')
        ? {
            status: 'available',
            primaryUsedPercent: 27,
            secondaryUsedPercent: 43,
            source: 'Fixture · synthetic data',
            checkedAt: Math.floor(Date.now() / 1000),
          }
        : {status: 'unavailable', source: 'UI fixture'};
    if (cmd === 'list_chat_models')
      return [
        {
          id: 'codex/fixture-model',
          label: 'Codex · fixture-model',
          model: 'fixture-model',
          provider: 'codex',
        },
        ...api.flatMap(a =>
          a.models.map(model => ({
            id: `${a.id}/${model}`,
            label: `${a.name} · ${model}`,
            provider: a.id,
            model,
          }))
        ),
      ];
    if (cmd === 'project_board')
      return {
        goals: goals.filter(g => g.projectId === args.projectId),
        tasks: [
          {
            id: 'task',
            projectId: 'preview',
            chatId: 'history',
            title: 'Проверить результат работы агента',
            status: 'review',
            steps: ['Изучить проект', 'Выполнить изменения', 'Проверить'],
            verification: 'Тестовые данные: независимая проверка ожидается',
          },
          {
            id: 'team-task',
            projectId: 'preview',
            chatId: 'history',
            title: 'Командная задача из тестовых данных',
            status: 'running',
            steps: [],
            team: [
              {
                step: {id: 's1', title: 'Изучить код', modelChoice: 'auto', reason: 'Тест'},
                status: 'done',
                elapsedMs: 4200,
              },
              {
                step: {id: 's2', title: 'Внести правки', modelChoice: 'auto', reason: 'Тест'},
                status: 'running',
                elapsedMs: 0,
              },
              {
                step: {id: 's3', title: 'Проверить', modelChoice: 'auto', reason: 'Тест'},
                status: 'pending',
                elapsedMs: 0,
              },
            ],
            verification: 'Тестовые данные: команда в работе',
          },
        ],
      };
    if (cmd === 'change_chat_state') {
      const ids = new Set([args.chatId]);
      for (let i = 0; i < 17; i++) for (const c of chats) if (ids.has(c.parentChatId)) ids.add(c.id);
      for (const c of chats)
        if (ids.has(c.id)) {
          c.archived = args.action === 'archive';
          c.deletedAt = args.action === 'trash' ? 'fixture' : null;
        }
      return;
    }
    if (cmd === 'list_saved_chats')
      return chats.filter(c => (args.kind === 'archive' ? c.archived && !c.deletedAt : c.deletedAt));
    if (cmd === 'remove_account') {
      const i = accounts.findIndex(a => a.id === args.id);
      if (i >= 0) accounts.splice(i, 1);
      return;
    }
    if (cmd === 'add_account') {
      const a = {id: 'account-' + ++sequence, provider: args.provider, name: args.name};
      accounts.push(a);
      return a;
    }
    if (cmd === 'account_login') {
      emit('auth-event', {id: args.id, phase: 'waiting', message: 'UI fixture: browser confirmation'});
      return;
    }
    if (cmd === 'cancel_auth') {
      emit('auth-event', {id: args.id, phase: 'cancelled', message: 'UI fixture: cancelled'});
      return;
    }
    if (cmd === 'connect_provider') {
      const a = {
        id: 'api-fixture-' + ++sequence,
        provider: args.provider,
        name: args.name,
        models: [args.provider === 'local' ? 'qwen3:4b' : 'fixture-api-model'],
        ready: true,
        checkedAt: Math.floor(Date.now() / 1000),
      };
      api.push(a);
      return a;
    }
    if (cmd === 'check_provider_connection') return api.find(a => a.id === args.id);
    if (cmd === 'agent_registry')
      return [
        {
          id: 'registry-fixture',
          name: 'Пример агента из реестра',
          description: 'Тестовые данные интерфейса, без установки',
          distribution: 'npm',
          npmPackage: null,
          args: [],
        },
      ];
    if (cmd === 'mark_chat_read' || cmd === 'drag_main_window' || cmd === 'notify_answer_ready') return;
    if (cmd === 'select_message_variant') {
      const m = messages.find(x => x.id === args.messageId);
      m.variants[m.variant] = {...m.variants[m.variant], content: m.content};
      m.variant = args.index;
      m.content = m.variants[args.index].content;
      return {...m};
    }
    if (cmd === 'edit_last_user_message') {
      const m = messages.find(x => x.id === args.messageId);
      m.content = args.text;
      m.edited = true;
      return {...m};
    }
    if (cmd === 'save_chat_export') return '/Users/you/Downloads/' + args.fileName + '.md';
    if (cmd === 'reveal_chat_export') return;
    if (cmd === 'regenerate_chat_answer') {
      const m = messages.find(x => x.id === args.messageId);
      await new Promise(r => setTimeout(r, 900));
      if (!m.variants?.length) {
        m.variants = [{content: m.content}];
        m.variant = 0;
      }
      m.variants.push({content: 'Новый вариант ответа из тестовых данных.'});
      m.variant = m.variants.length - 1;
      m.content = 'Новый вариант ответа из тестовых данных.';
      return {message: {...m}, route: 'fixture', tier: 'test'};
    }
    if (cmd === 'create_project') {
      if (!args.workspace?.startsWith('/')) throw Error('Укажите абсолютный путь');
      const p = {
        id: 'project-' + ++sequence,
        name: args.name,
        workspace: args.workspace,
        contexts: args.contexts || [],
      };
      projects.push(p);
      return p;
    }
    if (cmd === 'save_project_settings') {
      const p = projects.find(x => x.id === args.projectId);
      p.name = args.name;
      p.contexts = args.contexts;
      return p;
    }
    if (cmd === 'upload_attachment')
      return {
        id: 'attachment-' + ++sequence,
        name: args.name,
        mime: args.mime,
        size: args.data.length,
        projectId: args.projectId,
      };
    if (cmd === 'save_project_folder')
      return {
        id: args.id || 'folder-' + ++sequence,
        projectId: args.projectId,
        parentId: args.parentId,
        name: args.name,
        contexts: args.contexts,
      };
    throw Error(`UI fixture does not implement ${cmd}`);
  },
};
await import('/src/main.jsx');
