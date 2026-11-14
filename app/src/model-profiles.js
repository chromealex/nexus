import {evidenceFor, evidenceRow, evidenceText, benchmarkModel, HARNESS} from './model-benchmarks.js';
// Reviewed 2026-11-11. Exact IDs only: aliases must not inherit a version's price.
export const PROFILE_DATE = '2026-11-11';
const openai = 'https://developers.openai.com/api/docs/models/';
const claude = 'https://platform.claude.com/docs/en/models/overview';
export const MODEL_PROFILES = {
  haiku: {
    role: 'Быстрые простые задачи. Алиас CLI, точная версия и её цена не закреплены',
    source: 'https://code.claude.com/docs/en/model-config',
    tasks: ['simple'],
  },
  sonnet: {
    role: 'Повседневная работа с кодом. Алиас CLI, точная версия и её цена не закреплены',
    source: 'https://code.claude.com/docs/en/model-config',
    tasks: ['code'],
  },
  opus: {
    role: 'Сложные рассуждения. Алиас CLI, точная версия и её цена не закреплены',
    source: 'https://code.claude.com/docs/en/model-config',
    tasks: ['reasoning'],
  },
  'gpt-6-sol': {
    input: 2,
    output: 10,
    context: 1050000,
    role: 'Код и задачи агента; предыдущее поколение Sol',
    tasks: ['code'],
    source: 'https://developers.openai.com/api/docs/models/gpt-6-sol',
  },
  'gpt-5.6-sol': {
    input: 4,
    output: 20,
    context: 1050000,
    role: 'Сложная профессиональная работа; старое поколение',
    tasks: ['reasoning', 'writing'],
    source: 'https://developers.openai.com/api/docs/models/gpt-5.6-sol',
    priceNote: 'Промотариф до 30.11.2026',
  },
  'gpt-5.6-terra': {
    input: 2,
    output: 12,
    context: 1050000,
    role: 'Баланс стоимости и возможностей в семействе 5.6',
    tasks: [],
    source: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
  },
  'gpt-5.6-luna': {
    input: 0.2,
    output: 1.2,
    context: 1050000,
    role: 'Массовые задачи с ограниченным бюджетом',
    tasks: ['simple'],
    source: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
  },
  'gpt-reserve': {
    role: 'Быстрая недорогая модель для кода — описание локального каталога Codex; публичный тариф не найден',
    tasks: ['code'],
    evidence: 'Локальный models_cache.json официального CLI, 11.11.2026',
  },
  'codex-auto-review': {
    role: 'Служебная модель проверки разрешений Codex; не обычный чат',
    tasks: [],
    evidence: 'Локальный models_cache.json официального CLI, 11.11.2026',
  },
  'grok-4.20-0309-reasoning': {
    input: 1.25,
    output: 2.5,
    context: 1000000,
    role: 'Текстовые задачи с рассуждениями',
    tasks: ['reasoning'],
    source: 'https://docs.x.ai/developers/models/grok-4.20-0309-reasoning',
  },
  'grok-4.20-0309-non-reasoning': {
    input: 1.25,
    output: 2.5,
    context: 1000000,
    role: 'Текстовые задачи без отдельного режима рассуждений',
    tasks: ['simple'],
    source: 'https://docs.x.ai/developers/models/grok-4.20-0309-non-reasoning',
  },
  'grok-4.20-multi-agent-0309': {
    input: 1.25,
    output: 2.5,
    context: 1000000,
    role: 'Глубокое исследование несколькими агентами; нужен отдельный адаптер',
    tasks: ['reasoning'],
    source: 'https://docs.x.ai/developers/models/grok-4.20-multi-agent-0309',
  },
  'grok-4.3': {
    input: 1.25,
    output: 2.5,
    context: 1000000,
    role: 'Быстрые ответы и следование инструкциям',
    tasks: ['simple'],
    source: 'https://docs.x.ai/developers/models/grok-4.3',
  },
  'grok-4.5': {
    input: 2,
    output: 6,
    context: 500000,
    role: 'Код, инженерные задачи и работа агента',
    tasks: ['code'],
    source: 'https://docs.x.ai/developers/models/grok-4.5',
  },
  'grok-4.6': {
    input: 2,
    output: 6,
    context: 500000,
    role: 'Код, задачи агента и работа со знаниями',
    tasks: ['code', 'reasoning'],
    source: 'https://docs.x.ai/developers/models/grok-4.6',
  },
  'grok-build-0.1': {
    input: 1,
    output: 2,
    context: 256000,
    role: 'Код и инженерные задачи',
    tasks: ['code'],
    source: 'https://docs.x.ai/developers/models/grok-build-0.1',
  },
  'grok-imagine-image': {
    mediaPrice: '$0.02 за изображение; входное изображение $0.002',
    role: 'Генерация и редактирование изображений; в Nexus нет адаптера',
    tasks: ['visual'],
    source: 'https://docs.x.ai/developers/models/grok-imagine-image',
  },
  'grok-imagine-image-2.0': {
    mediaPrice: 'От $0.04 за изображение (1K Low); входное $0.01',
    role: 'Генерация изображений с выбором разрешения и качества; в Nexus нет адаптера',
    tasks: ['visual'],
    source: 'https://docs.x.ai/developers/models/grok-imagine-image-2.0',
  },
  'grok-imagine-video': {
    mediaPrice: 'От $0.05/с (480p); $0.07/с (720p); вход оплачивается отдельно',
    role: 'Генерация и редактирование видео; в Nexus нет адаптера',
    tasks: ['visual'],
    source: 'https://docs.x.ai/developers/models/grok-imagine-video',
  },
  'grok-imagine-video-1.5': {
    mediaPrice: 'От $0.08/с (480p), $0.14 (720p), $0.25 (1080p); вход отдельно',
    role: 'Генерация видео, в том числе с аудиовходом; в Nexus нет адаптера',
    tasks: ['visual'],
    source: 'https://docs.x.ai/developers/models/grok-imagine-video-1.5',
  },
  'grok-imagine-video-1.5-lite': {
    mediaPrice: 'От $0.02/с (480p), $0.03 (720p), $0.14 (1080p); вход отдельно',
    role: 'Генерация видео с меньшим базовым тарифом; в Nexus нет адаптера',
    tasks: ['visual'],
    source: 'https://docs.x.ai/developers/models/grok-imagine-video-1.5-lite',
  },

  'gpt-6-astra': {
    input: 10,
    output: 50,
    context: 1050000,
    role: 'Сложные рассуждения, код, исследования и документы',
    source: openai + 'gpt-6-astra',
    tasks: ['reasoning', 'code', 'writing'],
  },
  'gpt-6.1-sol': {
    input: 2,
    output: 10,
    context: 1050000,
    role: 'Универсальная работа с текстом, кодом и инструментами',
    source: openai + 'gpt-6.1-sol',
    tasks: ['code', 'writing'],
  },
  'gpt-6.1-terra': {
    input: 1,
    output: 5,
    context: 1050000,
    role: 'Визуальный анализ, работа с экраном и редактирование текстов',
    source: openai + 'gpt-6.1-terra',
    tasks: ['visual', 'writing'],
  },
  'gpt-6-luna': {
    input: 0.1,
    output: 0.5,
    context: 1050000,
    role: 'Недорогие задачи; требуется проверка качества на своих примерах',
    source: openai + 'gpt-6-luna',
    tasks: ['simple'],
  },
  'claude-fable-5-2': {
    input: 8,
    output: 40,
    context: 1000000,
    role: 'Сложные рассуждения и длительные задачи агента',
    source: claude,
    tasks: ['reasoning'],
  },
  'claude-opus-5-5': {
    input: 4,
    output: 20,
    context: 1000000,
    role: 'Длительная работа с кодом и знаниями',
    source: claude,
    tasks: ['code', 'reasoning'],
  },
  'claude-sonnet-5-5': {
    input: 2,
    output: 10,
    context: 1000000,
    role: 'Баланс скорости и возможностей',
    source: claude,
    tasks: ['code', 'writing'],
  },
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    priceNote: 'Цена от; зависит от режима',
    context: 1000000,
    role: 'Классификация, извлечение данных, маршрутизация',
    source: claude,
    tasks: ['simple'],
  },
  'gemini-3.1-flash-lite': {
    input: 0.25,
    output: 1.5,
    role: 'Перевод, простая обработка данных, большой поток запросов',
    source: 'https://ai.google.dev/gemini-api/docs/pricing',
    tasks: ['simple', 'writing'],
  },
  'grok-4.7': {
    input: 2,
    output: 6,
    context: 500000,
    role: 'Код и универсальные задачи; в Nexus API доступен только текст',
    source: 'https://docs.x.ai/developers/models',
    tasks: ['code', 'writing'],
  },
  'qwen3:4b': {
    context: 32768,
    role: 'Локальная обработка текста и дополнительная проверка ответа',
    source: 'https://huggingface.co/Qwen/Qwen3-4B',
    tasks: ['simple'],
  },
};
export const CRITERIA = [
  'Код и тесты',
  'Архитектура и рассуждения',
  'Текст и перевод',
  'Извлечение данных',
  'Изображения',
  'Скорость',
  'Надёжность инструментов',
];
export function modelProfile(model, connections = []) {
  const p = MODEL_PROFILES[model.model] || MODEL_PROFILES[model.resolved],
    connection = connections.find(c => c.id === model.provider);
  const local = connection?.provider === 'local';
  const subscription = ['codex', 'claude'].includes(model.provider);
  const price =
    p?.mediaPrice ||
    (p?.input != null
      ? `$${p.input} / $${p.output} за 1 млн входных / выходных токенов${p.priceNote ? ' · ' + p.priceNote : ''}`
      : 'Точный тариф неизвестен');
  return {
    ...p,
    role:
      p?.role ||
      (model.model === 'default'
        ? 'Модель выбирает runtime агента'
        : ['haiku', 'sonnet', 'opus'].includes(model.model)
          ? 'Плавающий алиас CLI: версия определяется провайдером'
          : 'Характеристики этой версии ещё не проверены'),
    cost: local
      ? 'Нет платы API за токены; используются ресурсы компьютера'
      : subscription
        ? 'Квота подписки; стоимость одного запроса неизвестна'
        : model.provider.startsWith('custom-')
          ? 'Зависит от модели и способа оплаты в агенте'
          : price,
    referencePrice: p?.input != null || p?.mediaPrice ? price : null,
    contextNote: p?.context
      ? `${p.context.toLocaleString('ru-RU')} токенов по спецификации; фактический контекст Nexus ограничен отдельно`
      : 'Контекст модели неизвестен',
    exampleCost: p?.input != null ? ((p.input * 10000 + p.output * 2000) / 1000000).toFixed(4) : null,
    quality: 'Сравнительных измерений Nexus нет',
    resolvedNote: model.resolvedNote || null,
    date: p ? PROFILE_DATE : null,
  };
}

const CRITERION_TASK = {
  'Код и тесты': 'code',
  'Архитектура и рассуждения': 'reasoning',
  'Текст и перевод': 'writing',
  'Извлечение данных': 'simple',
  Изображения: 'visual',
};
// Each criterion reads only the public test that measures it; nothing is borrowed from another test.
const CRITERION_COHORTS = {
  'Код и тесты': ['codingAgent', 'webdev'],
  'Архитектура и рассуждения': ['intelligence'],
  'Текст и перевод': ['text'],
  'Извлечение данных': ['gdppdf'],
  Изображения: ['vision'],
  'Надёжность инструментов': ['automation'],
};
const NOTE = {
  webdev: ' · только веб-разработка',
  text: ' · общий текст, не отдельный перевод',
  gdppdf: ' · вопросы по сложным PDF',
  automation: ' · сценарии с API приложений, не инструменты Nexus',
};
const money = v => (v == null ? '' : ` · API $${v}/задачу`);
const minutes = v => (v == null ? '' : ` · ${v < 60 ? v + ' мин' : (v / 60).toFixed(1) + ' ч'}/задачу`);
function speedText(model) {
  const rows = evidenceFor(model).filter(
    r => r.cohort === 'intelligence' && (r.minutes != null || r.outputSpeed != null)
  );
  if (!rows.length) return null;
  // Default effort of Claude Code and the Codex app is medium; show it first when published.
  const pick = rows.find(r => r.effort === 'medium') || rows.find(r => r.effort === 'max') || rows[0];
  const parts = [
    pick.minutes != null && `${pick.minutes} мин на задачу`,
    pick.firstToken != null && `первый ответ ${pick.firstToken} с`,
    pick.outputSpeed != null && `${pick.outputSpeed} ток/с`,
  ].filter(Boolean);
  return `${parts.join('; ')} · AA, ${pick.effort}, ${pick.date}; не замер Nexus`;
}
export function criterionAssessment(model, criterion, caps) {
  const p = MODEL_PROFILES[model.model];
  if (!caps.text) return 'Отдельная специализация; недоступна в чате Nexus';
  if (criterion === 'Изображения' && caps.images !== true)
    return 'Адаптер не передаёт или не подтвердил изображения';
  if (criterion === 'Надёжность инструментов' && !caps.tools) return 'Адаптер не выполняет инструменты';
  if (['haiku', 'sonnet', 'opus'].includes(model.model) && !model.resolved)
    return model.resolvedNote || 'Плавающий алиас: точная версия не подтверждена';
  if (criterion === 'Скорость') {
    const text = speedText(model);
    if (text) return text;
  }
  for (const cohort of CRITERION_COHORTS[criterion] || []) {
    const row = evidenceRow(model, cohort);
    if (!row) continue;
    if (cohort === 'codingAgent')
      return (
        evidenceText(row) +
        ` · репозитории ${row.parts.frontier}%, терминал ${row.parts.terminal}%, вопросы по коду ${row.parts.qna}%` +
        money(row.cost) +
        minutes(row.minutes)
      );
    if (cohort === 'intelligence') return evidenceText(row) + money(row.cost) + minutes(row.minutes);
    return evidenceText(row) + (NOTE[cohort] || '');
  }
  const other = criterion === 'Код и тесты' && evidenceFor(model).find(r => r.cohort === 'codingAgent');
  if (other) return `Измерено только в ${HARNESS[other.harness]}, не в этом подключении`;
  const relevant = p?.tasks?.includes(CRITERION_TASK[criterion]);
  return relevant
    ? 'Заявленная специализация; сравнительное качество не измерено'
    : 'Сравнительных данных нет';
}
