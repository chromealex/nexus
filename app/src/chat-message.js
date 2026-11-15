import {appLocale, getLang, loc} from './i18n.js';
export function messageDate(value) {
  const old = String(value || '').match(/tv_sec:\s*(\d+)/);
  const date = new Date(old ? Number(old[1]) * 1000 : /^\d+$/.test(value || '') ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? null : date;
}
export function responseDetails(raw = '') {
  const rows = [],
    seen = new Map();
  let model = '',
    route = '',
    stopped = false,
    effort = '';
  const technical = [],
    routing = [];
  const add = (title, body = '', key = title) => {
    if (!seen.has(key)) {
      seen.set(key, rows.length);
      rows.push({title, body});
    } else if (body) {
      rows[seen.get(key)] = {title, body};
    }
  };
  for (const line of raw.split('\n')) {
    if (line.startsWith('Routing step: ')) {
      const [title, body = ''] = line.slice(14).split('|');
      routing.push({title, body});
      continue;
    }
    if (line.startsWith('Route: ')) {
      route = line.slice(7);
      continue;
    }
    if (line.startsWith('Model: ')) {
      if (!model) model = line.slice(7);
      continue;
    }
    if (line === 'Stopped: true') {
      stopped = true;
      continue;
    }
    if (line.startsWith('Effort: ')) {
      effort = line.slice(8);
      continue;
    }
    if (line.startsWith('Tier: ')) {
      continue;
    }
    if (line.startsWith('Nexus checks: ')) {
      add(loc('Проверки Nexus'), line.slice(14));
      continue;
    }
    if (line.startsWith('model: ')) {
      model = line.slice(7);
      continue;
    }
    let v;
    try {
      v = JSON.parse(line);
    } catch {
      if (line.trim()) technical.push(line);
      continue;
    }
    if (v.nexusReview) {
      add(loc('Независимый просмотр · локальный Qwen'), String(v.nexusReview));
      continue;
    }
    if (v.result?.model) model = v.result.model;
    const item = v.params?.item || v.item;
    if (item?.type === 'commandExecution' || item?.type === 'command_execution')
      add(
        loc('Выполнена команда'),
        [item.command, item.aggregatedOutput || item.aggregated_output].filter(Boolean).join('\n\n'),
        item.id
      );
    if (item?.type === 'fileChange' || item?.type === 'file_change')
      add(loc('Изменения файлов'), JSON.stringify(item.changes || [], null, 2), item.id);
    if (item?.type === 'mcpToolCall')
      add(loc('Вызван инструмент'), `${item.server || ''} · ${item.tool || ''}`, item.id);
    if (item?.type === 'webSearch') add(loc('Поиск в интернете'), item.query || '', item.id);
    if (v.type === 'system' && v.model) model = v.model;
    if (v.type === 'assistant')
      for (const c of v.message?.content || []) {
        if (c.type === 'tool_use')
          add(loc('Вызван инструмент: ') + c.name, JSON.stringify(c.input, null, 2), c.id);
      }
    if (v.method === 'turn/completed') add(loc('Ответ сформирован'));
  }
  if (route) rows.unshift({title: loc('Маршрут ответа'), body: route});
  if (effort) rows.unshift({title: loc('Режим рассуждений'), body: effortLabel(effort)});
  if (model && model !== 'default') rows.splice(route ? 1 : 0, 0, {title: loc('Модель'), body: model});
  // How the model was chosen comes first: it happened before the agent started.
  rows.unshift(...routing);
  if (stopped) {
    const completed = rows.findIndex(r => r.title === loc('Ответ сформирован'));
    if (completed >= 0) rows.splice(completed, 1);
    rows.push({title: loc('Генерация остановлена'), body: ''});
  } else if (!rows.some(r => r.title === loc('Ответ сформирован'))) add(loc('Ответ сформирован'));
  // Older CLI output remains available as a final disclosure, without exposing it by default.
  if (technical.length) rows.push({title: loc('Служебный журнал'), body: technical.join('\n')});
  return {model: model === 'default' ? loc('Модель по умолчанию') : model, route, effort, rows};
}

export function effortLabel(effort) {
  return (
    {
      low: loc('Быстро'),
      medium: loc('Обычно'),
      high: loc('Глубоко'),
      none: loc('Без рассуждений'),
      minimal: loc('Быстро'),
      xhigh: loc('Очень глубоко'),
      max: loc('Максимально'),
    }[effort] ||
    effort ||
    ''
  );
}
export function mergeContinuation(prefix, suffix) {
  if (!prefix) return suffix || '';
  if (!suffix) return prefix;
  if (suffix.startsWith(prefix)) return suffix;
  if (prefix.startsWith(suffix)) return prefix;
  const pattern = Array.from(suffix).slice(0, 16000),
    failure = Array(pattern.length).fill(0);
  let matched = 0;
  for (let i = 1; i < pattern.length; i++) {
    while (matched > 0 && pattern[i] !== pattern[matched]) matched = failure[matched - 1];
    if (pattern[i] === pattern[matched]) matched++;
    failure[i] = matched;
  }
  for (const ch of Array.from(prefix).slice(-16000)) {
    while (matched > 0 && (matched === pattern.length || pattern[matched] !== ch))
      matched = failure[matched - 1];
    if (matched < pattern.length && pattern[matched] === ch) matched++;
  }
  return (
    prefix +
    Array.from(suffix)
      .slice(matched >= 24 ? matched : 0)
      .join('')
  );
}

// Day separators in the chat history. Local calendar days; null for messages without a valid date.
export function dayKey(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : messageDate(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const MONTHS = [
  loc('января'),
  loc('февраля'),
  loc('марта'),
  loc('апреля'),
  loc('мая'),
  loc('июня'),
  loc('июля'),
  loc('августа'),
  loc('сентября'),
  loc('октября'),
  loc('ноября'),
  loc('декабря'),
];
export function dayLabel(value, now = new Date()) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : messageDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const key = dayKey(date),
    today = dayKey(now),
    yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (key === today) return loc('Сегодня');
  if (key === yesterday) return loc('Вчера');
  const otherYear = date.getFullYear() !== now.getFullYear();
  // Other languages: the platform knows the right order and month forms («November 14», «14 nov.», «11月14日»).
  if (getLang() !== 'ru')
    return date.toLocaleDateString(appLocale(), {
      day: 'numeric',
      month: 'long',
      ...(otherYear ? {year: 'numeric'} : {}),
    });
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${otherYear ? ' ' + date.getFullYear() : ''}`;
}
