import {MODEL_PROFILES} from './model-profiles.js';
import {benchmarkChoice} from './model-benchmarks.js';
import {loc} from './i18n.js';
// Agent capabilities, not invented model rankings. Model IDs come from live adapters.
export const CATALOG = [
  {
    id: 'codex',
    name: 'OpenAI Codex',
    kind: 'oauth',
    tags: ['code', 'reasoning', 'tools'],
    description: loc('Код, терминал, файлы и проверка результата. Вход с ChatGPT.'),
  },
  {
    id: 'claude',
    name: 'Claude Code',
    kind: 'oauth',
    tags: ['code', 'reasoning', 'tools', 'writing'],
    description: loc('Работа с проектом, сложные изменения и тексты. Вход Anthropic.'),
  },
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    kind: 'acp',
    executable: 'agy_acp_server.par',
    args: [],
    authMethod: 'oauth-personal',
    tags: ['code', 'tools', 'multimodal'],
    description: loc(
      'Официальный ACP Google для личного входа. Отдельный runtime вместо старого Gemini CLI.'
    ),
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    kind: 'gemini',
    tags: ['code', 'tools', 'multimodal'],
    description: loc(
      'Личные подписки переведены в Antigravity. Здесь доступны Gemini API и существующие корпоративные профили.'
    ),
  },
  {
    id: 'grok',
    name: 'Grok',
    kind: 'api',
    provider: 'grok',
    tags: ['writing', 'reasoning'],
    description: loc('Текстовый чат через официальный xAI API. Подписка Grok и API оплачиваются отдельно.'),
  },
  {
    id: 'qwen-local',
    name: loc('Qwen · локально'),
    kind: 'api',
    provider: 'local',
    tags: ['simple', 'local', 'review'],
    description: loc(
      'Локальный Qwen через Ollama. Простые вопросы и дополнительная проверка текста без облачных токенов.'
    ),
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    kind: 'acp',
    executable: 'qwen',
    args: ['--acp'],
    tags: ['code', 'tools', 'local'],
    description: loc('ACP-агент для кода на локальном qwen3:4b через Ollama. Настройки изолированы в Nexus.'),
  },
  {
    id: 'goose',
    name: 'Goose',
    kind: 'acp',
    executable: 'goose',
    args: ['acp'],
    tags: ['code', 'tools', 'local'],
    description: loc(
      'Установка официального бинарника и ACP. В Nexus использует локальный qwen3:4b через Ollama.'
    ),
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    kind: 'acp',
    executable: 'opencode',
    args: ['acp'],
    tags: ['code', 'tools'],
    description: loc('Открытый агент с ACP. Для чата нужен настроенный провайдер.'),
  },
  {
    id: 'aider',
    name: 'Aider',
    kind: 'external',
    tags: ['code'],
    description: loc('Доступен установщик через uv. ACP-адаптер в Nexus пока не реализован.'),
    url: 'https://aider.chat/docs/install.html',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    kind: 'custom',
    executable: 'copilot',
    args: ['--acp'],
    npmPackage: '@github/copilot',
    tags: ['code', 'tools'],
    description: loc('Подключается через ACP; доступ зависит от вашего плана GitHub.'),
    url: 'https://docs.github.com/en/copilot/concepts/agents/copilot-cli/acp',
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    kind: 'custom',
    executable: 'kimi',
    args: ['acp'],
    tags: ['code', 'tools'],
    description: loc('Установленный Kimi CLI подключается через ACP.'),
    url: 'https://moonshotai.github.io/kimi-cli/en/customization/acp.html',
  },
  {
    id: 'cline',
    name: 'Cline',
    kind: 'custom',
    executable: '',
    args: [],
    tags: ['code', 'tools'],
    description: loc('Нужен установленный CLI с поддержкой ACP и настроенный провайдер.'),
    url: 'https://docs.cline.bot/',
  },
  {
    id: 'amp',
    name: 'Amp',
    kind: 'custom',
    executable: 'amp-acp',
    args: [],
    tags: ['code', 'tools'],
    description: loc('Нужны официальный CLI, аккаунт и совместимый ACP-адаптер.'),
    url: 'https://ampcode.com/',
  },
  {
    id: 'openai-compatible',
    name: loc('Свой API / LM Studio'),
    kind: 'api',
    provider: 'openai-compatible',
    tags: ['writing', 'local'],
    description: loc('OpenAI-совместимый сервер, свой endpoint и список моделей от сервера.'),
  },
];
export const TAG_NAMES = {
  code: loc('Код'),
  reasoning: loc('Сложные задачи'),
  tools: loc('Инструменты'),
  writing: loc('Тексты'),
  multimodal: loc('Изображения'),
  simple: loc('Простые задачи'),
  local: loc('Локально'),
  review: loc('Проверка'),
};
export function classifyTask(
  text = '',
  hasFiles = false,
  {hasImages = false, executionMode = 'discuss'} = {}
) {
  const bullets = (text.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) || []).length;
  const projectInspection = /(?:этот|текущий|мой)\s+проект|устроен.{0,40}проект|this project|codebase/i.test(
    text
  );
  const webdev = /(фронтенд|frontend|лендинг|landing|веб.?сайт|web.?site|react|html|css)/i.test(text);
  const translation = /(переведи|перевод|translate|translation)/i.test(text);
  const editing = /(отредакт|редактур|перепиши|корректур|proofread|rewrite)/i.test(text);
  const extraction =
    hasFiles &&
    /(извлеки|извлечь|вытащи|выпиши|найди в (?:документ|файл|pdf|отч)|таблиц|pdf|extract|parse|invoice|счёт|счет-фактур)/i.test(
      text
    );
  const code =
    webdev ||
    /(код|рефактор|программ|алгоритм|тест|функци|метод|класс|парс|баг|компил|сборк|скрипт|репозитор|коммит|code|debug|implement|test|function|method|class|pars|bug|compil|build|script|commit|shader|unity|rust|python|javascript|typescript|swift|c#|c\+\+)/i.test(
      text
    );
  const repair = code && /(исправ|ошибк|debug|bug|рефактор|refactor)/i.test(text);
  // In the execution modes tools are needed only when the request asks to do something; plain conversation
  // ("what do you think…", "explain…") is open to every model, including text-only ones.
  const executing = executionMode === 'execute' || executionMode === 'auto';
  const asksAction =
    code ||
    /(сделай|сделать|исправ|запуст|выполн|создай|создать|измени|поменяй|удали|добавь|обнови|установ|проверь|прогони|собери|почини|перепиши файл|сохрани|открой|перенеси|переименуй|настрой|отправь|скачай|найди в|посмотри в|прочитай|run|fix|create|change|update|delete|remove|add |install|build|check|open|rename|move|save|deploy|commit|push)/i.test(
      text
    );
  const complex =
    text.length > 1200 ||
    bullets >= 4 ||
    /(архитект|рассужд|доказ|докаж|теорем|логическ|математ|полностью|несколько этап|reasoning|prove|architecture|end.to.end)/i.test(
      text
    );
  return {
    kind: hasImages ? 'visual' : code ? 'code' : complex ? 'reasoning' : 'simple',
    taskType: hasImages
      ? loc('Анализ изображений')
      : webdev
        ? loc('Веб-разработка')
        : translation
          ? loc('Перевод')
          : editing
            ? loc('Редактура')
            : extraction
              ? loc('Извлечение данных')
              : repair
                ? loc('Исправление кода')
                : code
                  ? loc('Разработка кода')
                  : complex
                    ? loc('Рассуждения')
                    : loc('Тексты'),
    complex,
    webdev,
    extraction,
    hasFiles,
    hasImages,
    needsTools: (executing && asksAction) || hasFiles || projectInspection,
    // Short plain questions do not need the strongest rated model; ratings are skipped for them.
    trivial:
      !hasImages &&
      !hasFiles &&
      !code &&
      !complex &&
      !translation &&
      !editing &&
      !(executing && asksAction) &&
      !projectInspection &&
      text.trim().length < 160,
    reason: projectInspection
      ? loc('Нужен агент с доступом к файлам проекта.')
      : hasImages
        ? loc('Нужен адаптер с передачей изображений.')
        : hasFiles
          ? loc('Нужен доступ к приложенным файлам.')
          : executing && asksAction
            ? loc('Нужен агент с инструментами выполнения.')
            : complex
              ? loc('Запрос содержит несколько этапов.')
              : loc('Текстовое обсуждение.'),
  };
}
// Mirror of the backend `complexity()` → effort rule used when depth is «Авто»,
// so models are compared at the depth the request will actually run with.
const HIGH_EFFORT =
  /architecture|architect|burst|concurrency|thread|security|shader|rendergraph|algorithm|архитект|шейдер|алгоритм|поток|безопасност|оптимизац|ecs/;
const MEDIUM_EFFORT = /implement|refactor|debug|fix|test|реализ|рефактор|исправ|тест|интеграц/;
export function autoEffort(text = '') {
  const l = text.toLowerCase();
  return HIGH_EFFORT.test(l) ? 'high' : MEDIUM_EFFORT.test(l) ? 'medium' : 'low';
}
export function nonChatModel(model) {
  return /(?:imagine|embedding|tts|transcri|whisper|dall-e|gpt-image|veo|imagen|multi-agent|codex-auto-review)/i.test(
    model.model
  );
}
export function modelCapabilities(model, connections = []) {
  const native = ['codex', 'claude'].includes(model.provider),
    acp = model.provider.startsWith('custom-');
  return {
    text: !nonChatModel(model),
    tools: native || acp,
    files: native || acp,
    images: model.images ?? (native ? true : null),
    reasoning: native,
    local: connections.some(c => c.id === model.provider && c.provider === 'local'),
  };
}
export function incompatibleReason(model, task, reasoningMode = 'auto', connections = []) {
  if (model.unavailable) return model.unavailable;
  if (connections.some(c => c.id === model.provider && c.ready === false))
    return loc('Подключение не готово; обновите проверку');
  const c = modelCapabilities(model, connections);
  if (!c.text) return loc('Для этой модели нужен отдельный адаптер; текстовый чат не поддерживается');
  if (task.needsTools && !c.tools) return loc('Нет инструментов выполнения');
  if (task.hasFiles && !c.files) return loc('Адаптер не передаёт файлы');
  if (task.hasImages && c.images !== true)
    return c.images === false
      ? loc('Адаптер не передаёт изображения')
      : loc('Поддержка изображений не подтверждена; переподключите ACP');
  if (reasoningMode !== 'auto' && !c.reasoning) return loc('Ручная глубина недоступна; выберите «Авто»');
  return '';
}
// On some Claude plans Fable runs on usage credits bought separately from the subscription,
// so Auto picks it only when the chat asks for quality first; manual choice is always allowed.
export function usesExtraCredits(model) {
  return model.provider === 'claude' && /^claude-fable-/.test(model.model);
}
export function automaticModelAllowed(model) {
  return !model.provider.startsWith('custom-') && model.autoEligible !== false;
}
export function preferredModel(models) {
  return [...models].sort(
    (a, b) =>
      Number(!!b.isDefault) - Number(!!a.isDefault) ||
      Number(b.model === 'default') - Number(a.model === 'default') ||
      a.id.localeCompare(b.id)
  )[0];
}
export function routingAdvice(
  text,
  {
    models = [],
    connections = [],
    hasFiles = false,
    hasImages = false,
    executionMode = 'discuss',
    reasoningMode = 'auto',
    selection = 'auto',
    priority = 'balanced',
    effort = null,
    quotaLeft = {},
  } = {}
) {
  const task = classifyTask(text, hasFiles, {hasImages, executionMode});
  const scoped = selection.startsWith('agent-auto:')
    ? models.filter(m => m.provider === selection.slice(11))
    : models;
  if (selection !== 'auto' && !selection.startsWith('agent-auto:')) {
    const manual = models.find(m => m.id === selection);
    const error = manual
      ? incompatibleReason(manual, task, reasoningMode, connections)
      : loc('Выбранная модель недоступна');
    return {...task, choice: error ? null : manual.id, error, offer: false};
  }
  const eligible = scoped.filter(
    m =>
      automaticModelAllowed(m) &&
      (priority === 'quality' || !usesExtraCredits(m)) &&
      !incompatibleReason(m, task, reasoningMode, connections)
  );
  if (selection.startsWith('agent-auto:custom-'))
    return {
      ...task,
      choice: null,
      offer: false,
      error: loc(
        'Для пользовательского ACP подтверждён только протокол. Выберите модель агента вручную; автовыбор отключён.'
      ),
    };
  const preferred =
    task.kind === 'simple' && !task.needsTools
      ? 'qwen-local'
      : task.kind === 'reasoning'
        ? 'claude'
        : 'codex';
  const match = m =>
    preferred === 'qwen-local' ? modelCapabilities(m, connections).local : m.provider === preferred;
  const measured =
    task.trivial && priority !== 'quality'
      ? null
      : benchmarkChoice(eligible, task, {
          reasoningMode,
          priority,
          prices: MODEL_PROFILES,
          quotaLeft,
          preferEffort: reasoningMode === 'auto' ? effort || autoEffort(text) : null,
        });
  if (measured)
    return {
      ...task,
      preferred,
      choice: measured.model.id,
      offer: false,
      benchmark: measured.evidence,
      effort: measured.effort,
      comparison: measured.comparison,
      coverage: measured.coverage,
      reason:
        task.reason +
        ' ' +
        measured.reason +
        loc(' Покрытие: ') +
        measured.coverage +
        loc(' совместимых моделей.'),
    };
  const chosen = preferredModel(eligible.filter(match)) || preferredModel(eligible);
  if (chosen)
    return {
      ...task,
      preferred,
      choice: chosen.id,
      offer: false,
      coverage: loc('Недостаточно сопоставимых данных'),
      comparison: [chosen, ...eligible.filter(m => m.id !== chosen.id).slice(0, 2)].map(m => ({
        id: m.id,
        label: m.label || m.model,
        quality: loc('Нет достаточного сравнения для этого режима'),
        cost: null,
        minutes: null,
        note:
          m.id === chosen.id
            ? loc('Резервный выбор по совместимости')
            : loc('Совместимая альтернатива без рейтинга'),
      })),
      reason:
        task.reason +
        (task.trivial && priority !== 'quality'
          ? loc(
              ' Короткий простой запрос: рейтинги не применяются, выбор по совместимости без самой дорогой модели. '
            )
          : loc(
              ' Недостаточно сопоставимых свежих данных для этого режима; резервный выбор по совместимости. '
            )) +
        (chosen.isDefault
          ? loc('Выбрана модель по умолчанию.')
          : loc('Выбран совместимый вариант; рейтинг качества не измерен.')),
    };
  return {
    ...task,
    preferred,
    offer: selection === 'auto',
    error: selection === 'auto' ? '' : loc('У выбранного агента нет совместимой модели. ') + task.reason,
    warning: loc(
      'Нет совместимого подключения для этих требований. Подключите агента или измените параметры.'
    ),
    fallback: null,
  };
}
export function connectionState(check, job) {
  if (['starting', 'waiting'].includes(job?.phase)) return 'waiting';
  if (!check || check.status === 'checking') return 'checking';
  return check.status === 'ready' ? 'ready' : check.status === 'error' ? 'error' : 'login_required';
}
export function pendingRequestMatches(offer, current) {
  return (
    !!offer &&
    offer.projectId === current.projectId &&
    offer.chatId === current.chatId &&
    offer.text === current.text &&
    current.modelChoice === 'auto' &&
    (offer.priority || 'balanced') === (current.priority || 'balanced') &&
    (offer.replyId || null) === (current.replyId || null) &&
    JSON.stringify(offer.attachmentIds || []) === JSON.stringify(current.attachmentIds || [])
  );
}
