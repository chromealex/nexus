import {loc} from './i18n.js';
// Audited public evidence, not Nexus trials. A CLI alias is matched only through the exact
// version the backend resolved from the official alias table (model.resolved).
export const BENCHMARK_DATE = '2026-11-14';
const AA = 'https://artificialanalysis.ai/';
export const COHORTS = {
  codingAgent: {
    name: 'AA Coding Agent Index v2.1',
    date: '2026-11-14',
    source: AA + 'agents/coding-agents',
    scale: 'points',
    limit: loc(
      'Модель вместе с агентом (Claude Code или Codex): изменения в реальных репозиториях, терминал и вопросы по коду. Переносится только на тот же агент.'
    ),
  },
  intelligence: {
    name: 'AA Intelligence Index v5.0.1',
    date: '2026-11-14',
    source: AA + 'methodology/intelligence-benchmarking',
    scale: 'points',
    limit: loc(
      'Смешанный набор из 9 агентных и научных оценок, включая код; не отдельная оценка архитектуры или исправления ошибок.'
    ),
  },
  automation: {
    name: 'AutomationBench-AA',
    date: '2026-11-10',
    source: AA + 'articles/announcing-zapier-automationbench-aa',
    scale: 'percent',
    limit: loc(
      'Бизнес-сценарии через API приложений (Zapier): доля целей, выполненных без нарушения ограничений. Не проверяет инструменты и разрешения Nexus.'
    ),
  },
  gdppdf: {
    name: loc('GDP.pdf (прогон AA)'),
    date: '2026-11-03',
    source: 'https://surgehq.ai/benchmarks/gdp-pdf',
    scale: 'percent',
    limit: loc(
      'Ответы по сложным профессиональным PDF (таблицы, формы, отчёты); засчитывается только полностью верный ответ. Не проверяет извлечение из баз данных или веб-страниц.'
    ),
  },
  webdev: {
    name: 'Arena WebDev',
    date: '2026-11-10',
    source: 'https://arena.ai/leaderboard/code/webdev',
    scale: 'elo',
    limit: loc('Предпочтения в веб-разработке; не доля пройденных тестов и не оценка любого кода.'),
  },
  text: {
    name: 'Arena Text Overall',
    date: '2026-11-09',
    source: 'https://arena.ai/leaderboard/chat/text',
    scale: 'elo',
    limit: loc(
      'Общие предпочтения пользователей; не отдельный тест перевода, русского языка или фактологии.'
    ),
  },
  vision: {
    name: 'Arena Vision Overall',
    date: '2026-11-08',
    source: 'https://arena.ai/leaderboard/chat/vision',
    scale: 'elo',
    limit: loc('Понимание изображений, не генерация изображений.'),
  },
};
export const BENCHMARKS = [];
const push = row => BENCHMARKS.push({fallback: false, ...row, date: row.date || COHORTS[row.cohort].date});
const aaPage = model => AA + 'models/' + model.replaceAll('.', '-');

// AA Intelligence Index v5.0.1: model, effort, index, first answer s, output tok/s,
// inference minutes/task, weighted API USD/task, Anthropic default fallback, snapshot date.
// Null is unknown, never zero.
for (const [model, effort, score, firstToken, outputSpeed, minutes, cost, fallback, date] of [
  ['claude-fable-5-2', 'max', 65, null, 97, 46.8, 26.54, true],
  ['claude-fable-5-2', 'xhigh', 62, null, 103, 26.2, 14.83, true],
  ['claude-fable-5-2', 'high', 62, null, 97, 16.9, 9.08, true],
  ['claude-fable-5-2', 'medium', 56, 12.22, 95, 7.5, 3.8, true],
  ['claude-fable-5-2', 'low', 54, 8.46, 99, 6.1, 3.1, true],
  ['claude-opus-5-5', 'max', 59, 353.75, 115, 25.2, 10.04, true],
  ['claude-opus-5-5', 'xhigh', 57, 79.4, 109, 15.8, null, true],
  ['claude-opus-5-5', 'high', 52, null, null, 9.5, null, true],
  ['claude-opus-5-5', 'medium', 48, 15.69, 103, 7.1, null, true],
  ['claude-opus-5-5', 'low', 35, null, null, 3.0, 0.98, true],
  ['claude-sonnet-5-5', 'max', 55, 254.92, 145, 32.7, 10.02, true, '2026-11-11'],
  ['claude-haiku-5-5', 'max', 36, null, null, null, 0.41, false],
  ['claude-haiku-5-5', 'xhigh', 35, 56.06, 233, 9.8, 0.25, false],
  ['claude-haiku-5-5', 'medium', 25, 11.14, 221, 4.0, 0.09, false],
  ['gpt-6-astra', 'max', 57, 249.02, 38, 23, 6.24],
  ['gpt-6-astra', 'xhigh', 55, null, null, null, 3.66],
  ['gpt-6-astra', 'high', 55, null, null, null, 3.24],
  ['gpt-6-astra', 'medium', 52, null, null, null, 2.73],
  ['gpt-6-astra', 'low', 43, null, null, 4.0, 1.42],
  ['gpt-6.1-sol', 'max', 55, 156.46, 55, 20.4, 1.27],
  ['gpt-6.1-sol', 'xhigh', 52, null, null, 9.2, 0.76],
  ['gpt-6.1-sol', 'high', 50, null, null, null, 0.59],
  ['gpt-6.1-sol', 'medium', 46, null, null, null, 0.36],
  ['gpt-6.1-sol', 'low', 35, null, null, 2.0, 0.16],
  ['gpt-6.1-terra', 'max', 51, 157.72, 74, 13.5, 0.96, false, '2026-11-11'],
  ['gpt-6-luna', 'max', 28, 81.37, 109, 11.5, 0.15, false, '2026-11-11'],
  ['gpt-6-sol', 'max', 44, 45.04, 121, 7.4, 2.47, false, '2026-11-11'],
  ['gpt-5.6-sol', 'max', null, 54.26, 96, null, null, false, '2026-11-11'],
  ['gpt-5.6-terra', 'max', 32, 72.23, 101, 10.9, 3.73, false, '2026-11-11'],
  ['gpt-5.6-luna', 'max', 24, 51.32, 114, 8.6, 0.33, false, '2026-11-11'],
  ['grok-4.5', 'high', null, 8.68, 72, null, null, false, '2026-11-11'],
  ['grok-4.6', 'high', null, 26.82, 68, null, null, false, '2026-11-11'],
  ['grok-4.7', 'xhigh', 35, 57.56, 63, 27.4, 7.77, false, '2026-11-11'],
])
  push({
    cohort: 'intelligence',
    model,
    effort,
    score,
    firstToken,
    outputSpeed,
    minutes,
    cost,
    fallback: !!fallback,
    date,
    source: aaPage(model),
  });

// AA Coding Agent Index v2.1 (FrontierCode-AA 2.0, Terminal-Bench 4.1, SWE-Atlas-QnA-AA, equal weights).
// harness = Nexus provider that runs the same agent; cost is pay-per-token API, not a subscription.
for (const [model, harness, effort, score, frontier, terminal, qna, cost, minutes, fallback] of [
  ['claude-fable-5-2', 'claude', 'xhigh', 58, 49, 64, 62, 15.47, 53.3, true],
  ['claude-fable-5-2', 'claude', 'high', 58, 49, 64, 62, 7.51, 31.3, true],
  ['claude-fable-5-2', 'claude', 'max', 56, 44, 63, 60, 44.22, 132, true],
  ['claude-fable-5-2', 'claude', 'medium', 53, 36, 60, 64, 2.89, 15.1, true],
  ['claude-fable-5-2', 'claude', 'low', 48, 31, 53, 60, 2.49, 13.4, true],
  ['claude-opus-5-5', 'claude', 'max', 58, 44, 65, 66, 12.61, 66, true],
  ['claude-sonnet-5-5', 'claude', 'max', 56, 39, 66, 64, 11.4, 84, true],
  ['claude-haiku-5-5', 'claude', 'max', 30, 23, 32, 34, 2.25, 78, false],
  ['gpt-6-astra', 'codex', 'max', 53, 43, 58, 59, 7.63, 26.0],
  ['gpt-6.1-sol', 'codex', 'max', 52, 42, 54, 60, 1.51, 21.9],
  ['gpt-6.1-terra', 'codex', 'max', 49, 41, 51, 54, 1.53, 28.1],
  ['gpt-6-luna', 'codex', 'max', 26, 24, 15, 38, 0.19, 23.5],
  ['grok-4.7', 'grok-build', 'xhigh', 42, 30, 32, 63, 15.35, 36.6],
])
  push({
    cohort: 'codingAgent',
    model,
    harness,
    effort,
    score,
    parts: {frontier, terminal, qna},
    cost,
    minutes,
    fallback: !!fallback,
    source:
      AA +
      'agents/coding-agents/comparisons/' +
      (harness === 'claude' ? 'claude-code-vs-opencode' : 'codex-vs-grok-build'),
  });

// AutomationBench-AA, best published effort. Mirrors of AA results with their capture dates.
const benchmarklist = 'https://benchmarklist.com/benchmarks/automationbench_aa/';
const benchgap = 'https://benchgap.net/b/aa-automation-bench/current';
for (const [model, effort, score, date, source, fallback] of [
  [
    'claude-fable-5-2',
    'max',
    76.4,
    '2026-11-10',
    'https://modelmenu.dev/benchmarks/automationbench-aa',
    true,
  ],
  ['claude-sonnet-5-5', 'max', 71.8, '2026-10-29', benchmarklist, true],
  ['claude-opus-5-5', 'max', 69.5, '2026-10-29', benchmarklist, true],
  ['gpt-6-astra', 'max', 68.5, '2026-10-29', benchmarklist],
  ['grok-4.6', 'unspecified', 66.7, '2026-10-10', benchgap],
  ['grok-4.7', 'xhigh', 65.6, '2026-10-29', benchmarklist],
  ['gpt-6.1-sol', 'max', 64.9, '2026-10-29', benchmarklist],
  ['gpt-6-sol', 'unspecified', 61.6, '2026-10-10', benchgap],
  ['gpt-6.1-terra', 'max', 60.2, '2026-10-29', benchmarklist],
])
  push({cohort: 'automation', model, effort, score, date, source, fallback: !!fallback, mirror: true});

// GDP.pdf as run by AA (all-pass %). Mirrors; effort given where the mirror lists it.
const benchleader = 'https://www.benchleader.com/benchmarks/aa_gdp_pdf';
const benchlm = 'https://benchlm.ai/benchmarks/aagdppdf';
for (const [model, effort, score, source, fallback] of [
  ['gpt-6-astra', 'unspecified', 32.2, benchleader],
  ['gpt-6.1-sol', 'high', 32.0, benchleader],
  ['gpt-6.1-sol', 'xhigh', 31.8, benchleader],
  ['gpt-6.1-sol', 'max', 31.0, benchleader],
  ['gpt-6.1-sol', 'medium', 30.0, benchleader],
  ['claude-opus-5-5', 'high', 28.8, benchleader, true],
  ['claude-opus-5-5', 'xhigh', 26.6, benchleader, true],
  ['claude-opus-5-5', 'max', 26.2, benchleader, true],
  ['claude-opus-5-5', 'medium', 25.6, benchleader, true],
  ['claude-opus-5-5', 'low', 25.6, benchleader, true],
  ['gpt-6.1-terra', 'max', 28.6, benchleader],
  ['gpt-5.6-sol', 'high', 27.8, benchleader],
  ['gpt-5.6-sol', 'medium', 26.2, benchleader],
  ['gpt-6-sol', 'max', 25.2, benchleader],
  ['claude-sonnet-5-5', 'unspecified', 25.8, benchlm, true],
  ['gpt-6-luna', 'unspecified', 22.8, benchlm],
  ['claude-haiku-5-5', 'unspecified', 20.8, benchlm],
  ['grok-4.7', 'unspecified', 20.0, benchlm],
])
  push({
    cohort: 'gdppdf',
    model,
    effort,
    score,
    source,
    fallback: !!fallback,
    mirror: true,
    date: source === benchlm ? '2026-11-05' : '2026-11-03',
  });

function arena(cohort, rows) {
  for (const [model, effort, score, interval] of rows)
    push({model, effort, score, interval, cohort, source: COHORTS[cohort].source});
}
arena('webdev', [
  ['claude-fable-5-2', 'xhigh', 1836, 22],
  ['claude-opus-5-5', 'max', 1814, 12],
  ['claude-sonnet-5-5', 'xhigh', 1773, 10],
  ['gpt-6-astra', 'max', 1764, 9],
  ['gpt-6.1-sol', 'max', 1743, 10],
  ['gpt-6.1-terra', 'max', 1679, 11],
  ['gpt-6-sol', 'max', 1673, 8],
  ['grok-4.7', 'xhigh', 1641, 8],
  ['grok-4.6', 'high', 1618, 7],
  ['claude-haiku-5-5', 'high', 1594, 9],
  ['gpt-6-luna', 'max', 1577, 6],
  ['grok-4.5', 'unspecified', 1552, 7],
]);
arena('text', [
  ['claude-opus-5-5', 'high', 1506, 6],
  ['gpt-5.6-sol', 'xhigh', 1485, 4],
  ['gpt-6.1-sol', 'max', 1482, 6],
  ['gpt-6-astra', 'max', 1474, 6],
  ['gpt-6-sol', 'max', 1457, 6],
  ['gpt-6-luna', 'max', 1441, 4],
]);
arena('vision', [
  ['claude-opus-5-5', 'high', 1295, 10],
  ['gpt-6.1-sol', 'max', 1293, 11],
  ['gpt-5.6-sol', 'xhigh', 1288, 7],
  ['gpt-6-astra', 'max', 1283, 9],
  ['grok-4.5', 'unspecified', 1280, 7],
  ['gpt-5.6-terra', 'xhigh', 1266, 7],
  ['grok-4.6', 'high', 1263, 8],
  ['claude-sonnet-5-5', 'xhigh', 1263, 10],
]);

const ALIAS_GAP = loc(
  'Плавающий алиас: точная версия не подтверждена (переопределение в настройках или другой провайдер).'
);
export const EVIDENCE_GAPS = {
  haiku: ALIAS_GAP,
  sonnet: ALIAS_GAP,
  opus: ALIAS_GAP,
  'gpt-reserve': loc('В проверенных публичных источниках нет сопоставимых результатов этой модели.'),
  'codex-auto-review': loc('Служебная модель; не участник сравнения чата.'),
  'grok-4.20-0309-reasoning': loc('AA публикует 0309 v2; соответствие этой версии каталогу не подтверждено.'),
  'grok-4.20-0309-non-reasoning': loc(
    'AA публикует 0309 v2; соответствие этой версии каталогу не подтверждено.'
  ),
  'grok-4.20-multi-agent-0309': loc(
    'Многоагентный режим требует отдельного адаптера и отдельного сравнения.'
  ),
  'grok-4.3': loc('Найденные старые результаты AA v4.3 не смешиваются с v5.0.1.'),
  'grok-build-0.1': loc('Есть спецификация производителя; сопоставимый тест точной версии не подтверждён.'),
  'gemini-3.1-flash-lite': loc(
    'Страница AA относится к preview; соответствие стабильной версии не подтверждено.'
  ),
  'qwen3:4b': loc(
    'Есть model card Qwen3-4B; квантование Ollama и скорость на этом Mac отдельно не измерены.'
  ),
};
// Exact ID used for evidence: the backend-resolved version of an alias, else the model ID itself.
export function benchmarkModel(model) {
  if (typeof model === 'string') return model;
  return model?.resolved || model?.model;
}
export function evidenceFor(model) {
  const id = benchmarkModel(model);
  return BENCHMARKS.filter(r => r.model === id);
}
export function evidenceGap(model) {
  const id = typeof model === 'string' ? model : model?.model;
  if (typeof model === 'object' && model?.resolvedNote && !model.resolved) return model.resolvedNote;
  return (
    EVIDENCE_GAPS[id] ||
    (/imagine/.test(id)
      ? loc('Медиа-модель: нет адаптера Nexus; оценки генерации не смешиваются с пониманием изображений.')
      : loc('Сопоставимых данных для этой задачи пока нет.'))
  );
}
export const HARNESS = {claude: 'Claude Code', codex: 'Codex', 'grok-build': 'Grok Build'};
export function evidenceText(r) {
  const unit = COHORTS[r.cohort].scale === 'percent' ? '%' : '';
  const score =
    r.score == null
      ? loc('оценка неизвестна')
      : `${r.score}${unit}${r.interval != null ? ' ± ' + r.interval : ''}`;
  return [
    `${COHORTS[r.cohort].name}: ${score}`,
    r.harness && loc('в ') + HARNESS[r.harness],
    r.effort === 'unspecified' ? loc('режим не указан') : r.effort,
    r.fallback && loc('с резервной моделью Anthropic по умолчанию'),
    r.mirror && loc('по зеркалу результатов'),
    r.date,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Public results are a prior, not a promise about the current runtime/effort.
export const ROUTING_PRIORITIES = {
  balanced: loc('Баланс'),
  quality: loc('Качество'),
  economy: loc('Экономия'),
  speed: loc('Скорость'),
};
// Which public test answers which kind of request. The first test that covers at least two
// compatible exact versions decides; the rest are fallbacks.
export function cohortsFor(task) {
  if (task.kind === 'visual') return ['vision'];
  if (task.kind === 'code') return ['codingAgent', ...(task.webdev ? ['webdev'] : []), 'intelligence'];
  if (task.kind === 'reasoning') return ['intelligence'];
  return [...(task.extraction ? ['gdppdf'] : []), ...(task.needsTools ? ['automation'] : []), 'text'];
}
const DAY = 86400000;
export function evidenceRow(model, cohort, {effort, records = BENCHMARKS, now = Date.now()} = {}) {
  const id = benchmarkModel(model);
  const rows = records.filter(
    r =>
      r.model === id &&
      r.cohort === cohort &&
      Number.isFinite(r.score) &&
      now - Date.parse(r.date) >= 0 &&
      now - Date.parse(r.date) < 90 * DAY &&
      (!r.harness || typeof model === 'string' || r.harness === model.provider) &&
      (!effort || r.effort === effort)
  );
  // Auto compares each model's best published mode; manual depth compares only the same mode.
  // Equal scores: prefer the published mode that finished faster, then the cheaper one.
  return rows.sort(
    (a, b) =>
      b.score - a.score ||
      (a.minutes ?? Infinity) - (b.minutes ?? Infinity) ||
      (a.cost ?? Infinity) - (b.cost ?? Infinity)
  )[0];
}
export function benchmarkChoice(
  models,
  task,
  {
    reasoningMode = 'auto',
    priority = 'balanced',
    now = Date.now(),
    records = BENCHMARKS,
    prices = {},
    preferEffort = null,
  } = {}
) {
  if (!ROUTING_PRIORITIES[priority]) priority = 'balanced';
  const effort = {fast: 'low', normal: 'medium', deep: 'high'}[reasoningMode];
  // Manual depth: only that mode. Auto: first the depth Nexus will actually run, then the best
  // published mode of each model when fewer than two models were measured at that depth.
  const efforts = effort ? [effort] : preferEffort ? [preferEffort, null] : [null];
  let cohort = null,
    usedEffort = null,
    candidates = [];
  search: for (const name of cohortsFor(task))
    for (const e of efforts) {
      const found = models.flatMap(model => {
        const evidence = evidenceRow(model, name, {effort: e, records, now});
        return evidence ? [{model, evidence}] : [];
      });
      if (new Set(found.map(c => benchmarkModel(c.model))).size >= 2) {
        cohort = name;
        usedEffort = e;
        candidates = found;
        break search;
      }
    }
  if (!cohort) return null;
  const depthNote = effort
    ? loc('Сравнение только при выбранной глубине ({0}). ', effort)
    : usedEffort
      ? loc('Сравнение при той глубине, с которой будет выполнен запрос ({0}). ', usedEffort)
      : preferEffort
        ? loc(
            'Для глубины {0} сопоставимых данных нет; сравнены лучшие опубликованные режимы. ',
            preferEffort
          )
        : '';
  const elo = COHORTS[cohort].scale === 'elo';
  candidates.sort((a, b) => b.evidence.score - a.evidence.score || a.model.id.localeCompare(b.model.id));
  const best = candidates[0].evidence;
  const close = candidates.filter(c =>
    elo
      ? c.evidence.score + (c.evidence.interval || 0) >= best.score - (best.interval || 0)
      : c.evidence.score >= best.score - (priority === 'quality' ? 0 : 3)
  );
  const api = c => c.model.provider.startsWith('api-');
  const tariff = c => {
    const p = prices[benchmarkModel(c.model)];
    return Number.isFinite(p?.input) && Number.isFinite(p?.output) ? p.input * 0.01 + p.output * 0.002 : null;
  };
  const cost = c =>
    !api(c)
      ? null
      : cohort === 'intelligence'
        ? (c.evidence.cost ?? null)
        : cohort === 'codingAgent'
          ? null
          : tariff(c);
  const time = c => c.evidence.minutes ?? null;
  let pool = close,
    metric = null,
    explanation = loc(
      'Близкие оценки не доказывают превосходство; при отсутствии сопоставимой цены и скорости используется стабильный ID.'
    );
  const complete = (rows, fn) => rows.every(c => Number.isFinite(fn(c)));
  if (priority === 'economy' && complete(candidates, cost)) {
    pool = candidates;
    metric = cost;
    explanation = loc('Минимальный известный API-расход среди оценённых моделей; качество может быть ниже.');
  } else if (priority === 'speed' && complete(candidates, time)) {
    pool = candidates;
    metric = time;
    explanation = loc('Минимальное время задачи в том же тесте; качество может быть ниже.');
  } else if (close.length === 1) {
    explanation = loc('Лучший результат в этом тесте с отрывом больше допуска.');
  } else if (complete(close, cost)) {
    metric = cost;
    explanation = loc('Среди близких по качеству вариантов выбран меньший API-расход.');
  } else if (complete(close, time)) {
    metric = time;
    explanation = loc('Среди близких по качеству вариантов выбрано меньшее время задачи в тесте.');
  }
  if (
    (priority === 'economy' && !complete(candidates, cost)) ||
    (priority === 'speed' && !complete(candidates, time))
  )
    explanation =
      loc('Приоритет не удалось полностью применить: сопоставимые данные неполны. ') + explanation;
  pool = [...pool].sort(
    (a, b) => (metric ? metric(a) - metric(b) : 0) || a.model.id.localeCompare(b.model.id)
  );
  const chosen = pool[0];
  const describe = c => ({
    id: c.model.id,
    label: c.model.label || c.model.model,
    quality: evidenceText(c.evidence),
    cost: cost(c),
    costLabel:
      cohort === 'intelligence'
        ? loc('API $/задачу AA')
        : loc('API $ за 10 тыс. входных + 2 тыс. выходных токенов'),
    minutes: time(c),
    note:
      c === chosen
        ? loc('Выбрана')
        : close.includes(c)
          ? loc('Близкая оценка; превосходство не установлено')
          : loc('Вне группы близких оценок'),
  });
  const alternatives = candidates
    .filter(c => c.model.id !== chosen.model.id)
    .slice(0, 2)
    .map(describe);
  for (const model of models) {
    if (alternatives.length >= 2) break;
    if (model.id !== chosen.model.id && !candidates.some(c => c.model.id === model.id))
      alternatives.push({
        id: model.id,
        label: model.label || model.model,
        quality: loc('Нет сопоставимой оценки'),
        cost: null,
        minutes: null,
        note: evidenceGap(model),
      });
  }
  const tolerance =
    !elo && priority !== 'quality'
      ? loc(
          'Допуск баланса — 3 {0}: правило продукта, не статистическая погрешность. ',
          COHORTS[cohort].scale === 'percent' ? loc('п.п.') : loc('балла')
        )
      : '';
  const alias = chosen.model.resolved
    ? loc('«{0}» сопоставлен с {1}. ', chosen.model.model, chosen.model.resolved)
    : '';
  return {
    ...chosen,
    cohort,
    effort: usedEffort,
    comparison: [describe(chosen), ...alternatives],
    coverage: loc(
      '{0} из {1}',
      new Set(candidates.map(c => benchmarkModel(c.model))).size,
      new Set(models.map(benchmarkModel)).size
    ),
    reason: loc(
      '{0}. {1} {2}Ориентир: {3}. {4}{5} {6} Стоимость подписки неизвестна; API-цена не равна цене успешного запроса.',
      ROUTING_PRIORITIES[priority],
      explanation,
      depthNote,
      evidenceText(chosen.evidence),
      alias,
      COHORTS[cohort].limit,
      tolerance
    ),
  };
}
