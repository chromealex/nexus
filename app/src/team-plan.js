import {routingAdvice, classifyTask, autoEffort} from './agent-catalog.js';
// Bounded team planner. Modes: 'single' (one agent), 'team' (always split) and 'auto'
// (split only composite requests while the model is chosen automatically).
// Every part is routed to the model that public tests rate best for that kind of work.
export const STAGE_KINDS = {
  reasoning: {
    title: 'Архитектура и решения',
    routingText: 'Анализ архитектуры и рассуждения',
    effort: 'high',
    prompt: 'архитектура, решения, расчёты и анализ',
  },
  code: {
    title: 'Код и тесты',
    routingText: 'Исправление и разработка кода',
    effort: 'high',
    prompt: 'написание и исправление кода, тесты',
  },
  webdev: {
    title: 'Веб-интерфейс',
    routingText: 'Разработка frontend React интерфейса',
    effort: 'high',
    prompt: 'веб-интерфейс, HTML/CSS/React',
  },
  review: {
    title: 'Независимая проверка',
    routingText: 'Анализ архитектуры, риски и тесты',
    effort: 'medium',
    prompt: 'независимая проверка другого этапа: риски, пограничные случаи, критерии приёмки',
  },
  writing: {
    title: 'Тексты и документация',
    routingText: 'Отредактируй и напиши текст документации',
    effort: 'medium',
    prompt: 'тексты, документация, перевод, редактура',
  },
  extraction: {
    title: 'Извлечение данных',
    routingText: 'Извлеки данные из таблицы PDF',
    effort: 'medium',
    prompt: 'извлечение данных из приложенных документов и таблиц',
    hasFiles: true,
  },
  visual: {
    title: 'Изображения',
    routingText: 'Анализ изображения',
    effort: 'medium',
    prompt: 'понимание приложенных изображений и скриншотов',
    hasImages: true,
  },
  tools: {
    title: 'Действия с инструментами',
    routingText: 'Обнови записи через сервисы',
    effort: 'medium',
    prompt: 'многошаговые действия с инструментами и внешними сервисами',
    execute: true,
  },
};
const native = m => ['codex', 'claude'].includes(m?.provider);
function normalizeMode(mode) {
  return mode === true ? 'team' : mode === false || mode == null ? 'single' : mode;
}
function items(text) {
  return text
    .split('\n')
    .map(line => line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/)?.[1])
    .filter(Boolean);
}
// In «Авто» only requests that consist of several parts are split; one call stays one call.
export function shouldDecompose(text, options = {}) {
  const list = items(text);
  if (list.length >= 2 && list.length <= 4) return true;
  if (frontAndBack(text)) return true;
  const task = classifyTask(text, !!options.hasFiles, {
    hasImages: !!options.hasImages,
    executionMode: options.executionMode,
  });
  return (
    task.complex &&
    (task.kind === 'code' || options.executionMode === 'execute' || options.executionMode === 'auto')
  );
}
function frontAndBack(text) {
  return (
    /(интерфейс|frontend|фронтенд|react|страниц)/i.test(text) &&
    /(backend|бэкенд|сервер|api|баз[аыу] данных)/i.test(text)
  );
}
// Kinds offered to the context planner: up to four, the most relevant first.
export function stageKinds(text, options = {}) {
  const task = classifyTask(text, !!options.hasFiles, {
    hasImages: !!options.hasImages,
    executionMode: options.executionMode,
  });
  const kinds = ['reasoning', task.webdev ? 'webdev' : 'code'];
  if (task.extraction) kinds.push('extraction');
  else if (options.hasImages) kinds.push('visual');
  else if ((options.executionMode === 'execute' || options.executionMode === 'auto') && task.kind !== 'code')
    kinds.push('tools');
  kinds.push('review');
  if (kinds.length < 4) kinds.push('writing');
  return kinds;
}
export function teamPlan(text, options, modeValue = 'single') {
  const mode = normalizeMode(modeValue);
  if (mode === 'single' || !text.trim()) return null;
  const scope = options.selection || 'auto',
    execute = options.executionMode === 'execute' || options.executionMode === 'auto',
    automatic = scope === 'auto' || scope.startsWith('agent-auto:'),
    autoDepth = (options.reasoningMode || 'auto') === 'auto';
  const models = options.models.filter(m => !m.provider.startsWith('custom-') && (!execute || native(m)));
  if (mode === 'auto') {
    // A manual model is one agent by definition; splitting needs at least two candidates.
    const candidates = models.filter(m => !m.unavailable);
    if (!automatic || new Set(candidates.map(m => m.id)).size < 2 || !shouldDecompose(text, options))
      return null;
  }
  const route = (routingText, extra = {}, pool = models) =>
    routingAdvice(routingText, {
      ...options,
      ...extra,
      models: pool,
      selection: scope,
      executionMode: extra.executionMode || (execute ? 'execute' : 'discuss'),
    });
  const list = items(text);
  let tasks = [],
    autoPlan = false;
  if (list.length >= 2 && list.length <= 4) {
    const preamble = text
      .split('\n')
      .filter(line => !/^\s*(?:[-*•]|\d+[.)])\s+/.test(line))
      .join('\n');
    tasks = list.map((item, i) => ({
      id: i + 1,
      title: item.slice(0, 100),
      assignment: item,
      routingText: item,
      prompt: `Контекст запроса: ${preamble}\nПодзадача: ${item}`,
      dependsOn: i ? [i] : [],
    }));
  } else if (frontAndBack(text)) {
    tasks = [
      {
        id: 1,
        title: 'Интерфейс и взаимодействие',
        routingText: 'Разработка frontend React интерфейса',
        prompt: `Разработай предложение по интерфейсу, компонентам и взаимодействию. Укажи требования к API. Запрос: ${text}`,
        dependsOn: [],
      },
      {
        id: 2,
        title: 'Сервер и контракт данных',
        routingText: 'Разработка кода серверной логики API',
        prompt: `Разработай предложение по серверной логике, данным и контракту API. Запрос: ${text}`,
        dependsOn: [],
      },
    ];
  } else {
    // Context planning: Nexus routes each kind of work to its best model first; the planner
    // (an extra model call) then splits the agreed task and labels each stage with a kind.
    autoPlan = true;
    const kinds = stageKinds(text, options);
    let codeProvider = null;
    for (const kind of kinds) {
      const k = STAGE_KINDS[kind];
      // An independent check is worth more from another provider when one is compatible.
      const others = models.filter(m => m.provider !== codeProvider);
      const pool = kind === 'review' && codeProvider && others.length ? others : models;
      const r = route(
        k.routingText,
        {
          hasFiles: k.hasFiles || options.hasFiles,
          hasImages: k.hasImages || options.hasImages,
          executionMode: k.execute ? 'execute' : undefined,
          effort: k.effort,
        },
        pool
      );
      if (!r.choice) continue;
      const model = models.find(m => m.id === r.choice);
      if (['code', 'webdev'].includes(kind)) codeProvider = model?.provider;
      tasks.push({
        id: tasks.length + 1,
        kind,
        title: k.title,
        routingText: k.routingText,
        prompt: `Исполнитель для этапов типа «${k.prompt}». Последний запрос: ${text}`,
        dependsOn: [],
        route: r,
        effort: autoDepth && native(model) ? r.effort || k.effort : null,
      });
    }
    if (tasks.length < 2)
      return mode === 'auto'
        ? null
        : {
            steps: tasks,
            error: 'Для разбиения нужны хотя бы два типа работ с совместимыми исполнителями.',
            autoPlan,
            reason: '',
          };
  }
  if (execute && !autoPlan) {
    tasks = tasks.map((t, i) => ({
      ...t,
      dependsOn: i ? [tasks[i - 1].id] : [],
      prompt: `Выполни назначенный этап в проекте, используя согласованный контекст истории. Этап: ${t.assignment || t.title}. Работай только над этим этапом. Последний запрос: ${text}. ${i ? 'Учитывай фактические результаты предыдущих этапов; не повторяй их работу.' : 'Реализуй только свою часть согласованной задачи; не расширяй её на невыбранные альтернативы из истории.'}`,
    }));
  }
  const steps = tasks.map(task => {
    let r = task.route;
    if (!r) {
      const effort = autoDepth ? autoEffort(task.routingText) : null;
      r = route(task.routingText, {effort});
    }
    const model = models.find(m => m.id === r.choice);
    const {route: _route, ...rest} = task;
    return {
      ...rest,
      modelChoice: r.choice || '',
      effort:
        task.effort !== undefined
          ? task.effort
          : autoDepth && native(model)
            ? r.effort || autoEffort(task.routingText)
            : null,
      reason: r.reason || r.error || r.warning,
      label: model?.label || '',
      error: !r.choice,
    };
  });
  const providers = new Set(
    steps.map(s => models.find(m => m.id === s.modelChoice)?.provider).filter(Boolean)
  );
  const error = steps.some(s => s.error)
    ? 'Для подзадач нет совместимого исполнителя. Нужен Codex, Claude или текстовый API; для файлов — нативный агент. Ручной выбор сохраняется.'
    : null;
  return {
    steps,
    error,
    autoPlan,
    mode,
    reason:
      (mode === 'auto'
        ? 'Авто: запрос состоит из нескольких частей, Nexus делит его между исполнителями. '
        : '') +
      (autoPlan
        ? 'Модель для каждого типа работ выбрана по тестам заранее; перед этапами агент разобьёт задачу на 2–4 части и отметит их тип. Это дополнительный модельный вызов. '
        : 'Каждая часть получает модель, лучшую для своего типа работы. ') +
      (providers.size === 1
        ? 'Все части достались одному провайдеру: роли выполняются его отдельными вызовами. '
        : '') +
      (execute
        ? 'Исполнители последовательно меняют проект по этапам, затем итоговый агент объединяет результаты и запускает проверки. Одновременно пишет только один агент. Каждый этап расходует квоту.'
        : 'Специалисты готовят предложения без изменений файлов. Итоговый агент объединяет их. До двух независимых подзадач одновременно. Каждый этап — отдельный модельный вызов.'),
  };
}
